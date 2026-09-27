import { addDays, dayKey, stamp, toTime } from "./date";
import { occurrences } from "./calendar";
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
  title: string;
  events: Occurrence[];
  itemIds: string[];
  extra: string[];
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
      open = { key: o.key, bagId: bag.id, start: o.start, title: o.title, events: [], itemIds: [], extra: [] };
      units.push(open);
    }
    open.events.push(o);
    open.itemIds = [...new Set([...open.itemIds, ...neededIds(s, o.plan)])];
    open.extra = [...new Set([...open.extra, ...o.plan.extra])];
  }
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

/** Records preparations whose start passed since the cursor. */
export function advance(s: State, now = new Date()) {
  const cursor = new Date(s.cursor);
  if (!(now > cursor)) return 0;
  let moved = 0;
  if (s.settings.auto) {
    const from = stamp(cursor),
      to = stamp(now);
    for (const u of unitsBetween(s, cursor, now)) {
      if (!(u.start > from && u.start <= to)) continue;
      const at = toTime(u.start);
      for (const item of s.items)
        if (
          u.itemIds.includes(item.id) &&
          item.at !== u.bagId &&
          item.at !== WORN &&
          new Date(item.atTime) <= at
        ) {
          item.at = u.bagId;
          item.atTime = at.toISOString();
          moved++;
        }
    }
  }
  s.cursor = now.toISOString();
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
