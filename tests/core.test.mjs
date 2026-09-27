import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../src/legacy/core.js";
import { Repository } from "../src/legacy/storage.js";

const fixture = () => C.sampleState(new Date("2026-09-26T10:00:00"));
const event = (s) => C.upcoming(s, new Date("2026-09-26T10:00:00"))[0];
test("差分だけを提示し、同じバッグ内の物と不要物を無視する", () => {
  const s = fixture(),
    e = event(s),
    actions = C.preparation(s, e);
  assert.deepEqual(
    actions.map((a) => [a.item.name, a.kind]),
    [
      ["財布", "move"],
      ["鍵", "pack"],
    ],
  );
  const pc = s.items.find((i) => i.name === "ノートPC");
  e.removedItemIds = [pc.id];
  assert.equal(C.preparation(s, e).length, 2);
  assert.equal(pc.location.bagId, e.bagId);
});
test("追加・除外は基本セットを変えず、除外を優先する", () => {
  const s = fixture(),
    e = event(s),
    extra = s.items.at(-1),
    base = [...s.bags[0].itemIds];
  e.addedItemIds = [extra.id, base[0]];
  e.removedItemIds = [base[0]];
  assert(C.requiredItems(s, e).some((i) => i.id === extra.id));
  assert(!C.requiredItems(s, e).some((i) => i.id === base[0]));
  assert.deepEqual(s.bags[0].itemIds, base);
});
test("不明とその他の位置から必要な行動を求める", () => {
  const s = fixture(),
    e = event(s);
  C.setLocation(s, [s.items[0].id], "unknown");
  C.setLocation(s, [s.items[1].id], "other");
  assert.deepEqual(
    C.preparation(s, e).map((a) => a.kind),
    ["find", "pack"],
  );
});
test("個別・一括完了後に位置を更新し、同日の次のバッグ切り替えを再計算", () => {
  const s = fixture(),
    [morning, evening] = C.upcoming(s, new Date("2026-09-26T10:00:00"));
  C.completePreparation(s, morning, [s.items[0].id]);
  assert.equal(C.preparation(s, morning).length, 1);
  C.completePreparation(
    s,
    morning,
    C.preparation(s, morning).map((a) => a.item.id),
  );
  assert.equal(C.preparation(s, morning).length, 0);
  assert.deepEqual(
    C.preparation(s, evening).map((a) => a.item.name),
    ["財布", "鍵"],
  );
  assert.equal(s.items[4].location.bagId, s.bags[1].id);
  C.validateState(s);
});
test("バッグを使わない予定は準備対象から外れる", () => {
  const s = fixture();
  s.events.forEach((e) => (e.bagId = null));
  assert.deepEqual(C.upcoming(s), []);
  assert.deepEqual(C.requiredItems(s, s.events[0]), []);
});
test("毎日・毎週・毎月、月末、うるう年を展開する", () => {
  const s = fixture();
  s.events = [
    {
      ...s.events[0],
      startAt: "2024-01-31T09:00",
      endAt: "2024-01-31T10:00",
      recurrence: "monthly",
    },
  ];
  assert.deepEqual(
    C.occurrencesBetween(s, "2024-01-01", "2024-04-01").map(
      (e) => e.occurrenceDate,
    ),
    ["2024-01-31", "2024-03-31"],
  );
  s.events[0].recurrence = "daily";
  s.events[0].until = "2024-03-01";
  assert.deepEqual(
    C.occurrencesBetween(s, "2024-02-28", "2024-03-04").map(
      (e) => e.occurrenceDate,
    ),
    ["2024-02-28", "2024-02-29", "2024-03-01"],
  );
  s.events[0].recurrence = "weekly";
  assert.deepEqual(
    C.occurrencesBetween(s, "2024-02-01", "2024-02-16").map(
      (e) => e.occurrenceDate,
    ),
    ["2024-02-07", "2024-02-14"],
  );
});
test("特定回の日時・バッグ・持ち物・メモの変更は元予定を変更しない", () => {
  const s = fixture(),
    base = s.events[0],
    original = structuredClone(base);
  C.saveOccurrence(s, base.id, "2026-09-27", {
    title: "変更した回",
    startAt: "2026-10-02T11:00",
    endAt: "2026-10-02T13:00",
    bagId: s.bags[1].id,
    addedItemIds: [s.items[5].id],
    removedItemIds: [s.items[0].id],
    memo: "この回のメモ",
  });
  assert.deepEqual(base, original);
  assert.equal(
    C.occurrencesBetween(s, "2026-09-27", "2026-09-28").filter(
      (e) => e.baseId === base.id,
    ).length,
    0,
  );
  const moved = C.occurrencesBetween(s, "2026-10-02", "2026-10-03")[0];
  assert.equal(moved.title, "変更した回");
  assert.equal(moved.memo, "この回のメモ");
  assert.equal(moved.occurrenceDate, "2026-09-27");
  C.validateState(s);
});
test("特定回の変更を戻すと例外は消え、削除はこの回と全体を区別する", () => {
  const s = fixture(),
    e = event(s),
    date = e.occurrenceDate;
  C.saveOccurrence(s, e.id, date, { title: "一度変更" });
  assert.equal(s.overrides.length, 1);
  C.saveOccurrence(s, e.id, date, { ...e });
  assert.equal(s.overrides.length, 0);
  C.removeEvent(s, e.id, date, "one");
  assert.equal(C.occurrence(s, s.events[0], date), null);
  assert(C.occurrence(s, s.events[0], C.addDays(date, 7)));
  C.validateState(s);
  C.removeEvent(s, e.id, date, "all");
  assert.equal(s.overrides.length, 0);
  assert(!s.events.some((x) => x.id === e.id));
});
test("複数日の予定は各日に表示し、終了日午前0時は翌日に表示しない", () => {
  const s = fixture();
  s.events = [
    { ...s.events[1], startAt: "2026-09-27T20:00", endAt: "2026-09-30T00:00" },
  ];
  assert.equal(C.occurrencesBetween(s, "2026-09-29", "2026-09-30").length, 1);
  assert.equal(C.occurrencesBetween(s, "2026-09-30", "2026-10-01").length, 0);
});
test("次の予定は現在時刻以降、遠い将来とバッグなし系列への例外も対象", () => {
  const s = fixture();
  const base = s.events[0];
  base.bagId = null;
  s.events = [base];
  C.saveOccurrence(s, base.id, "2026-10-04", { bagId: s.bags[0].id });
  assert.equal(
    C.upcoming(s, new Date("2026-09-28T00:00:00"))[0].occurrenceDate,
    "2026-10-04",
  );
  s.events[0] = {
    ...base,
    startAt: "2030-04-01T09:00",
    endAt: "2030-04-01T10:00",
    bagId: s.bags[0].id,
  };
  s.overrides = [];
  assert.equal(
    C.upcoming(s, new Date("2026-09-28T00:00:00"))[0].startAt,
    "2030-04-01T09:00",
  );
});
test("バッグ・持ち物・タグ削除時に例外を含む参照が残らない", () => {
  const s = fixture(),
    base = s.events[0],
    bag = s.bags[1],
    item = s.items[0],
    tag = s.tags[0];
  C.saveOccurrence(s, base.id, "2026-09-27", {
    bagId: bag.id,
    addedItemIds: [item.id],
    tagIds: [tag.id, s.tags[1].id],
  });
  C.removeBag(s, bag.id);
  assert.equal(s.items[0].location.type, "unknown");
  assert.equal(s.overrides[0].changes.bagId, null);
  C.validateState(s);
  C.removeItem(s, item.id);
  assert(!s.bags.some((b) => b.itemIds.includes(item.id)));
  assert.deepEqual(s.overrides[0].changes.addedItemIds, []);
  C.validateState(s);
  C.removeTag(s, tag.id);
  assert.deepEqual(s.overrides[0].changes.tagIds, [s.tags[0].id]);
  assert.equal(s.events.length, 2);
  C.validateState(s);
});
class MemoryStorage {
  constructor() {
    this.data = new Map();
  }
  getItem(key) {
    return this.data.get(key) ?? null;
  }
  setItem(key, value) {
    this.data.set(key, value);
  }
}
test("永続化と写真を含むバックアップが完全に往復する", () => {
  const memory = new MemoryStorage(),
    r = new Repository(memory, "/project/");
  r.load();
  const s = fixture();
  s.bags[0].image = "data:image/png;base64,aGVsbG8=";
  C.saveOccurrence(s, s.events[0].id, "2026-09-27", { memo: "特定回" });
  const saved = r.save(s);
  assert.deepEqual(new Repository(memory, "/project/").load(), saved);
  assert.deepEqual(r.import(r.export(saved)), saved);
  assert.equal(new Repository(memory, "/another/").load().events.length, 0);
});
test("別タブの変更を上書きしない", () => {
  const memory = new MemoryStorage(),
    a = new Repository(memory, "/"),
    b = new Repository(memory, "/");
  const stateA = a.load(),
    stateB = b.load();
  a.save(stateA);
  assert.throws(() => b.save(stateB), /別のタブ/);
});
test("保存失敗時は保存前のデータを保つ", () => {
  const memory = new MemoryStorage(),
    r = new Repository(memory, "/");
  r.load();
  r.save(fixture());
  const original = r.raw;
  memory.setItem = () => {
    throw new Error("quota");
  };
  assert.throws(() => r.save(C.emptyState()), /保存ができません/);
  assert.equal(r.raw, original);
  assert.equal(memory.getItem(r.key), original);
});
test("不正なバックアップを拒否し、既存の保存を変更しない", () => {
  const r = new Repository(new MemoryStorage(), "/");
  r.load();
  r.save(fixture());
  const before = r.raw;
  for (const corrupt of [
    (s) => (s.version = 900),
    (s) => (s.items[0].id = s.items[1].id),
    (s) => (s.events[0].bagId = "missing"),
    (s) => (s.events[0].startAt = "2026-02-30T10:00"),
    (s) => (s.bags[0].image = "javascript:alert(1)"),
    (s) => (s.items[0].location.type = "invalid"),
    (s) => (s.events[0].endAt = s.events[0].startAt),
    (s) => (s.events[0].tagIds = ["missing"]),
  ]) {
    const s = fixture();
    corrupt(s);
    assert.throws(() =>
      r.import(JSON.stringify({ app: "PackCalendar", data: s })),
    );
  }
  assert.throws(() => r.import("{bad"));
  assert.throws(() =>
    r.import(JSON.stringify({ app: "Unknown", data: fixture() })),
  );
  assert.equal(r.raw, before);
});
test("壊れた保存を自動的にサンプルや空の状態に置き換えない", () => {
  const memory = new MemoryStorage(),
    r = new Repository(memory, "/");
  memory.setItem(r.key, "{bad");
  assert.throws(() => r.load());
  assert.equal(memory.getItem(r.key), "{bad");
  assert.equal(r.raw, "{bad");
});
