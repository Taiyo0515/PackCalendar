import test from "node:test";
import assert from "node:assert/strict";
import * as C from "../../src/core/domain";
import { buildSchedule } from "../../src/core/notifications";
const now = new Date("2026-09-26T10:00:00");
const fixture = () => C.sampleState(now);
const next = (s: C.State) => C.upcoming(s, now);
test("差分・追加除外・身につける・不要物を動かさない", () => {
  const s = fixture(),
    e = next(s)[0],
    original = [...C.bags(s)[0].itemIds];
  assert.deepEqual(
    C.preparation(s, e.plan).map((a) => [a.item.name, a.kind]),
    [
      ["財布", "move"],
      ["鍵", "pack"],
    ],
  );
  e.plan.addedItemIds = [s.items[5].id, s.items[0].id];
  e.plan.removedItemIds = [s.items[0].id];
  assert.deepEqual(
    C.preparation(s, e.plan).map((a) => a.item.name),
    ["鍵"],
  );
  assert.deepEqual(C.bags(s)[0].itemIds, original);
  C.completePreparation(s, e, undefined, "prep", now);
  assert.equal(s.items[5].location.containerId, "worn");
  assert.equal(s.items[4].location.containerId, C.bags(s)[1].id);
  C.validateState(s);
});
test("名前付き保管場所・不明の差分と削除", () => {
  const s = fixture(),
    e = next(s)[0];
  s.containers.push({
    id: "locker",
    name: "職場ロッカー",
    kind: "place",
    color: "blue",
    imageId: null,
    memo: "",
    itemIds: [],
    ...C.entityStamp(now),
  });
  C.moveItems(s, [s.items[0].id], "locker", { at: now });
  C.moveItems(s, [s.items[1].id], null, { at: now });
  assert.deepEqual(
    C.preparation(s, e.plan).map((a) => [a.from, a.kind]),
    [
      ["職場ロッカー", "pack"],
      ["不明", "find"],
    ],
  );
  C.removeContainer(s, "locker");
  assert.equal(s.items[0].location.containerId, null);
  assert(s.containers.find((c) => c.id === "locker")?.deletedAt);
  assert.throws(() => C.removeContainer(s, "home"));
  C.validateState(s);
});
test("同じ日の同じバッグの連続予定は必要セットを合併、違うバッグで分割", () => {
  const s = fixture(),
    morning = next(s)[0];
  s.events.push({
    ...s.events[0],
    id: C.id(),
    title: "追加の作業",
    startAt: "2026-09-27T17:00",
    endAt: null,
    recurrence: "none",
    plan: {
      ...s.events[0].plan,
      temporaryItems: ["書類"],
      removedItemIds: [s.items[0].id],
      addedItemIds: [s.items[4].id],
    },
  });
  const units = C.groupUnits(s, next(s));
  assert.equal(units.length, 2);
  assert.equal(units[0].events.length, 2);
  assert.deepEqual(
    new Set(C.unitActions(s, units[0]).map((a) => a.item.name)),
    new Set(["財布", "鍵", "イヤホン"]),
  );
  assert.equal(C.groupedLines(s, units[0]).at(-1)?.label, "今回だけ");
  assert.equal(morning.plan.bagId, units[0].event.plan.bagId);
});
test("まとめた予定で全員が除外した物を再追加しない", () => {
  const s = fixture();
  s.events[0].plan.removedItemIds = [s.items[0].id];
  const unit = C.groupUnits(s, [next(s)[0]])[0];
  assert(
    !C.requiredItems(s, C.unitEvent(s, unit).plan).some(
      (i) => i.id === s.items[0].id,
    ),
  );
});
test("48時間の上限とバッグなし予定", () => {
  const s = fixture();
  s.events = [{ ...s.events[0], startAt: "2026-10-15T09:00", endAt: null }];
  assert.equal(next(s).length, 0);
  s.events = [{ ...C.newEvent("2026-09-27", now), title: "締切" }];
  assert.equal(next(s).length, 0);
  assert.equal(C.occurrencesBetween(s, "2026-09-27", "2026-09-28").length, 1);
});
test("毎週複数曜日・終了日・毎日・旧月次の月末", () => {
  const s = fixture();
  s.events = [
    {
      ...s.events[0],
      startAt: "2026-09-28T09:00",
      endAt: null,
      weekdays: [1, 3, 5],
      until: "2026-10-02",
    },
  ];
  assert.deepEqual(
    C.occurrencesBetween(s, "2026-09-28", "2026-10-07").map(
      (e) => e.occurrenceDate,
    ),
    ["2026-09-28", "2026-09-30", "2026-10-02"],
  );
  s.events[0].recurrence = "daily";
  assert.equal(C.occurrencesBetween(s, "2026-09-28", "2026-10-07").length, 5);
  Object.assign(s.events[0], {
    startAt: "2024-01-31T09:00",
    recurrence: "monthly",
    until: null,
  });
  assert.deepEqual(
    C.occurrencesBetween(s, "2024-01-01", "2024-04-01").map(
      (e) => e.occurrenceDate,
    ),
    ["2024-01-31", "2024-03-31"],
  );
});
test("終日・終了なし・日またぎの重なり", () => {
  const s = fixture();
  s.events = [
    {
      ...C.newEvent("2026-09-27", now),
      title: "終日",
      allDay: true,
      startAt: "2026-09-27T00:00",
    },
  ];
  assert.equal(C.occurrencesBetween(s, "2026-09-27", "2026-09-28").length, 1);
  assert.equal(C.occurrencesBetween(s, "2026-09-28", "2026-09-29").length, 0);
  s.events[0].endAt = "2026-09-29T00:00";
  assert.equal(C.occurrencesBetween(s, "2026-09-28", "2026-09-29").length, 1);
  assert.equal(C.occurrencesBetween(s, "2026-09-29", "2026-09-30").length, 0);
  C.validateState(s);
});
test("例外のPackPlan部分パッチ・移動した例外・この回の削除", () => {
  const s = fixture(),
    original = structuredClone(s.events[0]);
  C.saveOccurrence(s, original.id, "2026-09-27", {
    title: "別の日",
    startAt: "2026-10-05T09:00",
    endAt: null,
    plan: { temporaryItems: ["返却する本"] },
  });
  const moved = C.occurrencesBetween(s, "2026-10-05", "2026-10-06")[0];
  assert.equal(moved.title, "別の日");
  assert.equal(moved.plan.bagId, original.plan.bagId);
  assert.deepEqual(moved.plan.temporaryItems, ["返却する本"]);
  assert.deepEqual(s.events[0], original);
  C.removeEvent(s, original.id, "2026-09-27", "one");
  assert.equal(C.occurrencesBetween(s, "2026-10-05", "2026-10-06").length, 0);
  C.validateState(s);
});
test("自動完了は時系列・一度だけ・身につける位置を維持", () => {
  const s = fixture();
  const count = C.advanceAutomatic(s, new Date("2026-09-27T19:00"));
  assert.equal(count, 4);
  assert.equal(s.items[0].location.containerId, C.bags(s)[1].id);
  assert.equal(s.items[1].location.containerId, C.bags(s)[1].id);
  assert.equal(s.items[5].location.containerId, "worn");
  assert.equal(C.advanceAutomatic(s, new Date("2026-09-27T20:00")), 0);
  assert.equal(s.moves.filter((m) => m.source === "auto").length, 4);
  C.validateState(s);
});
test("開始後の手動修正を後追い自動記録で上書きしない", () => {
  const s = fixture();
  C.moveItems(s, [s.items[0].id], "home", { at: new Date("2026-09-27T12:00") });
  C.advanceAutomatic(s, new Date("2026-09-27T13:00"));
  assert.equal(s.items[0].location.containerId, "home");
  assert.equal(s.items[1].location.containerId, C.bags(s)[0].id);
});
test("自動記録の永続Undoと後の移動の保護", () => {
  const s = fixture();
  C.advanceAutomatic(s, new Date("2026-09-27T10:00"));
  const move = s.moves.find((m) => m.itemId === s.items[0].id)!;
  C.undoMove(s, move.id, new Date("2026-09-27T11:00"));
  assert.equal(s.items[0].location.containerId, C.bags(s)[1].id);
  assert(move.undone);
  assert.throws(() => C.undoMove(s, move.id));
  C.advanceAutomatic(s, new Date("2026-09-27T12:00"));
  assert.equal(s.items[0].location.containerId, C.bags(s)[1].id);
});
test("忘れ物は不明として記録、推定は位置を書き換えない", () => {
  const s = fixture(),
    before = s.items[0].location.containerId;
  C.moveItems(s, [s.items[0].id], null, {
    source: "forgot",
    at: now,
    event: next(s)[0],
  });
  assert.equal(C.suggestLocation(s, s.items[0], now), before);
  assert.equal(s.items[0].location.containerId, null);
  assert.equal(C.metricsSummary(s, now).forgotten, 1);
  assert.equal(s.moves[0].eventTitle, "大学で作業");
});
test("初期の空バッグへの移動だけピン留め、以後は位置だけ", () => {
  const s = fixture(),
    bag = C.bags(s)[0];
  bag.itemIds = [];
  C.moveItems(s, [s.items[0].id, s.items[1].id], bag.id, {
    initialPin: true,
    at: now,
  });
  assert.deepEqual(bag.itemIds, [s.items[0].id, s.items[1].id]);
  C.moveItems(s, [s.items[4].id], bag.id, { initialPin: true, at: now });
  assert(!bag.itemIds.includes(s.items[4].id));
});
test("曜日ルールを具体的なバッグ予定で置き換える", () => {
  const s = fixture();
  s.events = [];
  s.rules.push({
    id: C.id(),
    name: "通学",
    bagId: C.bags(s)[0].id,
    weekdays: [1, 3, 5],
    time: "09:00",
    enabled: true,
    from: "2026-09-26",
    ...C.entityStamp(now),
  });
  assert.equal(
    C.occurrencesBetween(s, "2026-09-28", "2026-09-29")[0].isRule,
    true,
  );
  s.events.push({
    ...C.newEvent("2026-09-28", now),
    title: "別のバッグ",
    plan: { ...C.emptyPlan(), bagId: C.bags(s)[1].id },
  });
  const result = C.occurrencesBetween(s, "2026-09-28", "2026-09-29");
  assert.equal(result.length, 1);
  assert.equal(result[0].isRule, undefined);
});
test("バッグ・持ち物・カテゴリは論理削除と参照整理", () => {
  const s = fixture(),
    e = next(s)[0];
  C.saveOccurrence(s, e.id, e.occurrenceDate, {
    plan: { bagId: C.bags(s)[1].id, addedItemIds: [s.items[4].id] },
  });
  C.removeItem(s, s.items[4].id);
  assert(s.items[4].deletedAt);
  C.removeBag(s, C.bags(s)[1].id);
  assert.equal(s.items[0].location.containerId, null);
  C.removeCategory(s, s.categories[0].id);
  assert.equal(s.events[0].categoryId, null);
  C.removeEvent(s, s.events[0].id, e.occurrenceDate, "all");
  assert(s.events[0].deletedAt);
  C.validateState(s);
});
test("未来通知は移動をシミュレーションし、元データを変更しない", () => {
  const s = fixture();
  s.settings.reminders.enabled = true;
  const original = JSON.stringify(s);
  const schedule = buildSchedule(s, now);
  assert(schedule.length > 0 && schedule.length <= 60);
  const dinner = schedule.find((n) => n.title.includes("友達とごはん"));
  assert(dinner?.body.includes("いつものリュックから：財布・鍵"));
  assert(
    schedule[0].body.includes("自動") ||
      schedule[0].body.includes("準備済みとして記録"),
  );
  assert.equal(JSON.stringify(s), original);
  assert(schedule.every((n) => new Date(n.at) > now));
});
test("差分なし・通知無効なら予約しない、一時持ち物は通知する", () => {
  const s = fixture();
  s.events = [s.events[0]];
  s.events[0].recurrence = "none";
  C.completePreparation(s, next(s)[0], undefined, "prep", now);
  s.settings.reminders.enabled = true;
  assert.deepEqual(buildSchedule(s, now), []);
  s.events[0].plan.temporaryItems = ["書類"];
  s.processed = [];
  assert(buildSchedule(s, now).some((n) => n.body.includes("今回だけ：書類")));
  s.settings.reminders.enabled = false;
  assert.deepEqual(buildSchedule(s, now), []);
});
test("不正な日時・参照・重複・部分パッチを拒否", () => {
  const s = fixture();
  s.events[0].startAt = "2026-02-31T09:00";
  assert.throws(() => C.validateState(s));
  const a = fixture();
  a.events[0].plan.addedItemIds = ["missing"];
  assert.throws(() => C.validateState(a));
  const b = fixture();
  b.items.push(b.items[0]);
  assert.throws(() => C.validateState(b));
  const c = fixture();
  c.events[0].endAt = c.events[0].startAt;
  assert.throws(() => C.validateState(c));
});

test("連続する同じバッグの追加品も最初の出発で自動記録する", () => {
  const s = fixture(),
    bag = C.bags(s)[0],
    item = s.items[4];
  s.events.push({
    ...s.events[0],
    id: C.id(),
    startAt: "2026-09-27T17:00",
    endAt: null,
    recurrence: "none",
    plan: { ...s.events[0].plan, addedItemIds: [item.id] },
  });
  C.advanceAutomatic(s, new Date("2026-09-27T09:01"));
  assert.equal(item.location.containerId, bag.id);
  assert.equal(new Date(item.location.updatedAt).getHours(), 9);
  C.moveItems(s, [item.id], "home", { at: new Date("2026-09-27T16:00") });
  C.advanceAutomatic(s, new Date("2026-09-27T17:01"));
  assert.equal(item.location.containerId, "home");
});
test("通知の長い日本語文面はPushのペイロード上限に収める", () => {
  const s = fixture();
  s.settings.reminders.enabled = true;
  s.events[0].title = "長".repeat(200);
  s.events[0].plan.temporaryItems = Array.from(
    { length: 100 },
    (_, i) => `${i}持ち物${"あ".repeat(180)}`,
  );
  for (const n of buildSchedule(s, now))
    assert(new TextEncoder().encode(JSON.stringify(n)).length < 3900);
});
test("保存時の予定はオフセット付き、読み込み後はローカルの繰り返しとして扱う", () => {
  const s = fixture(),
    saved = C.stateForStorage(s);
  assert.match(saved.events[0].startAt, /[+-]\d{2}:\d{2}$/);
  assert.equal(C.validateState(saved).events[0].startAt, s.events[0].startAt);
  assert.deepEqual(
    C.occurrencesBetween(C.validateState(saved), "2026-09-27", "2026-10-03"),
    C.occurrencesBetween(s, "2026-09-27", "2026-10-03"),
  );
});
