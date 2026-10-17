// Importing calendar data from other sources (Google Calendar, TimeTree, the device calendar).
import { stamp } from "../core/date";
import { parseIcs } from "../core/ics";
import type { IcsEvent } from "../core/ics";
import type { Dto } from "../core/import";
import type { Repeat } from "../core/model";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

/** One request through the worker's relay. The invitation code protects it. */
async function relay(url: string, cookie: string | null, invitation: string): Promise<string> {
  const base = (import.meta.env.VITE_PUSH_URL as string | undefined) ?? "";
  if (!base) throw new Error("通知サーバーが設定されていません");
  const origin = new URL(base).origin;
  const res = await fetch(`${origin}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Invitation": invitation },
    body: JSON.stringify({ url, cookie }),
  });
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok)
    throw new Error(
      body.error === "invitation"
        ? "取り込みコードが違います"
        : body.error === "forbidden"
          ? "そのURLは取り込めません"
          : "取り込みサーバーでエラーが起きました",
    );
  return body.text ?? "";
}

/** Google Calendar's 秘密のiCal address → events. */
export async function fetchGoogle(url: string, invitation: string): Promise<IcsEvent[]> {
  const trimmed = url.trim();
  if (!/^https:\/\/calendar\.google\.com\/calendar\/ical\/[^/]+\/[^/]+\/basic\.ics$/i.test(trimmed))
    throw new Error("秘密のiCalアドレス（…/basic.ics）を貼り付けてください");
  return parseIcs(await relay(trimmed, null, invitation));
}

export interface SourceCalendar {
  id: string;
  name: string;
}

const pick = (v: unknown, ...keys: string[]) => {
  for (const k of keys) if (v && typeof v === "object" && k in v) return (v as Record<string, unknown>)[k];
  return undefined;
};

/** TimeTree's web endpoints, session cookie provided by the user. */
async function tt(path: string, cookie: string, invitation: string): Promise<unknown> {
  const text = await relay(`https://timetreeapp.com/api/v1${path}`, cookie, invitation);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("TimeTreeの応答を読めません（サインインの Cookie を確認してください）");
  }
}

export async function timeTreeCalendars(cookie: string, invitation: string): Promise<SourceCalendar[]> {
  const body = await tt("/calendars", cookie, invitation);
  const items = (pick(body, "data", "calendars") as unknown[] | undefined) ?? [];
  return items.map((c) => ({
    id: String(pick(c, "id") ?? pick(pick(c, "data"), "id") ?? ""),
    name: String(pick(pick(c, "attributes"), "name") ?? pick(pick(pick(c, "data"), "attributes"), "name") ?? "カレンダー"),
  }));
}

const localStamp = (iso: string): string | null => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? stamp(d) : null;
};

/** TimeTree all-day events: UTC midnights, the last day inclusive. */
function allDayDto(startRaw: string, endRaw: string): { start: string; end: string | null } {
  const first = startRaw.slice(0, 10);
  const last = endRaw.slice(0, 10);
  return {
    start: `${first}T00:00`,
    end: first === last ? null : `${addDaysUtc(first, 1)}T00:00`,
  };
}
const addDaysUtc = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function repeatOf(a: Record<string, unknown>): Repeat | null {
  // TimeTree's recurrence shape is undocumented; map what we can, otherwise no repeat.
  const r = (pick(a, "recur", "recurrence", "recurring") as Record<string, unknown> | undefined) ?? null;
  if (!r) return null;
  const type = String(pick(r, "type", "pattern", "rule") ?? "").toLowerCase();
  if (type.includes("daily")) return { freq: "daily", weekdays: [], until: null };
  if (type.includes("weekly") || type.includes("wday")) {
    const raw = pick(r, "days_of_week", "weekdays", "days");
    const list = Array.isArray(raw) ? raw : [];
    const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const weekdays = [
      ...new Set(
        list.map((v) => (typeof v === "number" ? v : map[String(v).toLowerCase().slice(0, 3)])).filter((d) => d !== undefined && typeof d === "number"),
      ),
    ];
    if (!weekdays.length) return null;
    return { freq: "weekly", weekdays, until: null };
  }
  if (type.includes("monthly")) return { freq: "monthly", weekdays: [], until: null };
  return null;
}

function ttToDto(raw: unknown): Dto | null {
  const node = ((pick(raw, "data") ?? raw) ?? {}) as Record<string, unknown>;
  const id = String(pick(node, "uuid", "id") ?? "");
  const a = (pick(node, "attributes") as Record<string, unknown> | undefined) ?? node;
  const title = String(pick(a, "title") ?? "").trim() || "無題";
  const allDay = Boolean(pick(a, "all_day"));
  const startRaw = String(pick(a, "start_at") ?? "");
  if (!id || !startRaw) return null;
  let start: string;
  let end: string | null;
  if (allDay) {
    const day = allDayDto(startRaw, String(pick(a, "end_at") ?? startRaw));
    start = day.start;
    end = day.end;
  } else {
    start = localStamp(startRaw) ?? "";
    end = String(pick(a, "end_at") ?? "") ? (localStamp(String(pick(a, "end_at"))) ?? null) : null;
  }
  if (!start) return null;
  const location = String(pick(a, "location") ?? "").trim();
  const description = String(pick(a, "description") ?? "").trim();
  return {
    uid: id,
    title,
    start,
    end,
    allDay,
    memo: location || description ? [location, description].filter(Boolean).join("\n") : "",
    repeat: repeatOf(a),
    gone: [],
    edits: [],
  };
}

export async function timeTreeEvents(cookie: string, calendarId: string, invitation: string): Promise<Dto[]> {
  const out: Dto[] = [];
  let cursor = "0";
  for (let page = 0; page < 100; page++) {
    const body = await tt(`/calendar/${encodeURIComponent(calendarId)}/events/sync?since=${cursor}`, cookie, invitation);
    const items = (pick(body, "events") as unknown[] | undefined) ?? [];
    for (const raw of items) {
      const d = ttToDto(raw);
      if (d) out.push(d);
    }
    const next = pick(body, "sync_cursor", "cursor", "next_since", "next");
    if (typeof next === "string" && next && next !== cursor) cursor = next;
    else break;
  }
  return out;
}
