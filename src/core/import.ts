// Merging events from other calendars (ICS, TimeTree, the device calendar) into the state.
import { emptyPlan } from "./model";
import type { Repeat, State } from "./model";

export interface Dto {
  /** Stable identifier from the source; re-imports update instead of duplicating. */
  uid?: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  memo: string;
  repeat: Repeat | null;
  /** Days that disappeared from the series. */
  gone: string[];
  /** Same-day changes of one occurrence. */
  edits: { day: string; title: string; start: string; end: string | null; allDay: boolean }[];
}

export interface Prepared {
  id: string;
  dto: Dto;
}
/** A stable id derived from the source name and the source's own identifier. */
export async function sourceId(source: string, key: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${source}\n${key}`));
  return (
    "i" +
    Array.from(new Uint8Array(bytes))
      .slice(0, 16)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  ).slice(0, 100);
}

/** Adds imported events, updating the ones imported before. Returns [added, updated]. */
export function mergeImportsSync(s: State, prepared: Prepared[]): [number, number] {
  let added = 0;
  let updated = 0;
  const byId = new Map(s.events.map((e) => [e.id, e]));
  for (const { id, dto: d } of prepared) {
    const old = byId.get(id);
    if (old) {
      old.title = d.title;
      old.start = d.start;
      old.end = d.end;
      old.allDay = d.allDay;
      if (!old.memo) old.memo = d.memo;
      old.repeat = d.repeat;
      updated++;
    } else {
      const event = {
        id,
        title: d.title,
        start: d.start,
        end: d.end,
        allDay: d.allDay,
        memo: d.memo,
        calendar: "main" as const,
        plan: emptyPlan(),
        repeat: d.repeat,
        alert: null,
      };
      s.events.push(event);
      byId.set(id, event);
      added++;
    }
    const key = (day: string) => `${id}@${day}`;
    for (const g of d.gone) s.exceptions[key(g)] = { deleted: true, patch: {} };
    for (const ed of d.edits)
      s.exceptions[key(ed.day)] = { deleted: false, patch: { title: ed.title, start: ed.start, end: ed.end, allDay: ed.allDay } };
  }
  return [added, updated];
}

/** Stable import id from the source's own identifier. */
export async function prepareImports(dtos: Dto[]): Promise<Prepared[]> {
  const out: Prepared[] = [];
  for (const d of dtos) {
    if (!d.title.trim() || !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(d.start)) continue;
    if (d.end && d.end <= d.start) continue;
    const id = await sourceId(
      d.uid === undefined ? "sub" : "uid",
      d.uid ?? `${d.title}\n${d.start}\n${d.end ?? ""}\n${d.allDay}`,
    );
    out.push({ id, dto: d });
  }
  return out;
}

async function mergeImports(s: State, dtos: Dto[]): Promise<[number, number]> {
  return mergeImportsSync(s, await prepareImports(dtos));
}
void mergeImports;