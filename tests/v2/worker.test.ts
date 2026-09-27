import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  handleRequest,
  deliver,
  parseSchedule,
  validPushEndpoint,
  type Env,
} from "../../worker/index";
class LocalD1 {
  db = new DatabaseSync(":memory:");
  constructor() {
    this.db.exec(
      readFileSync(new URL("../../worker/schema.sql", import.meta.url), "utf8"),
    );
  }
  prepare(sql: string) {
    const query = this.db.prepare(sql);
    let values: (string | number)[] = [];
    const stmt = {
      bind: (...args: (string | number)[]) => {
        values = args;
        return stmt;
      },
      first: async () => query.get(...values) ?? null,
      all: async () => ({ results: query.all(...values) }),
      run: async () => query.run(...values),
    };
    return stmt;
  }
  async batch(queries: ReturnType<LocalD1["prepare"]>[]) {
    this.db.exec("BEGIN");
    try {
      const result = [];
      for (const query of queries) result.push(await query.run());
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
const origin = "https://taiyo0515.github.io";
async function keys() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return {
    publicKey: Buffer.from(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    ).toString("base64url"),
    privateKey: jwk.d!,
  };
}
async function fixture() {
  const db = new LocalD1(),
    k = await keys(),
    client = await keys();
  const env = {
    DB: db as unknown as D1Database,
    ALLOWED_ORIGIN: origin,
    VAPID_SUBJECT: "https://example.com",
    VAPID_PUBLIC_KEY: k.publicKey,
    VAPID_PRIVATE_KEY: k.privateKey,
    INVITATION_CODE: "test-invitation",
  };
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    expirationTime: null,
    keys: {
      p256dh: client.publicKey,
      auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
        "base64url",
      ),
    },
  };
  const request = (
    path: string,
    method = "GET",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    handleRequest(
      new Request(`https://worker.example${path}`, {
        method,
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          ...headers,
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      env,
    );
  const response = await request(
    "/device",
    "POST",
    { subscription },
    { "X-Invitation": env.INVITATION_CODE },
  );
  assert.equal(response.status, 200);
  const device = (await response.json()) as { deviceId: string; token: string },
    auth = {
      "X-Device-Id": device.deviceId,
      Authorization: `Bearer ${device.token}`,
    };
  return { db, env, subscription, request, device, auth };
}
test("通知サーバー: CORS・招待・端末認可・他端末拒否・予定全置換・削除", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request("/config")).status, 200);
    assert.equal(
      (await f.request("/device", "POST", { subscription: f.subscription }))
        .status,
      403,
    );
    assert.equal(
      (
        await f.request(
          "/schedule",
          "PUT",
          {},
          { ...f.auth, Authorization: `Bearer ${"x".repeat(64)}` },
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await f.request("/config", "GET", undefined, {
          Origin: "https://attacker.example",
        })
      ).status,
      403,
    );
    const schedule = [
      {
        id: "event:morning",
        at: new Date(Date.now() + 600000).toISOString(),
        title: "朝の準備",
        body: "自宅から鍵",
        url: "#home",
      },
    ];
    assert.equal(
      (
        await f.request(
          "/schedule",
          "PUT",
          { subscription: f.subscription, schedule },
          f.auth,
        )
      ).status,
      200,
    );
    assert.equal(
      (await f.db.prepare("SELECT * FROM notifications").all()).results.length,
      1,
    );
    assert.equal(
      (
        await f.request(
          "/schedule",
          "PUT",
          { subscription: f.subscription, schedule: [] },
          f.auth,
        )
      ).status,
      200,
    );
    assert.equal(
      (await f.db.prepare("SELECT * FROM notifications").all()).results.length,
      0,
    );
    await f.request("/device", "DELETE", undefined, f.auth);
    assert.equal((await f.request("/schedule", "PUT", {}, f.auth)).status, 401);
  } finally {
    f.db.db.close();
  }
});
test("通知サーバー: 任意のURLへの送信・巨大/遠い予約を拒否", async () => {
  const f = await fixture();
  try {
    for (const value of [
      "http://fcm.googleapis.com/x",
      "https://127.0.0.1",
      "https://fcm.googleapis.com.attacker.example",
      "https://a@fcm.googleapis.com/x",
    ])
      assert.equal(validPushEndpoint(value), false);
    const n = {
      id: "a",
      at: new Date(Date.now() + 86400000).toISOString(),
      title: "a",
      body: "漢".repeat(1800),
      url: "#home",
    };
    assert.throws(() =>
      parseSchedule(
        { subscription: f.subscription, schedule: [n] },
        Date.now(),
      ),
    );
    assert.throws(() =>
      parseSchedule(
        {
          subscription: f.subscription,
          schedule: [
            {
              ...n,
              body: "",
              at: new Date(Date.now() + 16 * 86400000).toISOString(),
            },
          ],
        },
        Date.now(),
      ),
    );
  } finally {
    f.db.db.close();
  }
});
test("通知サーバー: 暗号化した配信・再試行・重複防止・410の購読削除", async () => {
  const f = await fixture();
  try {
    const now = Date.now() + 60000,
      notice = {
        id: "notice",
        at: new Date(now).toISOString(),
        title: "準備",
        body: "鍵",
        url: "#home",
      };
    await f.request(
      "/schedule",
      "PUT",
      { subscription: f.subscription, schedule: [notice] },
      f.auth,
    );
    let calls = 0;
    const send = (async (_url: unknown, init?: RequestInit) => {
      calls++;
      assert.equal(
        (init?.headers as Record<string, string>)["content-encoding"],
        "aes128gcm",
      );
      return new Response("", { status: calls === 1 ? 503 : 201 });
    }) as typeof fetch;
    await deliver(f.env, now + 1, send);
    assert.equal(calls, 1);
    assert.equal(
      (await f.db.prepare("SELECT attempts FROM notifications").first())
        ?.attempts,
      1,
    );
    await deliver(f.env, now + 2, send);
    assert.equal(calls, 1);
    await deliver(f.env, now + 60002, send);
    assert.equal(calls, 2);
    assert.equal(
      (await f.db.prepare("SELECT * FROM notifications").all()).results.length,
      0,
    );
    await f.request(
      "/schedule",
      "PUT",
      { subscription: f.subscription, schedule: [notice] },
      f.auth,
    );
    await deliver(
      f.env,
      now + 1,
      (async () => new Response("", { status: 410 })) as typeof fetch,
    );
    assert.equal(
      (await f.db.prepare("SELECT * FROM devices").all()).results.length,
      0,
    );
    assert.equal(
      (await f.db.prepare("SELECT * FROM notifications").all()).results.length,
      0,
    );
  } finally {
    f.db.db.close();
  }
});
