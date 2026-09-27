/// <reference types="@cloudflare/workers-types" />
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { z } from "zod";

export interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  INVITATION_CODE: string;
}
const DAY = 86400000;
const key = z.string().regex(/^[A-Za-z0-9_-]+$/);
export function validPushEndpoint(value: string) {
  try {
    const u = new URL(value),
      h = u.hostname;
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      (h === "fcm.googleapis.com" ||
        h === "web.push.apple.com" ||
        h.endsWith(".push.apple.com") ||
        h === "updates.push.services.mozilla.com" ||
        h.endsWith(".push.services.mozilla.com") ||
        h.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export const subscriptionSchema = z
  .object({
    endpoint: z.string().max(4096).refine(validPushEndpoint),
    expirationTime: z.number().nullable().default(null),
    keys: z.object({ p256dh: key.length(87), auth: key.length(22) }).strict(),
  })
  .strict();
const noticeSchema = z
  .object({
    id: z.string().min(1).max(240),
    at: z.iso.datetime({ offset: true }),
    title: z.string().min(1).max(240),
    body: z.string().max(2000),
    url: z.literal("#home"),
  })
  .strict();
export function parseSchedule(input: unknown, now: number) {
  const data = z
    .object({
      schedule: z.array(noticeSchema).max(60),
      subscription: subscriptionSchema,
    })
    .strict()
    .parse(input);
  if (new Set(data.schedule.map((n) => n.id)).size !== data.schedule.length)
    throw new Error("duplicate");
  for (const n of data.schedule) {
    const at = Date.parse(n.at);
    if (
      at > now + 15 * DAY ||
      at < now - 5 * 60000 ||
      new TextEncoder().encode(JSON.stringify(n)).length > 3900
    )
      throw new Error("invalid schedule");
  }
  return data;
}
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
async function equalSecret(a: string, b: string) {
  const x = await digest(a),
    y = await digest(b);
  let result = 0;
  for (let i = 0; i < x.length; i++)
    result |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return result === 0;
}
function token() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
async function identity(req: Request, env: Env) {
  const id = req.headers.get("X-Device-Id") ?? "",
    secret = req.headers.get("Authorization")?.replace(/^Bearer /, "") ?? "";
  if (!/^[\w-]{36}$/.test(id) || secret.length !== 64) return null;
  const row = await env.DB.prepare(
    "SELECT id, token_hash FROM devices WHERE id = ?",
  )
    .bind(id)
    .first<{ id: string; token_hash: string }>();
  return row && (await equalSecret(await digest(secret), row.token_hash))
    ? { id, token: secret }
    : null;
}
async function readJSON(req: Request) {
  if (!req.headers.get("Content-Type")?.startsWith("application/json"))
    throw new Error("content type");
  // Limit the streamed body as well as Content-Length (which can be absent).
  const reader = req.body?.getReader();
  if (!reader) throw new Error("body");
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 250000) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleRequest(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get("Origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (origin !== env.ALLOWED_ORIGIN) return reply({ error: "origin" }, 403);
  headers["Access-Control-Allow-Origin"] = origin;
  headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
  headers["Access-Control-Allow-Headers"] =
    "Authorization, Content-Type, X-Device-Id, X-Invitation";
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  const path = new URL(req.url).pathname;
  if (path === "/config" && req.method === "GET")
    return env.VAPID_PUBLIC_KEY
      ? reply({ publicKey: env.VAPID_PUBLIC_KEY })
      : reply({ error: "not configured" }, 503);
  try {
    if (path === "/device" && req.method === "POST") {
      const existing = await identity(req, env);
      if (
        !existing &&
        (!env.INVITATION_CODE ||
          !(await equalSecret(
            req.headers.get("X-Invitation") ?? "",
            env.INVITATION_CODE,
          )))
      )
        return reply({ error: "invitation" }, 403);
      const { subscription } = z
        .object({ subscription: subscriptionSchema })
        .strict()
        .parse(await readJSON(req));
      const device = existing ?? { id: crypto.randomUUID(), token: token() };
      await env.DB.prepare(
        "INSERT INTO devices(id, token_hash, subscription, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET subscription=excluded.subscription, updated_at=excluded.updated_at",
      )
        .bind(
          device.id,
          await digest(device.token),
          JSON.stringify(subscription),
          Date.now(),
        )
        .run();
      return reply({ deviceId: device.id, token: device.token });
    }
    const device = await identity(req, env);
    if (!device) return reply({ error: "unauthorized" }, 401);
    if (path === "/device" && req.method === "DELETE") {
      await env.DB.prepare("DELETE FROM devices WHERE id = ?")
        .bind(device.id)
        .run();
      return reply({ ok: true });
    }
    if (path === "/schedule" && req.method === "PUT") {
      const now = Date.now(),
        { schedule, subscription } = parseSchedule(await readJSON(req), now);
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE devices SET subscription = ?, updated_at = ? WHERE id = ?",
        ).bind(JSON.stringify(subscription), now, device.id),
        env.DB.prepare("DELETE FROM notifications WHERE device_id = ?").bind(
          device.id,
        ),
        ...schedule
          .filter((n) => Date.parse(n.at) > now)
          .map((n) =>
            env.DB.prepare(
              "INSERT INTO notifications(device_id, id, at, payload, next_at) VALUES (?, ?, ?, ?, ?)",
            ).bind(
              device.id,
              n.id,
              Date.parse(n.at),
              JSON.stringify(n),
              Date.parse(n.at),
            ),
          ),
      ]);
      return reply({ ok: true, count: schedule.length });
    }
    return reply({ error: "not found" }, 404);
  } catch (error) {
    return reply(
      {
        error:
          error instanceof z.ZodError ||
          error instanceof SyntaxError ||
          (error instanceof Error &&
            [
              "duplicate",
              "invalid schedule",
              "content type",
              "body",
              "too large",
            ].includes(error.message))
            ? "invalid request"
            : "service unavailable",
      },
      error instanceof z.ZodError ||
        error instanceof SyntaxError ||
        (error instanceof Error &&
          [
            "duplicate",
            "invalid schedule",
            "content type",
            "body",
            "too large",
          ].includes(error.message))
        ? 400
        : 503,
    );
  }
}
export function retryDelay(attempts: number) {
  return Math.min(30 * 60000, 60000 * 2 ** attempts);
}
export async function deliver(
  env: Env,
  now = Date.now(),
  send: typeof fetch = fetch,
) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  await env.DB.batch([
    env.DB.prepare("DELETE FROM devices WHERE updated_at < ?").bind(
      now - 45 * DAY,
    ),
    env.DB.prepare(
      "DELETE FROM notifications WHERE at < ? OR attempts >= 5",
    ).bind(now - 3600000),
  ]);
  // An atomic lease prevents two cron invocations from sending the same row concurrently.
  const claimed = await env.DB.prepare(
    "UPDATE notifications SET lease_until = ? WHERE rowid IN (SELECT rowid FROM notifications WHERE next_at <= ? AND lease_until < ? LIMIT 10) RETURNING device_id, id, payload, attempts, at",
  )
    .bind(now + 120000, now, now)
    .all<{
      device_id: string;
      id: string;
      payload: string;
      attempts: number;
      at: number;
    }>();
  for (const row of claimed.results) {
    const device = await env.DB.prepare(
      "SELECT subscription FROM devices WHERE id = ?",
    )
      .bind(row.device_id)
      .first<{ subscription: string }>();
    if (!device) continue;
    const stillCurrent = await env.DB.prepare(
      "SELECT id FROM notifications WHERE device_id = ? AND id = ? AND lease_until = ?",
    )
      .bind(row.device_id, row.id, now + 120000)
      .first();
    if (!stillCurrent) continue;
    try {
      const subscription = subscriptionSchema.parse(
        JSON.parse(device.subscription),
      );
      const payload = await buildPushPayload(
        { data: row.payload, options: { ttl: 900 } },
        subscription,
        {
          subject: env.VAPID_SUBJECT,
          publicKey: env.VAPID_PUBLIC_KEY,
          privateKey: env.VAPID_PRIVATE_KEY,
        },
      );
      const response = await send(subscription.endpoint, {
        ...payload,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 404 || response.status === 410)
        await env.DB.prepare("DELETE FROM devices WHERE id = ?")
          .bind(row.device_id)
          .run();
      else if (
        response.ok ||
        response.status === 400 ||
        response.status === 413
      )
        await env.DB.prepare(
          "DELETE FROM notifications WHERE device_id = ? AND id = ? AND lease_until = ?",
        )
          .bind(row.device_id, row.id, now + 120000)
          .run();
      else throw new Error("push unavailable");
    } catch {
      await env.DB.prepare(
        "UPDATE notifications SET attempts = attempts + 1, next_at = ?, lease_until = 0 WHERE device_id = ? AND id = ? AND lease_until = ?",
      )
        .bind(
          now + retryDelay(row.attempts),
          row.device_id,
          row.id,
          now + 120000,
        )
        .run();
    }
  }
}
export default {
  fetch: handleRequest,
  scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(deliver(env));
  },
};
