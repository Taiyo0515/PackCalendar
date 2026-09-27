// Pure domain functions. Dates are local wall-clock values, without UTC conversion.
export const VERSION = 1;
export const COLORS = ["sage", "sand", "blue", "rose", "plum"];
export const ICONS = [
  "bag",
  "wallet",
  "key",
  "laptop",
  "phone",
  "book",
  "headphones",
  "bottle",
  "item",
];
export function id() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const pad = (n) => String(n).padStart(2, "0");
export const dateKey = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d) =>
  `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dateAt = (s) => new Date(`${s.slice(0, 10)}T12:00:00`);
export function addDays(s, n) {
  const d = dateAt(s);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function dayDiff(a, b) {
  return (
    (Date.parse(`${b.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) /
    86400000
  );
}
export function emptyState() {
  return {
    version: VERSION,
    revision: 0,
    bags: [],
    items: [],
    events: [],
    overrides: [],
    tags: [],
    settings: { weekStart: 1, onboarded: false, sample: false },
  };
}
export const bagById = (s, bagId) => s.bags.find((b) => b.id === bagId);
export function locationName(s, location) {
  return location?.type === "bag"
    ? (bagById(s, location.bagId)?.name ?? "不明")
    : ({ home: "自宅", other: "その他", unknown: "不明" }[location?.type] ??
        "不明");
}
export function requiredItems(s, event) {
  if (!event?.bagId || !bagById(s, event.bagId)) return [];
  const ids = new Set([
    ...bagById(s, event.bagId).itemIds,
    ...(event.addedItemIds ?? []),
  ]);
  for (const itemId of event.removedItemIds ?? []) ids.delete(itemId);
  return s.items.filter((item) => ids.has(item.id));
}
export function preparation(s, event) {
  return requiredItems(s, event)
    .filter(
      (item) =>
        item.location.type !== "bag" || item.location.bagId !== event.bagId,
    )
    .map((item) => ({
      item,
      from: locationName(s, item.location),
      to: bagById(s, event.bagId).name,
      kind:
        item.location.type === "bag"
          ? "move"
          : item.location.type === "unknown"
            ? "find"
            : "pack",
    }));
}
export function setLocation(s, itemIds, type, bagId = null) {
  if (
    !["home", "other", "unknown", "bag"].includes(type) ||
    (type === "bag" && !bagById(s, bagId))
  )
    throw new Error("位置が見つかりません。");
  for (const item of s.items)
    if (itemIds.includes(item.id))
      item.location = {
        type,
        bagId: type === "bag" ? bagId : null,
        updatedAt: new Date().toISOString(),
      };
}
export function completePreparation(s, event, itemIds) {
  const allowed = preparation(s, event).map((a) => a.item.id);
  setLocation(
    s,
    itemIds.filter((x) => allowed.includes(x)),
    "bag",
    event.bagId,
  );
}
export function isOccurrence(event, date) {
  const base = event.startAt.slice(0, 10);
  if (date < base || (event.until && date > event.until)) return false;
  if (event.recurrence === "none") return date === base;
  if (event.recurrence === "daily") return true;
  if (event.recurrence === "weekly") return dayDiff(base, date) % 7 === 0;
  return date.slice(8, 10) === base.slice(8, 10); // 31st skips months without a 31st.
}
export function occurrence(s, event, date) {
  const days = dayDiff(event.startAt, event.endAt);
  const override = s.overrides.find(
    (o) => o.eventId === event.id && o.date === date,
  );
  if (override?.deleted) return null;
  return {
    ...event,
    startAt: `${date}T${event.startAt.slice(11)}`,
    endAt: `${addDays(date, days)}T${event.endAt.slice(11)}`,
    ...override?.changes,
    baseId: event.id,
    occurrenceDate: date,
    key: `${event.id}@${date}`,
    isOverride: !!override,
  };
}
export function occurrencesBetween(s, from, to) {
  const result = new Map();
  const overlaps = (e) =>
    e && e.startAt < `${to}T00:00` && e.endAt > `${from}T00:00`;
  for (const event of s.events) {
    if (event.recurrence === "none") {
      const e = occurrence(s, event, event.startAt.slice(0, 10));
      if (overlaps(e)) result.set(e.key, e);
      continue;
    }
    const earliest = addDays(
      from,
      -Math.ceil(dayDiff(event.startAt, event.endAt)),
    );
    let d =
      earliest > event.startAt.slice(0, 10)
        ? earliest
        : event.startAt.slice(0, 10);
    const last = event.until && event.until < to ? addDays(event.until, 1) : to;
    for (; d < last; d = addDays(d, 1))
      if (isOccurrence(event, d)) {
        const e = occurrence(s, event, d);
        if (overlaps(e)) result.set(e.key, e);
      }
    // Moved exceptions can originate outside the visible date range.
    for (const o of s.overrides.filter((o) => o.eventId === event.id)) {
      if (!isOccurrence(event, o.date)) continue;
      const e = occurrence(s, event, o.date);
      if (overlaps(e)) result.set(e.key, e);
    }
  }
  return [...result.values()].sort(
    (a, b) =>
      a.startAt.localeCompare(b.startAt) || a.title.localeCompare(b.title),
  );
}
export function upcoming(s, now = new Date(), limit = 8) {
  const stamp = localTime(now);
  const today = dateKey(now);
  const all = new Map();
  for (const event of s.events.filter((e) => e.bagId)) {
    const start =
      event.startAt.slice(0, 10) > today ? event.startAt.slice(0, 10) : today;
    const subset = { ...s, events: [event] };
    for (const e of occurrencesBetween(subset, start, addDays(start, 370)))
      if (e.startAt >= stamp && e.bagId) all.set(e.key, e);
    // An override may add a bag to an otherwise bagless series (handled below).
  }
  for (const o of s.overrides) {
    const base = s.events.find((e) => e.id === o.eventId);
    if (base && isOccurrence(base, o.date)) {
      const e = occurrence(s, base, o.date);
      if (e && e.bagId && e.startAt >= stamp) all.set(e.key, e);
    }
  }
  return [...all.values()]
    .sort(
      (a, b) =>
        a.startAt.localeCompare(b.startAt) || a.title.localeCompare(b.title),
    )
    .slice(0, limit);
}
export function saveOccurrence(s, baseId, date, changes) {
  const base = s.events.find((e) => e.id === baseId);
  if (!base || base.recurrence === "none")
    throw new Error("繰り返し予定が見つかりません。");
  const original = occurrence({ ...s, overrides: [] }, base, date);
  const delta = {};
  for (const field of [
    "title",
    "startAt",
    "endAt",
    "bagId",
    "tagIds",
    "memo",
    "addedItemIds",
    "removedItemIds",
  ]) {
    if (
      Object.hasOwn(changes, field) &&
      JSON.stringify(changes[field]) !== JSON.stringify(original[field])
    )
      delta[field] = changes[field];
  }
  s.overrides = s.overrides.filter(
    (o) => o.eventId !== baseId || o.date !== date,
  );
  if (Object.keys(delta).length)
    s.overrides.push({
      id: id(),
      eventId: baseId,
      date,
      deleted: false,
      changes: delta,
    });
}
export function removeEvent(s, baseId, date, scope) {
  const event = s.events.find((e) => e.id === baseId);
  if (event?.recurrence !== "none" && scope === "one") {
    s.overrides = s.overrides.filter(
      (o) => o.eventId !== baseId || o.date !== date,
    );
    s.overrides.push({
      id: id(),
      eventId: baseId,
      date,
      deleted: true,
      changes: {},
    });
  } else {
    s.events = s.events.filter((e) => e.id !== baseId);
    s.overrides = s.overrides.filter((o) => o.eventId !== baseId);
  }
}
export function removeBag(s, bagId) {
  s.bags = s.bags.filter((b) => b.id !== bagId);
  for (const e of s.events) if (e.bagId === bagId) e.bagId = null;
  for (const o of s.overrides)
    if (o.changes.bagId === bagId) o.changes.bagId = null;
  for (const t of s.tags) if (t.defaultBagId === bagId) t.defaultBagId = null;
  setLocation(
    s,
    s.items.filter((i) => i.location.bagId === bagId).map((i) => i.id),
    "unknown",
  );
}
export function removeItem(s, itemId) {
  s.items = s.items.filter((i) => i.id !== itemId);
  for (const b of s.bags) b.itemIds = b.itemIds.filter((x) => x !== itemId);
  for (const e of [...s.events, ...s.overrides.map((o) => o.changes)])
    for (const k of ["addedItemIds", "removedItemIds"])
      if (e[k]) e[k] = e[k].filter((x) => x !== itemId);
}
export function removeTag(s, tagId) {
  s.tags = s.tags.filter((t) => t.id !== tagId);
  for (const e of [...s.events, ...s.overrides.map((o) => o.changes)])
    if (e.tagIds) e.tagIds = e.tagIds.filter((x) => x !== tagId);
}
export function sampleState(now = new Date()) {
  const s = emptyState();
  s.settings = { ...s.settings, onboarded: true, sample: true };
  const bag1 = id(),
    bag2 = id();
  s.items = [
    ["財布", "wallet", "bag", bag2],
    ["鍵", "key", "home", null],
    ["ノートPC", "laptop", "bag", bag1],
    ["学生証", "item", "bag", bag1],
    ["イヤホン", "headphones", "bag", bag2],
    ["モバイルバッテリー", "phone", "home", null],
  ].map(([name, icon, type, bagId]) => ({
    id: id(),
    name,
    icon,
    memo: "",
    image: null,
    location: { type, bagId, updatedAt: now.toISOString() },
  }));
  const ids = s.items.map((i) => i.id);
  s.bags = [
    {
      id: bag1,
      name: "いつものリュック",
      memo: "大学・作業の日に",
      color: "sage",
      image: null,
      itemIds: ids.slice(0, 4),
    },
    {
      id: bag2,
      name: "ミニバッグ",
      memo: "身軽に出かける日",
      color: "sand",
      image: null,
      itemIds: [ids[0], ids[1], ids[4]],
    },
  ];
  s.tags = [
    { id: id(), name: "大学", color: "sage", defaultBagId: bag1 },
    { id: id(), name: "プライベート", color: "sand", defaultBagId: bag2 },
  ];
  const tomorrow = addDays(dateKey(now), 1);
  const ev = (title, time, end, bagId, tag, recurrence = "none") => ({
    id: id(),
    title,
    startAt: `${tomorrow}T${time}`,
    endAt: `${tomorrow}T${end}`,
    bagId,
    tagIds: [tag],
    memo: "",
    recurrence,
    recurrenceId: recurrence === "none" ? null : id(),
    until: null,
    addedItemIds: [],
    removedItemIds: [],
  });
  s.events = [
    ev("大学で作業", "09:00", "16:00", bag1, s.tags[0].id, "weekly"),
    ev("友達とごはん", "18:30", "20:30", bag2, s.tags[1].id),
  ];
  return s;
}

// Strict validation runs before every atomic save and before importing any backup.
export function validateState(s) {
  const fail = (message) => {
    throw new Error(`データを読み込めません：${message}`);
  };
  if (!s || s.version !== VERSION)
    fail("対応していないデータ形式・バージョンです。");
  const str = (x, max = 200) => typeof x === "string" && x.length <= max;
  const name = (x) => str(x) && x.trim().length > 0;
  const validDate = (x) =>
    typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(x) &&
    x >= "1900-01-01" &&
    x <= "2200-12-31" &&
    !isNaN(dateAt(x)) &&
    dateKey(dateAt(x)) === x;
  const validTime = (x) =>
    typeof x === "string" &&
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(x) &&
    validDate(x.slice(0, 10));
  const sets = {};
  for (const key of ["bags", "items", "events", "overrides", "tags"]) {
    if (!Array.isArray(s[key]) || s[key].length > 10000)
      fail(`${key} の一覧が不正です。`);
    sets[key] = new Set();
    for (const obj of s[key]) {
      if (
        !obj ||
        typeof obj !== "object" ||
        !str(obj.id, 100) ||
        !/^[a-zA-Z0-9_-]+$/.test(obj.id) ||
        sets[key].has(obj.id)
      )
        fail(`${key} のIDが不正・重複しています。`);
      sets[key].add(obj.id);
    }
  }
  const ref = (value, key, nullable = false) =>
    (nullable && value === null) || sets[key].has(value);
  const refs = (values, key) =>
    Array.isArray(values) &&
    values.length <= 10000 &&
    new Set(values).size === values.length &&
    values.every((v) => ref(v, key));
  const photo = (p) =>
    p === null ||
    (typeof p === "string" &&
      p.length <= 220000 &&
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(p));
  for (const b of s.bags)
    if (
      !name(b.name) ||
      !str(b.memo, 10000) ||
      !COLORS.includes(b.color) ||
      !photo(b.image) ||
      !refs(b.itemIds, "items")
    )
      fail("バッグの名前・写真・基本セットが不正です。");
  for (const i of s.items) {
    if (
      !name(i.name) ||
      !str(i.memo, 10000) ||
      !ICONS.includes(i.icon) ||
      !photo(i.image)
    )
      fail("持ち物の情報が不正です。");
    const l = i.location;
    if (
      !l ||
      !["bag", "home", "other", "unknown"].includes(l.type) ||
      (l.type === "bag" ? !ref(l.bagId, "bags") : l.bagId !== null) ||
      typeof l.updatedAt !== "string" ||
      isNaN(Date.parse(l.updatedAt))
    )
      fail("記録上の位置が不正です。");
  }
  for (const t of s.tags)
    if (
      !name(t.name) ||
      !COLORS.includes(t.color) ||
      !ref(t.defaultBagId, "bags", true)
    )
      fail("タグの情報が不正です。");
  const eventFields = (e, partial = false) => {
    const check = (k, p) => (!partial || Object.hasOwn(e, k)) && !p(e[k]);
    if (
      check("title", name) ||
      check("memo", (x) => str(x, 10000)) ||
      check("startAt", validTime) ||
      check("endAt", validTime) ||
      check("bagId", (x) => ref(x, "bags", true)) ||
      check("tagIds", (x) => refs(x, "tags")) ||
      check("addedItemIds", (x) => refs(x, "items")) ||
      check("removedItemIds", (x) => refs(x, "items"))
    )
      fail("予定の日時・持ち物・バッグが不正です。");
    if (e.startAt && e.endAt && e.endAt <= e.startAt)
      fail("終了日時は開始日時より後にしてください。");
  };
  for (const e of s.events) {
    eventFields(e);
    if (
      !["none", "daily", "weekly", "monthly"].includes(e.recurrence) ||
      (e.recurrence === "none"
        ? e.recurrenceId !== null
        : !name(e.recurrenceId)) ||
      !(
        e.until === null ||
        (validDate(e.until) && e.until >= e.startAt.slice(0, 10))
      )
    )
      fail("繰り返し設定が不正です。");
  }
  const overrideKeys = new Set();
  for (const o of s.overrides) {
    const base = s.events.find((e) => e.id === o.eventId);
    if (
      !base ||
      base.recurrence === "none" ||
      !validDate(o.date) ||
      !isOccurrence(base, o.date) ||
      typeof o.deleted !== "boolean" ||
      !o.changes ||
      Array.isArray(o.changes)
    )
      fail("特定回の変更が不正です。");
    const key = `${o.eventId}@${o.date}`;
    if (overrideKeys.has(key)) fail("特定回の変更が重複しています。");
    overrideKeys.add(key);
    if (
      Object.keys(o.changes).some(
        (k) =>
          ![
            "title",
            "memo",
            "startAt",
            "endAt",
            "bagId",
            "tagIds",
            "addedItemIds",
            "removedItemIds",
          ].includes(k),
      )
    )
      fail("特定回に未対応の項目があります。");
    eventFields(o.changes, true);
    if (!o.deleted) eventFields(occurrence(s, base, o.date));
  }
  if (
    !s.settings ||
    ![0, 1].includes(s.settings.weekStart) ||
    typeof s.settings.onboarded !== "boolean" ||
    typeof s.settings.sample !== "boolean" ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0
  )
    fail("設定が不正です。");
  return s;
}
