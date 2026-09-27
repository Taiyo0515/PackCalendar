import {
  addDays,
  dateAt,
  dateKey,
  dayDiff,
  emptyState,
  emptyPlan,
  entityStamp,
  guessIcon,
  homeLocation,
  id,
  localTime,
  newEvent,
  stateSchema,
} from "./model";
import type {
  State,
  Event,
  EventChanges,
  Occurrence,
  Location,
  Move,
  Item,
  PackPlan,
  Container,
} from "./model";
export * from "./model";
export const active = <T extends { deletedAt: string | null }>(
  list: T[],
): T[] => list.filter((x) => !x.deletedAt);
export const bags = (s: State) =>
  active(s.containers).filter((c) => c.kind === "bag");
export const items = (s: State) => active(s.items);
export const containerById = (s: State, containerId: string | null) =>
  active(s.containers).find((c) => c.id === containerId);
export const bagById = (s: State, bagId: string | null) =>
  bags(s).find((b) => b.id === bagId);
export const locationName = (s: State, l: Location) =>
  containerById(s, l.containerId)?.name ?? "不明";
export const samePlace = (a: Location, b: Location) =>
  a.containerId === b.containerId;
export function requiredItems(s: State, plan: PackPlan): Item[] {
  const bag = bagById(s, plan.bagId);
  if (!bag) return [];
  const wanted = new Set([...bag.itemIds, ...plan.addedItemIds]);
  plan.removedItemIds.forEach((i) => wanted.delete(i));
  return items(s).filter((i) => wanted.has(i.id));
}
export function preparation(s: State, plan: PackPlan) {
  return requiredItems(s, plan)
    .filter(
      (i) =>
        containerById(s, i.location.containerId)?.kind !== "worn" &&
        i.location.containerId !== plan.bagId,
    )
    .map((item) => ({
      item,
      from: locationName(s, item.location),
      to: bagById(s, plan.bagId)!.name,
      kind:
        containerById(s, item.location.containerId)?.kind === "bag"
          ? ("move" as const)
          : item.location.containerId === null
            ? ("find" as const)
            : ("pack" as const),
    }));
}
export function moveItems(
  s: State,
  itemIds: string[],
  containerId: string | null,
  options: {
    source?: Move["source"];
    at?: Date;
    event?: Occurrence;
    initialPin?: boolean;
  } = {},
) {
  const target = containerById(s, containerId);
  if (containerId && !target) throw new Error("移動先が見つかりません。");
  const date = options.at ?? new Date(),
    at = date.toISOString();
  const pin =
    options.initialPin && target?.kind === "bag" && target.itemIds.length === 0;
  for (const item of items(s).filter((i) => itemIds.includes(i.id))) {
    const next: Location = { containerId, updatedAt: at, moveId: id() };
    if (samePlace(item.location, next) && options.source !== "forgot") continue;
    const from = structuredClone(item.location);
    item.location = next;
    item.updatedAt = at;
    if (pin && !target!.itemIds.includes(item.id)) {
      target!.itemIds.push(item.id);
      target!.updatedAt = at;
    }
    s.moves.push({
      id: next.moveId!,
      itemId: item.id,
      itemName: item.name,
      from,
      to: structuredClone(next),
      source: options.source ?? "manual",
      at,
      eventKey: options.event?.key ?? null,
      eventTitle: options.event?.title ?? null,
      undone: false,
      ...entityStamp(date),
    });
  }
  s.moves = s.moves.slice(-10000);
}
export function undoMove(s: State, moveId: string, now = new Date()) {
  const move = s.moves.find((m) => m.id === moveId),
    item = items(s).find((i) => i.id === move?.itemId);
  if (!move || !item || move.undone || item.location.moveId !== move.id)
    throw new Error(
      "この後に位置が変更されています。現在の位置を修正してください。",
    );
  const target = containerById(s, move.from.containerId)
    ? move.from.containerId
    : null;
  moveItems(s, [item.id], target, { source: "undo", at: now });
  move.undone = true;
  move.updatedAt = now.toISOString();
}
export function suggestLocation(
  s: State,
  item: Item,
  now = new Date(),
): string | null {
  if (item.location.containerId) return null;
  const recent = [...s.moves]
    .reverse()
    .filter(
      (m) =>
        m.itemId === item.id &&
        !m.undone &&
        new Date(m.at).getTime() > now.getTime() - 30 * 86400000,
    );
  for (const move of recent) {
    const candidate = move.to.containerId ?? move.from.containerId;
    if (containerById(s, candidate)) return candidate;
  }
  const previous = occurrencesBetween(
    s,
    addDays(dateKey(now), -30),
    addDays(dateKey(now), 1),
  )
    .filter(
      (e) =>
        new Date(e.startAt) <= now &&
        requiredItems(s, e.plan).some((i) => i.id === item.id),
    )
    .at(-1);
  return previous?.plan.bagId ?? null;
}
export function isOccurrence(e: Event, day: string) {
  const start = e.startAt.slice(0, 10);
  if (day < start || (e.until && day > e.until)) return false;
  return e.recurrence === "none"
    ? day === start
    : e.recurrence === "daily"
      ? true
      : e.recurrence === "weekly"
        ? e.weekdays.includes(dateAt(day).getDay())
        : day.slice(8) === start.slice(8);
}
export function occurrence(s: State, e: Event, day: string): Occurrence | null {
  const override = active(s.overrides).find(
    (o) => o.eventId === e.id && o.date === day,
  );
  if (override?.deleted) return null;
  return {
    ...e,
    startAt: `${day}T${e.startAt.slice(11)}`,
    endAt: e.endAt
      ? `${addDays(day, dayDiff(e.startAt, e.endAt))}T${e.endAt.slice(11)}`
      : null,
    ...override?.changes,
    plan: { ...e.plan, ...override?.changes.plan },
    baseId: e.id,
    occurrenceDate: day,
    key: `${e.id}@${day}`,
    isOverride: !!override,
  };
}
export const endOf = (e: Event) =>
  e.endAt ?? (e.allDay ? `${addDays(e.startAt, 1)}T00:00` : `${e.startAt}:59`);
export function occurrencesBetween(
  s: State,
  from: string,
  to: string,
  includeRules = true,
): Occurrence[] {
  const all = new Map<string, Occurrence>();
  const add = (e: Occurrence | null) => {
    if (e && e.startAt < `${to}T00:00` && endOf(e) > `${from}T00:00`)
      all.set(e.key, e);
  };
  for (const e of active(s.events)) {
    if (e.recurrence === "none") {
      add(occurrence(s, e, e.startAt.slice(0, 10)));
      continue;
    }
    const earliest = addDays(
      from,
      -Math.max(0, e.endAt ? dayDiff(e.startAt, e.endAt) : 0),
    );
    const start =
      earliest > e.startAt.slice(0, 10) ? earliest : e.startAt.slice(0, 10);
    const last = e.until && e.until < to ? addDays(e.until, 1) : to;
    for (let day = start; day < last; day = addDays(day, 1))
      if (isOccurrence(e, day)) add(occurrence(s, e, day));
    for (const o of active(s.overrides).filter((o) => o.eventId === e.id))
      if (isOccurrence(e, o.date)) add(occurrence(s, e, o.date));
  }
  if (includeRules)
    for (let day = from; day < to; day = addDays(day, 1)) {
      if (
        [...all.values()].some(
          (e) => e.plan.bagId && e.startAt.slice(0, 10) === day,
        )
      )
        continue;
      for (const rule of active(s.rules).filter(
        (r) =>
          r.enabled &&
          day >= r.from &&
          r.weekdays.includes(dateAt(day).getDay()),
      )) {
        const e: Occurrence = {
          ...newEvent(day),
          id: rule.id,
          baseId: rule.id,
          title: rule.name,
          startAt: `${day}T${rule.time}`,
          plan: { ...emptyPlan(), bagId: rule.bagId },
          occurrenceDate: day,
          key: `rule-${rule.id}@${day}`,
          isOverride: false,
          isRule: true,
        };
        add(e);
      }
    }
  return [...all.values()].sort(
    (a, b) => a.startAt.localeCompare(b.startAt) || a.key.localeCompare(b.key),
  );
}
export function upcoming(s: State, now = new Date(), limit = 8, hours = 48) {
  const until = new Date(now.getTime() + hours * 3600000);
  return occurrencesBetween(s, dateKey(now), addDays(dateKey(until), 1))
    .filter(
      (e) =>
        e.plan.bagId &&
        new Date(e.startAt) >= now &&
        new Date(e.startAt) <= until,
    )
    .slice(0, limit);
}
export interface PrepUnit {
  event: Occurrence;
  events: Occurrence[];
  itemIds: string[];
  temporaryItems: string[];
}
export function groupUnits(s: State, events: Occurrence[]): PrepUnit[] {
  const units: PrepUnit[] = [];
  for (const e of events.filter((e) => e.plan.bagId)) {
    let unit = units.at(-1);
    // A preparation belongs to one departure day; overnight repeats are separate reminders.
    if (
      !unit ||
      unit.event.plan.bagId !== e.plan.bagId ||
      unit.event.startAt.slice(0, 10) !== e.startAt.slice(0, 10)
    ) {
      unit = { event: e, events: [], itemIds: [], temporaryItems: [] };
      units.push(unit);
    }
    unit.events.push(e);
    unit.itemIds = [
      ...new Set([
        ...unit.itemIds,
        ...requiredItems(s, e.plan).map((i) => i.id),
      ]),
    ];
    unit.temporaryItems = [
      ...new Set([...unit.temporaryItems, ...e.plan.temporaryItems]),
    ];
  }
  return units;
}
export const unitEvent = (s: State, u: PrepUnit): Occurrence => ({
  ...u.event,
  plan: {
    ...u.event.plan,
    addedItemIds: u.itemIds,
    removedItemIds: (bagById(s, u.event.plan.bagId)?.itemIds ?? []).filter(
      (i) => !u.itemIds.includes(i),
    ),
    temporaryItems: u.temporaryItems,
  },
});
export function unitActions(s: State, unit: PrepUnit) {
  return preparation(s, unitEvent(s, unit).plan);
}
export function groupedLines(
  s: State,
  unit: PrepUnit,
): { label: string; names: string[]; itemIds: string[] }[] {
  const lines = new Map<
    string,
    { label: string; names: string[]; itemIds: string[] }
  >();
  for (const action of unitActions(s, unit)) {
    const label = action.kind === "find" ? "場所を確認" : `${action.from}から`;
    const line = lines.get(label) ?? { label, names: [], itemIds: [] };
    line.names.push(action.item.name);
    line.itemIds.push(action.item.id);
    lines.set(label, line);
  }
  const temporary = unit.events
    .filter((e) => !s.processed.includes(`temporary:${e.key}`))
    .flatMap((e) => e.plan.temporaryItems);
  if (temporary.length)
    lines.set("今回だけ", {
      label: "今回だけ",
      names: [...new Set(temporary)],
      itemIds: [],
    });
  return [...lines.values()];
}
export function completePreparation(
  s: State,
  event: Occurrence,
  itemIds?: string[],
  source: Move["source"] = "prep",
  at = new Date(),
) {
  const wanted = preparation(s, event.plan).map((a) => a.item.id);
  const allowed = itemIds ? wanted.filter((i) => itemIds.includes(i)) : wanted;
  moveItems(s, allowed, event.plan.bagId, { source, at, event });
  if (!itemIds)
    s.processed = [...new Set([...s.processed, `temporary:${event.key}`])];
}
export function advanceAutomatic(s: State, now = new Date()) {
  const cursor = new Date(s.settings.autoCursor);
  if (now <= cursor) return 0;
  let count = 0;
  if (s.settings.autoComplete) {
    const units = groupUnits(
      s,
      occurrencesBetween(s, dateKey(cursor), addDays(dateKey(now), 1)),
    );
    for (const unit of units) {
      const e = unitEvent(s, unit);
      if (new Date(e.startAt) <= cursor || new Date(e.startAt) > now) continue;
      if (s.processed.includes(e.key)) continue;
      const at = new Date(e.startAt);
      const items = preparation(s, e.plan)
        .filter((a) => new Date(a.item.location.updatedAt) <= at)
        .map((a) => a.item.id);
      completePreparation(s, e, items, "auto", at);
      s.processed.push(
        ...unit.events.flatMap((event) => [
          event.key,
          `temporary:${event.key}`,
        ]),
      );
      count += items.length;
    }
  }
  s.settings.autoCursor = now.toISOString();
  s.processed = [...new Set(s.processed)].slice(-50000);
  return count;
}
export function saveOccurrence(
  s: State,
  baseId: string,
  day: string,
  changes: EventChanges,
) {
  const base = active(s.events).find((e) => e.id === baseId);
  if (!base || base.recurrence === "none")
    throw new Error("繰り返し予定が見つかりません。");
  const original = occurrence({ ...s, overrides: [] }, base, day)!;
  const fields = ["title", "startAt", "endAt", "allDay", "categoryId", "memo"];
  const delta: EventChanges = Object.fromEntries(
    Object.entries(changes).filter(
      ([k, v]) =>
        fields.includes(k) &&
        JSON.stringify(v) !== JSON.stringify(original[k as keyof Event]),
    ),
  );
  if (changes.plan) {
    const plan = Object.fromEntries(
      Object.entries(changes.plan).filter(
        ([k, v]) =>
          JSON.stringify(v) !==
          JSON.stringify(original.plan[k as keyof PackPlan]),
      ),
    );
    if (Object.keys(plan).length) delta.plan = plan;
  }
  for (const o of active(s.overrides).filter(
    (o) => o.eventId === baseId && o.date === day,
  ))
    softDelete(o);
  if (Object.keys(delta).length)
    s.overrides.push({
      id: id(),
      eventId: baseId,
      date: day,
      changes: delta,
      deleted: false,
      ...entityStamp(),
    });
}
export function softDelete(
  entity: { deletedAt: string | null; updatedAt: string },
  now = new Date(),
) {
  entity.deletedAt = now.toISOString();
  entity.updatedAt = entity.deletedAt;
}
export function removeEvent(
  s: State,
  baseId: string,
  day: string,
  scope: "one" | "all",
) {
  const event = active(s.events).find((e) => e.id === baseId);
  if (!event) return;
  if (event.recurrence !== "none" && scope === "one") {
    for (const o of active(s.overrides).filter(
      (o) => o.eventId === baseId && o.date === day,
    ))
      softDelete(o);
    s.overrides.push({
      id: id(),
      eventId: baseId,
      date: day,
      deleted: true,
      changes: {},
      ...entityStamp(),
    });
  } else {
    softDelete(event);
    for (const o of active(s.overrides).filter((o) => o.eventId === baseId))
      softDelete(o);
  }
}
export function removeContainer(s: State, containerId: string) {
  if (["home", "worn"].includes(containerId))
    throw new Error("自宅と身につける場所は削除できません。");
  const container = containerById(s, containerId);
  if (!container) return;
  moveItems(
    s,
    items(s)
      .filter((i) => i.location.containerId === containerId)
      .map((i) => i.id),
    null,
  );
  softDelete(container);
  for (const e of active(s.events))
    if (e.plan.bagId === containerId) e.plan.bagId = null;
  for (const o of active(s.overrides))
    if (o.changes.plan?.bagId === containerId) o.changes.plan.bagId = null;
  for (const c of active(s.categories))
    if (c.defaultBagId === containerId) c.defaultBagId = null;
  for (const r of active(s.rules).filter((r) => r.bagId === containerId))
    softDelete(r);
}
export const removeBag = removeContainer;
export function removeItem(s: State, itemId: string) {
  const item = items(s).find((i) => i.id === itemId);
  if (!item) return;
  softDelete(item);
  for (const b of bags(s)) b.itemIds = b.itemIds.filter((i) => i !== itemId);
  for (const p of [
    ...active(s.events).map((e) => e.plan),
    ...active(s.overrides).flatMap((o) =>
      o.changes.plan ? [o.changes.plan] : [],
    ),
  ])
    for (const k of ["addedItemIds", "removedItemIds"] as const)
      if (p[k]) p[k] = p[k]!.filter((i) => i !== itemId);
}
export function removeCategory(s: State, categoryId: string) {
  const c = active(s.categories).find((c) => c.id === categoryId);
  if (c) softDelete(c);
  for (const e of [
    ...active(s.events),
    ...active(s.overrides).map((o) => o.changes),
  ])
    if (e.categoryId === categoryId) e.categoryId = null;
}
export function quickPreparation(
  s: State,
  bagId: string,
  now = new Date(),
): Occurrence {
  return {
    ...newEvent(dateKey(now), now),
    id: `quick-${bagId}`,
    baseId: `quick-${bagId}`,
    title: "今からこのバッグ",
    startAt: localTime(now),
    plan: { ...emptyPlan(), bagId },
    key: `quick-${bagId}`,
    occurrenceDate: dateKey(now),
    isOverride: false,
  };
}
export function recordDisplay(s: State, unit: PrepUnit, now = new Date()) {
  const count = groupedLines(s, unit).reduce(
    (sum, l) => sum + l.names.length,
    0,
  );
  const previous = s.metrics.at(-1);
  if (
    previous &&
    previous.unitKey === unit.event.key &&
    previous.actionCount === count &&
    now.getTime() - Date.parse(previous.at) < 60000
  )
    return;
  s.metrics.push({
    id: id(),
    at: now.toISOString(),
    kind: "display",
    unitKey: unit.event.key,
    actionCount: count,
  });
  s.metrics = s.metrics.slice(-10000);
}
export function metricsSummary(s: State, now = new Date()) {
  const since = now.getTime() - 7 * 86400000,
    moves = s.moves.filter((m) => Date.parse(m.at) >= since && !m.undone);
  return {
    shown: s.metrics
      .filter((m) => Date.parse(m.at) >= since)
      .reduce((n, m) => n + m.actionCount, 0),
    auto: moves.filter((m) => m.source === "auto").length,
    manual: moves.filter((m) => m.source === "manual").length,
    forgotten: moves.filter((m) => m.source === "forgot").length,
  };
}
export function stampChanges(before: State, next: State, now = new Date()) {
  for (const field of [
    "containers",
    "items",
    "events",
    "overrides",
    "categories",
    "rules",
    "moves",
  ] as const) {
    const old = new Map<string, unknown>(before[field].map((e) => [e.id, e]));
    for (const entity of next[field])
      if (JSON.stringify(old.get(entity.id)) !== JSON.stringify(entity))
        entity.updatedAt = now.toISOString();
  }
}
export function validateState(input: unknown): State {
  const parsed = stateSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `データを読み込めません：${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`,
    );
  const s = parsed.data;
  const fail = (message: string): never => {
    throw new Error(`データを読み込めません：${message}`);
  };
  const sets = {
    containers: new Set(active(s.containers).map((c) => c.id)),
    bags: new Set(bags(s).map((b) => b.id)),
    items: new Set(items(s).map((i) => i.id)),
    categories: new Set(active(s.categories).map((c) => c.id)),
  };
  for (const name of [
    "containers",
    "items",
    "events",
    "overrides",
    "categories",
    "rules",
    "moves",
  ] as const)
    if (new Set(s[name].map((x) => x.id)).size !== s[name].length)
      fail(`${name}のIDが重複しています。`);
  if (
    containerById(s, "home")?.kind !== "place" ||
    containerById(s, "worn")?.kind !== "worn"
  )
    fail("自宅または身につける場所がありません。");
  for (const b of active(s.containers))
    if (
      b.itemIds.some((i) => !sets.items.has(i)) ||
      (b.kind !== "bag" && b.itemIds.length)
    )
      fail("基本セットの持ち物が不正です。");
  for (const i of items(s))
    if (i.location.containerId && !sets.containers.has(i.location.containerId))
      fail("記録上の位置が不正です。");
  for (const c of active(s.categories))
    if (c.defaultBagId && !sets.bags.has(c.defaultBagId))
      fail("カテゴリのバッグが不正です。");
  const checkEvent = (e: Event) => {
    if (e.endAt && e.endAt <= e.startAt)
      fail("終了日時は開始日時より後にしてください。");
    if (
      e.allDay &&
      (!e.startAt.endsWith("T00:00") ||
        (e.endAt && !e.endAt.endsWith("T00:00")))
    )
      fail("終日予定の時刻が不正です。");
    if (
      (e.plan.bagId && !sets.bags.has(e.plan.bagId)) ||
      (e.categoryId && !sets.categories.has(e.categoryId))
    )
      fail("予定のバッグ・カテゴリが見つかりません。");
    if (
      [...e.plan.addedItemIds, ...e.plan.removedItemIds].some(
        (i) => !sets.items.has(i),
      )
    )
      fail("予定の持ち物が見つかりません。");
    if (
      (e.recurrence === "weekly" && !e.weekdays.length) ||
      (e.until && e.until < e.startAt.slice(0, 10))
    )
      fail("繰り返し設定が不正です。");
  };
  active(s.events).forEach(checkEvent);
  const keys = new Set<string>();
  for (const o of active(s.overrides)) {
    const base = active(s.events).find((e) => e.id === o.eventId);
    if (
      !base ||
      base.recurrence === "none" ||
      !isOccurrence(base, o.date) ||
      keys.has(`${o.eventId}@${o.date}`)
    )
      fail("特定回の変更が不正・重複しています。");
    keys.add(`${o.eventId}@${o.date}`);
    if (!o.deleted) checkEvent(occurrence(s, base!, o.date)!);
  }
  for (const r of active(s.rules))
    if (!sets.bags.has(r.bagId) || !r.weekdays.length)
      fail("曜日ルールが不正です。");
  return s;
}
export function sampleState(now = new Date()): State {
  const s = emptyState(now);
  s.settings.onboarded = true;
  s.settings.sample = true;
  const backpack = id(),
    mini = id();
  s.items = ["財布", "鍵", "ノートPC", "学生証", "イヤホン", "スマホ"].map(
    (name, n) => ({
      id: id(),
      name,
      memo: "",
      imageId: null,
      icon: guessIcon(name),
      location: {
        ...homeLocation(now),
        containerId:
          n === 5
            ? "worn"
            : n === 1
              ? "home"
              : n === 2 || n === 3
                ? backpack
                : mini,
      },
      ...entityStamp(now),
    }),
  );
  s.containers.push(
    {
      id: backpack,
      kind: "bag",
      name: "いつものリュック",
      memo: "",
      color: "sage",
      imageId: null,
      itemIds: s.items.slice(0, 4).map((i) => i.id),
      ...entityStamp(now),
    },
    {
      id: mini,
      kind: "bag",
      name: "ミニバッグ",
      memo: "",
      color: "sand",
      imageId: null,
      itemIds: [s.items[0].id, s.items[1].id, s.items[4].id],
      ...entityStamp(now),
    },
  );
  s.categories = [
    { id: id(), name: "大学", defaultBagId: backpack, ...entityStamp(now) },
    { id: id(), name: "プライベート", defaultBagId: mini, ...entityStamp(now) },
  ];
  const day = addDays(dateKey(now), 1);
  s.events = [
    {
      ...newEvent(day, now),
      title: "大学で作業",
      plan: { ...emptyPlan(), bagId: backpack },
      categoryId: s.categories[0].id,
      endAt: `${day}T16:00`,
      recurrence: "weekly",
      weekdays: [dateAt(day).getDay()],
    },
    {
      ...newEvent(day, now),
      title: "友達とごはん",
      plan: { ...emptyPlan(), bagId: mini },
      categoryId: s.categories[1].id,
      startAt: `${day}T18:30`,
      endAt: `${day}T20:30`,
    },
  ];
  return s;
}
