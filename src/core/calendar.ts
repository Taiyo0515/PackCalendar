import { addDays, addMinutes, daysBetween, minutesBetween, weekday } from "./date";
import type { Event, Occurrence, Patch, Plan, State } from "./model";

export const occKey = (eventId: string, day: string) => `${eventId}@${day}`;

/** End used for overlap checks. Events without end occupy their start minute. */
export function endOf(e: Pick<Event, "start" | "end" | "allDay">) {
  if (e.end) return e.end;
  return e.allDay ? `${addDays(e.start, 1)}T00:00` : addMinutes(e.start, 1);
}

function hits(e: Event, day: string) {
  const first = e.start.slice(0, 10);
  if (day < first) return false;
  if (!e.repeat) return day === first;
  if (e.repeat.until && day > e.repeat.until) return false;
  if (e.repeat.freq === "daily") return true;
  if (e.repeat.freq === "weekly") return e.repeat.weekdays.includes(weekday(day));
  return day.slice(8) === first.slice(8);
}

export function occurrenceOf(s: State, e: Event, day: string): Occurrence | null {
  const key = occKey(e.id, day);
  const x = s.exceptions[key];
  if (x?.deleted) return null;
  const length = e.end ? minutesBetween(e.start, e.end) : 0;
  const start = `${day}${e.start.slice(10)}`;
  const base: Occurrence = {
    ...e,
    start,
    end: e.end ? addMinutes(start, length) : null,
    key,
    baseId: e.id,
    date: day,
  };
  if (!x) return base;
  const { plan, ...rest } = x.patch;
  return { ...base, ...rest, plan: { ...base.plan, ...plan } };
}

/** Occurrences overlapping [from, to) days, sorted (all-day first, then time). */
export function occurrences(s: State, from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  const lo = `${from}T00:00`,
    hi = `${to}T00:00`;
  for (const e of s.events) {
    const span = e.end ? Math.max(0, daysBetween(e.start, e.end)) : 0;
    const first = e.start.slice(0, 10);
    let day = addDays(from, -span);
    if (day < first) day = first;
    const seen = new Set<string>();
    const push = (d: string) => {
      if (seen.has(d)) return;
      seen.add(d);
      const o = occurrenceOf(s, e, d);
      if (o && o.start < hi && endOf(o) > lo) out.push(o);
    };
    if (!e.repeat) push(first);
    else {
      const last = e.repeat.until && e.repeat.until < to ? addDays(e.repeat.until, 1) : to;
      for (; day < last; day = addDays(day, 1)) if (hits(e, day)) push(day);
    }
    // An exception may move an occurrence into range from outside the scan.
    for (const k of Object.keys(s.exceptions))
      if (k.startsWith(`${e.id}@`)) {
        const d = k.slice(e.id.length + 1);
        if (hits(e, d)) push(d);
      }
  }
  return out.sort(compareOcc);
}
export const compareOcc = (a: Occurrence, b: Occurrence) =>
  a.start.slice(0, 10).localeCompare(b.start.slice(0, 10)) ||
  Number(b.allDay) - Number(a.allDay) ||
  a.start.localeCompare(b.start) ||
  a.title.localeCompare(b.title);

/** Occurrences shown on a given day. */
export const onDay = (s: State, day: string) =>
  occurrences(s, day, addDays(day, 1));

export function findOccurrence(s: State, key: string) {
  const at = key.lastIndexOf("@");
  const e = s.events.find((x) => x.id === key.slice(0, at));
  return e ? occurrenceOf(s, e, key.slice(at + 1)) : null;
}

export type EventDraft = Omit<Event, "id">;

/** Saves a whole event (new or replacing all occurrences). */
export function saveEvent(s: State, id: string, draft: EventDraft) {
  const i = s.events.findIndex((e) => e.id === id);
  const next: Event = { id, ...draft };
  if (i < 0) {
    s.events.push(next);
    return;
  }
  const old = s.events[i];
  // Editing "all" keeps the series' first date and applies the new time and length.
  if (old.repeat && next.repeat) {
    const first = old.start.slice(0, 10);
    const length = next.end ? minutesBetween(next.start, next.end) : null;
    next.start = `${first}${next.start.slice(10)}`;
    next.end = length === null ? null : addMinutes(next.start, length);
  }
  s.events[i] = next;
  // Drop exceptions no longer on the series.
  for (const k of Object.keys(s.exceptions))
    if (k.startsWith(`${id}@`) && !hits(next, k.slice(id.length + 1)))
      delete s.exceptions[k];
  if (!next.repeat)
    for (const k of Object.keys(s.exceptions))
      if (k.startsWith(`${id}@`)) delete s.exceptions[k];
}

/** Saves only one occurrence as a patch against the series. */
export function saveOne(s: State, key: string, draft: EventDraft) {
  const at = key.lastIndexOf("@");
  const e = s.events.find((x) => x.id === key.slice(0, at));
  if (!e) return;
  const plain = occurrenceOf({ ...s, exceptions: {} }, e, key.slice(at + 1))!;
  const patch: Patch = {};
  for (const f of ["title", "start", "end", "allDay", "memo"] as const)
    if (JSON.stringify(draft[f]) !== JSON.stringify(plain[f]))
      Object.assign(patch, { [f]: draft[f] });
  const plan: Partial<Plan> = {};
  for (const f of ["bagId", "add", "remove", "extra"] as const)
    if (JSON.stringify(draft.plan[f]) !== JSON.stringify(plain.plan[f]))
      Object.assign(plan, { [f]: draft.plan[f] });
  if (Object.keys(plan).length) patch.plan = plan;
  if (Object.keys(patch).length) s.exceptions[key] = { deleted: false, patch };
  else delete s.exceptions[key];
}

export function deleteEvent(s: State, key: string, scope: "one" | "all") {
  const at = key.lastIndexOf("@");
  const id = key.slice(0, at);
  const e = s.events.find((x) => x.id === id);
  if (!e) return;
  if (scope === "one" && e.repeat) {
    s.exceptions[key] = { deleted: true, patch: {} };
    return;
  }
  s.events = s.events.filter((x) => x.id !== id);
  for (const k of Object.keys(s.exceptions))
    if (k.startsWith(`${id}@`)) delete s.exceptions[k];
}

/** Most recent event (by start) with the exact same title. */
export function lastWithTitle(s: State, title: string) {
  const t = title.trim();
  if (!t) return null;
  return (
    s.events
      .filter((e) => e.title === t)
      .sort((a, b) => b.start.localeCompare(a.start))[0] ?? null
  );
}

export function repeatLabel(e: Event) {
  if (!e.repeat) return null;
  const names = ["日", "月", "火", "水", "木", "金", "土"];
  const base =
    e.repeat.freq === "daily"
      ? "毎日"
      : e.repeat.freq === "monthly"
        ? `毎月${Number(e.start.slice(8, 10))}日`
        : `毎週 ${[...e.repeat.weekdays].sort().map((d) => names[d]).join("・")}`;
  return e.repeat.until ? `${base}（〜${e.repeat.until.replaceAll("-", "/")}）` : base;
}
