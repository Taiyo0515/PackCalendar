// Minimal iCalendar parsing for importing calendars (Google Calendar and similar).
// Only what the app needs: event details, basic repeats, and occasional changes.
import { addDays, pad, weekday } from "./date";
import type { Repeat } from "./model";

export interface IcsEdit {
  day: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
}

export interface IcsEvent {
  uid: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  memo: string;
  repeat: Repeat | null;
  /** Days that disappeared from the series (EXDATE) or were cancelled. */
  gone: string[];
  /** Same-day changes of one occurrence. */
  edits: IcsEdit[];
}

interface Prop {
  name: string;
  params: string[];
  value: string;
}

const unescapeText = (v: string) =>
  v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

/** Parses `name;param=value:value` with quoted-string support. */
function parseProp(raw: string): Prop {
  const name = /^[^:;]+/.exec(raw)?.[0].toUpperCase() ?? "";
  const body = raw.slice(name.length);
  const params: string[] = [];
  let i = 0,
    value = "",
    quote = false;
  while (i < body.length) {
    const c = body[i];
    if (quote) {
      if (c === '"') quote = false;
      i++;
      continue;
    }
    if (c === '"') {
      quote = true;
      i++;
      continue;
    }
    if (c === ";") {
      const next = /^[^:;:]*/.exec(body.slice(i + 1))!;
      if (next[0]) params.push(next[0]);
      i += 1 + next[0].length;
      continue;
    }
    if (c === ":") {
      value = body.slice(i + 1);
      break;
    }
    i++;
  }
  const dateOnly = params.some((p) => /^VALUE\s*=\s*DATE$/i.test(p));
  return {
    name,
    params: dateOnly ? ["VALUE=DATE"] : params,
    value: unescapeText(value),
  };
}

/** Local stamp ("YYYY-MM-DDTHH:mm") from an ICS DATE / DATE-TIME value. */
function icsStamp(value: string, allDay: boolean): string {
  const v = value.replace(/[-:]/g, "").replace(/[Tt]/g, "").replace(/\.\d+/, "");
  const day = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (v.length <= 8) return `${day}T00:00`;
  const hh = v.slice(8, 10),
    mm = v.slice(10, 12);
  // An ending Z means UTC: convert to the device timezone. Times with a TZID or
  // no zone are floating and keep the printed wall-clock (Japan users are fine).
  if (value.endsWith("Z") && !allDay) {
    const d = new Date(`${day}T${hh}:${mm}:00Z`);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  // All-day times arrive as UTC midnights: keep the printed day.
  if (allDay) return `${day}T00:00`;
  return `${day}T${hh}:${mm}`;
}

/** A repeat rule we can reproduce; null when the rule is too different. */
function ruleToRepeat(rule: Map<string, string>, first: string): Repeat | null {
  const freq = rule.get("FREQ")?.toUpperCase();
  if (rule.get("INTERVAL") && rule.get("INTERVAL") !== "1") return null;
  const until = () => untilDate(rule, first);
  if (freq === "DAILY")
    return { freq: "daily", weekdays: [], until: until() };
  if (freq === "WEEKLY") {
    const map: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const days = (rule.get("BYDAY")?.toUpperCase().split(",") ?? [])
      .map((d) => map[d.slice(0, 2)])
      .filter((d) => d !== undefined);
    if (!days.length) return null;
    return { freq: "weekly", weekdays: [...new Set(days)].sort(), until: until() };
  }
  if (freq === "MONTHLY" && !rule.has("BYDAY") && !rule.has("BYSETPOS")) {
    // Same date each month (months without the date are skipped by the app).
    return { freq: "monthly", weekdays: [], until: until() };
  }
  return null;
}
const monthLength = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Last occurrence date from UNTIL / COUNT. */
function untilDate(rule: Map<string, string>, first: string): string | null {
  const raw = rule.get("UNTIL");
  if (raw) {
    const allDay = raw.length <= 8 || (raw.includes("T") ? false : !raw.endsWith("Z"));
    const t = icsStamp(rule.get("UNTIL")!, allDay);
    return t.slice(0, 10);
  }
  const count = Number(rule.get("COUNT"));
  if (count > 1) {
    let d = first;
    for (let i = 1; i < Math.min(count, 20000); i++) d = nextDay(d, rule);
    return d;
  }
  return null;
}

/** One step forward for COUNT-based rules. */
function nextDay(day: string, rule: Map<string, string>): string {
  const freq = rule.get("FREQ")?.toUpperCase() ?? "DAILY";
  if (freq === "MONTHLY" && !rule.has("BYDAY")) {
    const target = +day.slice(8, 10);
    let y = +day.slice(0, 4),
      m = +day.slice(5, 7) - 1,
      n = 0;
    let next: Date;
    do {
      m += 1;
      next = new Date(y, m, Math.min(target, monthLength(y, m)), 12);
      n++;
    } while (next.getDate() !== target && n < 60); // months without the date are skipped
    return dayKey(next);
  }
  const step = new Date(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), 12);
  if (freq === "WEEKLY") {
    const map: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
    const targets = [...new Set((rule.get("BYDAY")?.toUpperCase().split(",") ?? []).map((d) => map[d.slice(0, 2)]))].filter(
      (d) => d !== undefined,
    );
    let probe = step,
      n = 0;
    while (n < 14) {
      probe = new Date(probe.getFullYear(), probe.getMonth(), probe.getDate() + 1, 12);
      n++;
      if (targets.includes(new Date(probe.getFullYear(), probe.getMonth(), probe.getDate()).getDay())) break;
    }
    return dayKey(probe);
  }
  step.setDate(step.getDate() + 1);
  return dayKey(step);
}
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

interface VEvent {
  props: Prop[];
}

function blocks(text: string): VEvent[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length)
      unfolded[unfolded.length - 1] += line.slice(1);
    else unfolded.push(line);
  }
  const out: VEvent[] = [];
  let current: Prop[] | null = null;
  for (const line of unfolded) {
    if (line === "BEGIN:VEVENT") current = [];
    else if (line === "END:VEVENT" && current) {
      out.push({ props: current });
      current = null;
    } else if (current && line.trim()) current.push(parseProp(line));
  }
  return out;
}

export function parseIcs(text: string): IcsEvent[] {
  const one = new Map<string, IcsEvent>();
  const edits = new Map<string, IcsEdit[]>();
  for (const block of blocks(text)) find(block, one, edits);
  for (const e of one.values()) {
    e.edits = edits.get(e.uid) ?? [];
    e.gone = e.gone.filter((d) => !e.edits.some((x) => x.day === d));
    // A rule whose last day is already past would render nothing: keep it anyway.
  }
  return [...one.values()];
}
function find(block: { props: Prop[] }, one: Map<string, IcsEvent>, edits: Map<string, IcsEdit[]>) {
  const uid = block.props.find((p) => p.name === "UID")?.value.trim();
  if (!uid) return;
  const rid = block.props.find((p) => p.name === "RECURRENCE-ID")?.value;
  if (block.props.some((p) => p.name === "STATUS" && p.value.toUpperCase() === "CANCELLED")) {
    if (rid) {
      // One occurrence of the series was cancelled.
      const base = one.get(uid);
      if (base) base.gone.push(icsStamp(rid, !rid.includes("T")).slice(0, 10));
    } else one.delete(uid); // The whole series no longer exists.
    return;
  }
  const start = block.props.find((p) => p.name === "DTSTART")!;
  if (!start?.value) return;
  const allDay = start.params.includes("VALUE=DATE") || !start.value.includes("T");
  const stampStart = icsStamp(start.value, false);
  const end = block.props.find((p) => p.name === "DTEND")?.value ?? "";
  let stampEnd = end ? icsStamp(end, allDay) : null;
  if (stampEnd && stampEnd <= stampStart) stampEnd = allDay ? `${addDays(stampStart.slice(0, 10), 1)}T00:00` : null;
  const title = (block.props.find((p) => p.name === "SUMMARY")?.value ?? "").trim() || "無題";
  const memo = (block.props.find((p) => p.name === "DESCRIPTION")?.value ?? "").trim();
  if (rid) {
    // One occurrence changed. Same-day edits become the app's day patch; different days are skipped.
    const rday = icsStamp(rid, false).slice(0, 10);
    if (rday === stampStart.slice(0, 10)) {
      const list = edits.get(uid) ?? [];
      list.push({ day: rday, title, start: stampStart, end: stampEnd, allDay });
      edits.set(uid, list);
    }
    return;
  }
  const exdates: string[] = [];
  for (const p of block.props)
    if (p.name === "EXDATE")
      for (const v of p.value.split(",")) {
        if (v.trim()) exdates.push(icsStamp(v.trim(), false).slice(0, 10));
      }
  const rrules = block.props.filter((p) => p.name === "RRULE");
  const repeat = rrules.length
    ? ruleToRepeat(
        new Map(
          rrules[0].value
            .split(";")
            .filter(Boolean)
            .map((kv) => [kv.slice(0, kv.indexOf("=")).toUpperCase(), kv.slice(kv.indexOf("=") + 1)]) as [string, string][],
        ),
        stampStart.slice(0, 10),
      )
    : null;
  one.set(uid, {
    uid,
    title,
    start: stampStart,
    end: stampEnd,
    allDay,
    memo,
    repeat,
    gone: exdates.filter((d) => d >= stampStart.slice(0, 10)),
    edits: [],
  });
}
