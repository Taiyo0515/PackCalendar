import { test } from "node:test";
import assert from "node:assert/strict";
import { holidaysOf, holidayName } from "../../src/core/holidays";
import { emptyState, emptyPlan, validate, HOME, WORN } from "../../src/core/model";
import type { Event, State } from "../../src/core/model";
import { deleteEvent, occurrences, onDay, saveEvent, saveOne, lastWithTitle } from "../../src/core/calendar";
import { advance, linesOf, nextUnit, unitsBetween, removeBag, removeItem } from "../../src/core/prep";
import { forecast, notices, widgetData } from "../../src/core/schedule";
import { fromV2 } from "../../src/core/migrate";
import { monthGrid } from "../../src/core/date";

const T = (s: string) => new Date(`${s}:00`);
function world(): State {
  const s = emptyState(T("2026-09-27T08:00"));
  s.bags = [
    { id: "pack", name: "リュック", color: "green", itemIds: ["wallet", "key", "pc"] },
    { id: "mini", name: "ミニバッグ", color: "orange", itemIds: ["wallet", "key", "phone"] },
  ];
  const at = "2026-09-27T00:00:00.000Z";
  s.items = [
    { id: "wallet", name: "財布", photoId: null, at: "mini", atTime: at },
    { id: "key", name: "鍵", photoId: null, at: HOME, atTime: at },
    { id: "pc", name: "PC", photoId: null, at: "pack", atTime: at },
    { id: "phone", name: "スマホ", photoId: null, at: WORN, atTime: at },
    { id: "ear", name: "イヤホン", photoId: null, at: null, atTime: at },
  ];
  return s;
}
const ev = (id: string, start: string, bagId: string | null, extra: Partial<Event> = {}): Event => ({
  id,
  title: id,
  start,
  end: null,
  allDay: false,
  memo: "",
  plan: { ...emptyPlan(), bagId },
  repeat: null,
  ...extra,
});

test("holidays 2026 including sandwiched and substitute days", () => {
  const h = holidaysOf(2026);
  assert.equal(h.get("2026-09-21"), "敬老の日");
  assert.equal(h.get("2026-09-22"), "国民の休日");
  assert.equal(h.get("2026-09-23"), "秋分の日");
  assert.equal(h.get("2026-05-06"), "振替休日"); // 5/3 is Sunday
  assert.equal(h.get("2026-03-20"), "春分の日");
  assert.equal(holidayName("2019-04-30"), "国民の休日");
  assert.equal(holidayName("2020-07-24"), "スポーツの日");
  assert.equal(holidayName("2021-08-09"), "振替休日");
  assert.equal(holidayName("2026-09-24"), null);
});

test("month grid starts on the configured weekday", () => {
  assert.equal(monthGrid("2026-09", 0)[0], "2026-08-30");
  assert.equal(monthGrid("2026-09", 1)[0], "2026-08-31");
});

test("repeats, exceptions and scoped edits", () => {
  const s = world();
  s.events.push(ev("univ", "2026-09-28T09:00", "pack", { end: "2026-09-28T16:00", repeat: { freq: "weekly", weekdays: [1, 3], until: null } }));
  const list = occurrences(s, "2026-09-28", "2026-10-06");
  assert.deepEqual(list.map((o) => o.date), ["2026-09-28", "2026-09-30", "2026-10-05"]);
  saveOne(s, "univ@2026-09-30", { ...list[1], title: "休講", plan: { ...list[1].plan, bagId: "mini" } });
  const again = occurrences(s, "2026-09-30", "2026-10-01")[0];
  assert.equal(again.title, "休講");
  assert.equal(again.plan.bagId, "mini");
  assert.deepEqual(Object.keys(s.exceptions), ["univ@2026-09-30"]);
  deleteEvent(s, "univ@2026-10-05", "one");
  assert.equal(onDay(s, "2026-10-05").length, 0);
  // Editing all keeps the first date and moves the time.
  const { id, ...draft } = s.events[0];
  saveEvent(s, id, { ...draft, start: "2026-10-12T10:00", end: "2026-10-12T12:00" });
  assert.equal(s.events[0].start, "2026-09-28T10:00");
  assert.equal(s.events[0].end, "2026-09-28T12:00");
  deleteEvent(s, "univ@2026-09-28", "all");
  assert.equal(s.events.length, 0);
  assert.deepEqual(s.exceptions, {});
});

test("monthly repeat skips months without the date; multi-day events span days", () => {
  const s = world();
  s.events.push(ev("rent", "2026-01-31T10:00", null, { repeat: { freq: "monthly", weekdays: [], until: null } }));
  s.events.push(ev("trip", "2026-10-10T00:00", "mini", { allDay: true, end: "2026-10-13T00:00" }));
  const days = occurrences(s, "2026-02-01", "2026-04-01").map((o) => o.date);
  assert.deepEqual(days, ["2026-03-31"]);
  assert.equal(onDay(s, "2026-10-12").length, 1);
  assert.equal(onDay(s, "2026-10-13").length, 0);
});

test("units merge same bag on the same day and lines group by source", () => {
  const s = world();
  s.events.push(ev("a", "2026-09-28T09:00", "pack"));
  s.events.push(ev("b", "2026-09-28T13:00", "pack", { plan: { bagId: "pack", add: ["ear"], remove: [], extra: ["教科書"] } }));
  s.events.push(ev("c", "2026-09-28T18:00", "mini"));
  const units = unitsBetween(s, T("2026-09-28T00:00"), T("2026-09-29T00:00"));
  assert.equal(units.length, 2);
  assert.deepEqual(units[0].itemIds.sort(), ["ear", "key", "pc", "wallet"]);
  const lines = linesOf(s, units[0]);
  assert.deepEqual(lines.map((l) => [l.label, l.names.join("・")]), [
    ["ミニバッグから", "財布"],
    ["自宅から", "鍵"],
    ["場所不明", "イヤホン"],
    ["今回だけ", "教科書"],
  ]);
  // Worn items never need moving.
  assert.deepEqual(linesOf(s, units[1]).map((l) => l.label), ["自宅から"]);
});

test("next unit is limited to 48 hours", () => {
  const s = world();
  s.events.push(ev("far", "2026-10-02T09:00", "pack"));
  assert.equal(nextUnit(s, T("2026-09-27T08:00")), null);
  s.events.push(ev("near", "2026-09-28T09:00", "pack"));
  assert.equal(nextUnit(s, T("2026-09-27T08:00"))?.title, "near");
});

test("auto completion moves items at start but keeps later manual edits", () => {
  const s = world();
  s.cursor = T("2026-09-28T08:00").toISOString();
  s.events.push(ev("a", "2026-09-28T09:00", "pack"));
  s.items.find((i) => i.id === "key")!.atTime = T("2026-09-28T09:30").toISOString();
  const moved = advance(s, T("2026-09-28T10:00"));
  assert.equal(moved, 1);
  assert.equal(s.items.find((i) => i.id === "wallet")!.at, "pack");
  assert.equal(s.items.find((i) => i.id === "key")!.at, HOME);
  assert.equal(advance(s, T("2026-09-28T11:00")), 0);
  s.settings.auto = false;
  s.events.push(ev("b", "2026-09-28T12:00", "mini"));
  assert.equal(advance(s, T("2026-09-28T13:00")), 0);
  assert.equal(s.cursor, T("2026-09-28T13:00").toISOString());
});

test("forecast and notices assume completion of earlier units", () => {
  const s = world();
  s.settings.remind = { on: true, evening: "21:00", morning: "07:00" };
  s.events.push(ev("大学", "2026-09-28T09:00", "pack"));
  s.events.push(ev("ごはん", "2026-09-29T18:00", "mini"));
  const f = forecast(s, T("2026-09-27T12:00"));
  assert.equal(f.length, 2);
  assert.deepEqual(f[1].lines.map((l) => l.label), ["リュックから"]);
  const n = notices(s, T("2026-09-27T12:00"));
  assert.equal(n.length, 4);
  assert.equal(n[0].title, "明日 9:00 大学");
  assert.equal(n[0].body, "リュック｜ミニバッグから 財布／自宅から 鍵");
  assert.equal(n[0].url, "#home");
});

test("widget data carries units, titles per day and optional holidays", () => {
  const s = world();
  s.events.push(ev("大学", "2026-09-28T09:00", "pack"));
  const w = widgetData(s, T("2026-09-27T12:00"));
  assert.equal(w.units[0].bag, "リュック");
  assert.equal(w.days["2026-09-28"][0].t, "大学");
  assert.equal(w.holidays["2026-09-21"], "敬老の日");
  s.settings.holidays = false;
  assert.deepEqual(widgetData(s, T("2026-09-27T12:00")).holidays, {});
});

test("removing bags and items cleans references", () => {
  const s = world();
  s.events.push(ev("a", "2026-09-28T09:00", "pack", { plan: { bagId: "pack", add: ["ear"], remove: ["pc"], extra: [] } }));
  removeItem(s, "pc");
  assert.deepEqual(s.events[0].plan.remove, []);
  removeBag(s, "pack");
  assert.equal(s.events[0].plan.bagId, null);
  assert.equal(validate(s).bags.length, 1);
});

test("same-title lookup returns the latest event", () => {
  const s = world();
  s.events.push(ev("x1", "2026-09-01T09:00", "pack", { title: "大学" }));
  s.events.push(ev("x2", "2026-09-10T10:00", "mini", { title: "大学" }));
  assert.equal(lastWithTitle(s, " 大学 ")?.id, "x2");
});

test("v2 state converts to v3", () => {
  const v2 = {
    version: 2,
    containers: [
      { id: "home", kind: "place", name: "自宅", color: "sage", itemIds: [], deletedAt: null },
      { id: "worn", kind: "worn", name: "身につける", color: "blue", itemIds: [], deletedAt: null },
      { id: "locker", kind: "place", name: "ロッカー", color: "sand", itemIds: [], deletedAt: null },
      { id: "b1", kind: "bag", name: "リュック", color: "sand", itemIds: ["i1", "gone"], deletedAt: null },
    ],
    items: [
      { id: "i1", name: "財布", imageId: null, location: { containerId: "locker", updatedAt: "2026-09-01T00:00:00.000Z" }, deletedAt: null },
      { id: "gone", name: "消えた", imageId: null, location: { containerId: null, updatedAt: "2026-09-01T00:00:00.000Z" }, deletedAt: "2026-09-02T00:00:00.000Z" },
    ],
    events: [
      {
        id: "e1", title: "大学", startAt: "2026-09-28T09:00+09:00", endAt: null, allDay: false, memo: "",
        plan: { bagId: "b1", addedItemIds: [], removedItemIds: ["i1"], temporaryItems: ["本"] },
        recurrence: "weekly", weekdays: [1], until: null, deletedAt: null,
      },
    ],
    overrides: [{ id: "o1", eventId: "e1", date: "2026-10-05", deleted: true, changes: {}, deletedAt: null }],
    settings: { weekStart: 1, autoComplete: false, reminders: { enabled: true, evening: "20:00", morning: null } },
  };
  const s = fromV2(v2);
  assert.equal(s.bags[0].color, "orange");
  assert.deepEqual(s.bags[0].itemIds, ["i1"]);
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].at, HOME);
  assert.equal(s.events[0].start, "2026-09-28T09:00");
  assert.deepEqual(s.events[0].plan, { bagId: "b1", add: [], remove: ["i1"], extra: ["本"] });
  assert.equal(s.exceptions["e1@2026-10-05"].deleted, true);
  assert.equal(s.settings.weekStart, 1);
  assert.equal(s.settings.auto, false);
  assert.deepEqual(s.settings.remind, { on: true, evening: "20:00", morning: null });
});
