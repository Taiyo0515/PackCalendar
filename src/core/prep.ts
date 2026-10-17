import { addDays, dayKey, stamp, toTime } from "./date";
import { endOf, occurrences } from "./calendar";
import { HOME, WORN } from "./model";
import type { Bag, Item, Occurrence, Plan, State } from "./model";

export const bagOf = (s: State, id: string | null) =>
  s.bags.find((b) => b.id === id) ?? null;

export function placeName(s: State, at: string | null) {
  if (at === HOME) return "自宅";
  if (at === WORN) return "身につける";
  return bagOf(s, at)?.name ?? "不明";
}

/** Base set + added − removed. */
export function neededIds(s: State, plan: Plan): string[] {
  const bag = bagOf(s, plan.bagId);
  if (!bag) return [];
  const set = new Set([...bag.itemIds, ...plan.add]);
  for (const i of plan.remove) set.delete(i);
  return s.items.filter((i) => set.has(i.id)).map((i) => i.id);
}

export interface Unit {
  key: string;
  bagId: string;
  start: string;
  /** When this bag's use is over: the last event end, but at least the next midnight. */
  until: string;
  title: string;
  events: Occurrence[];
  itemIds: string[];
  extra: string[];
}

/** Last event end of a unit; events without an end hold the bag until the next midnight. */
function untilOf(events: Occurrence[]) {
  const next = `${addDays(events[0].date, 1)}T00:00`;
  let allEnded = true;
  let maxEnd = "";
  for (const o of events) {
    if (!o.end) allEnded = false;
    else if (endOf(o) > maxEnd) maxEnd = endOf(o);
  }
  return allEnded ? maxEnd : maxEnd > next ? maxEnd : next;
}

/** Consecutive same-bag occurrences on the same day form one preparation. */
export function unitsOf(s: State, list: Occurrence[]): Unit[] {
  const units: Unit[] = [];
  let open: Unit | null = null;
  for (const o of list) {
    const bag = bagOf(s, o.plan.bagId);
    if (!bag) {
      if (!o.allDay) open = null;
      continue;
    }
    if (!open || open.bagId !== bag.id || open.start.slice(0, 10) !== o.start.slice(0, 10)) {
      open = { key: o.key, bagId: bag.id, start: o.start, until: "", title: o.title, events: [], itemIds: [], extra: [] };
      units.push(open);
    }
    open.events.push(o);
    open.itemIds = [...new Set([...open.itemIds, ...neededIds(s, o.plan)])];
    open.extra = [...new Set([...open.extra, ...o.plan.extra])];
  }
  for (const u of units) u.until = untilOf(u.events);
  return units;
}

export function unitsBetween(s: State, from: Date, to: Date) {
  const list = occurrences(s, dayKey(from), addDays(dayKey(to), 1)).filter(
    (o) => o.plan.bagId,
  );
  return unitsOf(s, list);
}

export interface Line {
  kind: "bag" | "home" | "unknown" | "extra";
  label: string;
  names: string[];
  itemIds: string[];
}

/** Items to move for a unit, grouped by where they are now. */
export function linesOf(s: State, u: { bagId: string; itemIds: string[]; extra: string[] }): Line[] {
  const byPlace = new Map<string, Line>();
  const order: Line[] = [];
  for (const item of s.items) {
    if (!u.itemIds.includes(item.id)) continue;
    if (item.at === u.bagId || item.at === WORN) continue;
    const kind: Line["kind"] =
      item.at === HOME ? "home" : item.at === null || !bagOf(s, item.at) ? "unknown" : "bag";
    const k = kind === "bag" ? item.at! : kind;
    let line = byPlace.get(k);
    if (!line) {
      line = {
        kind,
        label: kind === "home" ? "自宅から" : kind === "unknown" ? "場所不明" : `${placeName(s, item.at)}から`,
        names: [],
        itemIds: [],
      };
      byPlace.set(k, line);
      order.push(line);
    }
    line.names.push(item.name);
    line.itemIds.push(item.id);
  }
  const rank = { bag: 0, home: 1, unknown: 2, extra: 3 };
  const lines = order.sort((a, b) => rank[a.kind] - rank[b.kind]);
  if (u.extra.length)
    lines.push({ kind: "extra", label: "今回だけ", names: [...u.extra], itemIds: [] });
  return lines;
}

/** The next preparation starting after now within `hours`. */
export function nextUnit(s: State, now: Date, hours = 48) {
  const until = new Date(now.getTime() + hours * 3600000);
  const nowStamp = stamp(now);
  return (
    unitsBetween(s, now, until).find(
      (u) => u.start > nowStamp && toTime(u.start) <= until,
    ) ?? null
  );
}

/** Moves items, stamping the change time. */
export function moveItems(s: State, ids: string[], to: string | null, at = new Date()) {
  for (const item of s.items)
    if (ids.includes(item.id) && item.at !== to) {
      item.at = to;
      item.atTime = at.toISOString();
    }
}

/** Records preparations, and puts return-type items back home when the use is over. */
export interface MoveEvent {
  /** Time of the move (a unit's start or its end). */
  t: string;
  unit: Unit;
  /** True when the unit starts (in), false when its use ends (return items go home). */
  start: boolean;
}

/** Units in chronological order, each expanded into a start and an end move. */
export function unitMoves(units: Unit[]): MoveEvent[] {
  const moves: MoveEvent[] = [];
  for (const u of units) {
    moves.push({ t: u.start, unit: u, start: true });
    moves.push({ t: u.until, unit: u, start: false });
  }
  return moves.sort(
    (a, b) => a.t.localeCompare(b.t) || Number(a.start) - Number(b.start) || a.unit.key.localeCompare(b.unit.key),
  );
}

/**
 * Applies one move. Live recordings keep anything the user moved later untouched;
 * in the simulated future the plan is taken as completed and overrides positions.
 */
export function applyMove(s: State, e: MoveEvent, simulated: boolean): number {
  let moved = 0;
  for (const item of s.items) {
    if (!e.unit.itemIds.includes(item.id) || item.at === WORN) continue;
    if (e.start) {
      if (item.at === e.unit.bagId) continue;
      if (!simulated && new Date(item.atTime) > new Date(e.t)) continue;
    } else {
      if (!item.return || item.at !== e.unit.bagId) continue;
      if (!simulated && new Date(item.atTime) > new Date(e.t)) continue;
    }
    item.at = e.start ? e.unit.bagId : HOME;
    item.atTime = e.t;
    moved++;
  }
  return moved;
}

/** Records preparations whose start passed since the cursor, and ended-day returns. */
export function advance(s: State, now = new Date()) {
  const cursor = new Date(s.cursor);
  if (!(now > cursor)) return 0;
  s.cursor = now.toISOString();
  if (!s.settings.auto) return 0;
  const from = stamp(cursor),
    to = stamp(now);
  let moved = 0;
  for (const e of unitMoves(unitsBetween(s, cursor, now)))
    if (e.t > from && e.t <= to) moved += applyMove(s, e, false);
  return moved;
}

export function removeBag(s: State, bagId: string) {
  s.bags = s.bags.filter((b) => b.id !== bagId);
  const now = new Date().toISOString();
  for (const i of s.items)
    if (i.at === bagId) {
      i.at = null;
      i.atTime = now;
    }
  for (const e of s.events) if (e.plan.bagId === bagId) e.plan.bagId = null;
  for (const x of Object.values(s.exceptions))
    if (x.patch.plan?.bagId === bagId) x.patch.plan.bagId = null;
}

export function removeItem(s: State, itemId: string) {
  s.items = s.items.filter((i) => i.id !== itemId);
  for (const b of s.bags) b.itemIds = b.itemIds.filter((i) => i !== itemId);
  const strip = (p: Partial<Plan>) => {
    if (p.add) p.add = p.add.filter((i) => i !== itemId);
    if (p.remove) p.remove = p.remove.filter((i) => i !== itemId);
  };
  for (const e of s.events) strip(e.plan);
  for (const x of Object.values(s.exceptions)) if (x.patch.plan) strip(x.patch.plan);
}

export function togglePin(bag: Bag, itemId: string) {
  bag.itemIds = bag.itemIds.includes(itemId)
    ? bag.itemIds.filter((i) => i !== itemId)
    : [...bag.itemIds, itemId];
}

export const initial = (name: string) => [...name.trim()][0] ?? "?";
export const itemsIn = (s: State, bagId: string): Item[] =>
  s.items.filter((i) => i.at === bagId);
