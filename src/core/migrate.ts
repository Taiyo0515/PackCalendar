import { emptyState, validate } from "./model";
import type { BagColor, Event, Exception, Patch, Plan, State } from "./model";

// Converts the previous IndexedDB state (version 2) to version 3.
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const COLOR: Record<string, BagColor> = {
  sage: "green",
  sand: "orange",
  blue: "blue",
  rose: "pink",
  plum: "purple",
};
const wall = (s: unknown) => (typeof s === "string" ? s.slice(0, 16) : null);
const live = (x: Any) => !x.deletedAt;

function plan(p: Any | undefined, partial: boolean): Partial<Plan> {
  const out: Partial<Plan> = partial ? {} : { bagId: null, add: [], remove: [], extra: [] };
  if (!p) return out;
  if ("bagId" in p) out.bagId = p.bagId ?? null;
  if ("addedItemIds" in p) out.add = p.addedItemIds ?? [];
  if ("removedItemIds" in p) out.remove = p.removedItemIds ?? [];
  if ("temporaryItems" in p) out.extra = p.temporaryItems ?? [];
  return out;
}

export function fromV2(old: Any, now = new Date()): State {
  if (!old || old.version !== 2) throw new Error("旧データの形式が違います");
  const s = emptyState(now);
  const containers: Any[] = (old.containers ?? []).filter(live);
  s.bags = containers
    .filter((c) => c.kind === "bag")
    .map((c) => ({ id: c.id, name: c.name, color: COLOR[c.color] ?? "green", itemIds: c.itemIds ?? [] }));
  const bagIds = new Set(s.bags.map((b) => b.id));
  s.items = (old.items ?? []).filter(live).map((i: Any) => {
    const where: string | null = i.location?.containerId ?? null;
    return {
      id: i.id,
      name: i.name,
      photoId: i.imageId ?? null,
      at: where === "home" || where === "worn" || (where && bagIds.has(where)) ? where : where ? "home" : null,
      atTime: i.location?.updatedAt ?? now.toISOString(),
    };
  });
  const itemIds = new Set(s.items.map((i) => i.id));
  for (const b of s.bags) b.itemIds = b.itemIds.filter((i) => itemIds.has(i));
  const clean = (p: Partial<Plan>) => {
    if (p.bagId && !bagIds.has(p.bagId)) p.bagId = null;
    if (p.add) p.add = p.add.filter((i) => itemIds.has(i));
    if (p.remove) p.remove = p.remove.filter((i) => itemIds.has(i));
    return p;
  };
  s.events = (old.events ?? []).filter(live).map((e: Any): Event => {
    const start = wall(e.startAt)!;
    let end = wall(e.endAt);
    if (end && end <= start) end = null;
    return {
      id: e.id,
      title: e.title,
      start,
      end,
      allDay: !!e.allDay,
      memo: e.memo ?? "",
      plan: clean(plan(e.plan, false)) as Plan,
      repeat:
        e.recurrence && e.recurrence !== "none"
          ? { freq: e.recurrence, weekdays: e.weekdays ?? [], until: e.until ?? null }
          : null,
    };
  });
  const eventIds = new Set(s.events.map((e) => e.id));
  for (const o of (old.overrides ?? []).filter(live)) {
    if (!eventIds.has(o.eventId)) continue;
    const c: Any = o.changes ?? {};
    const patch: Patch = {};
    if (typeof c.title === "string") patch.title = c.title;
    if (c.startAt) patch.start = wall(c.startAt)!;
    if ("endAt" in c) patch.end = wall(c.endAt);
    if (typeof c.allDay === "boolean") patch.allDay = c.allDay;
    if (typeof c.memo === "string") patch.memo = c.memo;
    if (c.plan) patch.plan = clean(plan(c.plan, true));
    const x: Exception = { deleted: !!o.deleted, patch };
    s.exceptions[`${o.eventId}@${o.date}`] = x;
  }
  const st: Any = old.settings ?? {};
  if (st.weekStart === 0 || st.weekStart === 1) s.settings.weekStart = st.weekStart;
  if (typeof st.autoComplete === "boolean") s.settings.auto = st.autoComplete;
  if (st.reminders) {
    s.settings.remind = {
      on: !!st.reminders.enabled,
      evening: st.reminders.evening ?? null,
      morning: st.reminders.morning ?? null,
    };
  }
  if (typeof st.autoCursor === "string") s.cursor = st.autoCursor;
  return validate(s);
}
