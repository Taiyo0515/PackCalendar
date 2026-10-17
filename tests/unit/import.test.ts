import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, HOME, WORN, validate } from "../../src/core/model";
import type { Event } from "../../src/core/model";
import { parseIcs } from "../../src/core/ics";
import { mergeImportsSync, prepareImports } from "../../src/core/import";
import { unitsBetween } from "../../src/core/prep";

const SAMPLE = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:a001",
  "DTSTAMP:20260101T000000Z",
  "SUMMARY:大学",
  "DTSTART;TZID=Asia/Tokyo:20260928T090000",
  "DTEND;TZID=Asia/Tokyo:20260928T160000",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z",
  "LOCATION:キャンパス",
  "DESCRIPTION:太陽の講義",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:a001",
  "DTSTAMP:20260101T000000Z",
  "SUMMARY:休講",
  "DTSTART:20260930T130000",
  "DTEND:20260930T150000",
  "RECURRENCE-ID;TZID=Asia/Tokyo:20260930T090000",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:a001",
  "DTSTAMP:20260101T000000Z",
  "SUMMARY:大学",
  "DTSTART:20261005T090000",
  "RECURRENCE-ID;TZID=Asia/Tokyo:20261005T090000",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:b002",
  "DTSTAMP:20260101T000000Z",
  "SUMMARY:旅行",
  "DTSTART;VALUE=DATE:20261010",
  "DTEND;VALUE=DATE:20261013",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:c003",
  "DTSTAMP:20260101T000000Z",
  "DTSTART:20261001T100000",
  "DTEND:20261001T090000",
  "SUMMARY:おかしい",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const ev = (id: string, start: string, extra: Partial<Event> = {}): Event => ({
  id,
  title: id,
  start,
  end: null,
  allDay: false,
  memo: "",
  calendar: "main",
  plan: { bagId: null, add: [], remove: [], extra: [] },
  repeat: null,
  ...extra,
});

function world() {
  const s = emptyState(new Date("2026-09-27T12:00"));
  s.bags.push({ id: "pack", name: "リュック", color: "green", itemIds: [] });
  s.items.push(
    { id: "key", name: "鍵", photoId: null, at: HOME, atTime: at(), return: false },
    { id: "phone", name: "スマホ", photoId: null, at: WORN, atTime: at(), return: false },
  );
  return s;
}
const at = () => "2026-09-27T00:00:00.000Z";

test("ICS: repeats, all-day spans, edits and cancellations", () => {
  const list = parseIcs(SAMPLE);
  assert.deepEqual(
    list.map((e) => e.uid),
    ["a001", "b002", "c003"],
  );
  const a = list[0];
  assert.equal(a.title, "大学");
  assert.equal(a.start, "2026-09-28T09:00");
  assert.equal(a.end, "2026-09-28T16:00");
  assert.deepEqual(a.repeat, { freq: "weekly", weekdays: [1, 3], until: "2026-12-31" });
  assert.deepEqual(a.edits, [
    { day: "2026-09-30", title: "休講", start: "2026-09-30T13:00", end: "2026-09-30T15:00", allDay: false },
  ]);
  assert.deepEqual(a.gone, ["2026-10-05"]);
  const b = list[1]!;
  assert.equal(b.allDay, true);
  assert.equal(b.start, "2026-10-10T00:00");
  assert.equal(b.end, "2026-10-13T00:00");
});

test("ICS: merging into the state is stable over re-imports", async () => {
  const s = world();
  const dtos = parseIcs(SAMPLE).map((e) => ({ ...e, gone: e.gone, edits: e.edits }));
  const first = mergeImportsSync(s, await prepareImports(dtos));
  assert.deepEqual(first, [3, 0]);
  assert.equal(s.events.length, 3);
  // The broken event (end before start) is dropped.
  const univ = s.events.find((e) => e.title === "大学")!;
  assert.equal(univ.start, "2026-09-28T09:00");
  assert.deepEqual(univ.repeat, { freq: "weekly", weekdays: [1, 3], until: "2026-12-31" });
  assert.equal(univ.plan.bagId, null);
  // The exception for the changed day and the deleted day are registered.
  assert.equal(s.exceptions[`${univ.id}@2026-09-30`].patch.title, "休講");
  assert.equal(s.exceptions[`${univ.id}@2026-10-05`].deleted, true);
  validate(s);
  // Re-importing updates in place: no duplicates, no exception loss.
  const second = mergeImportsSync(s, await prepareImports(dtos));
  assert.deepEqual(second, [0, 3]);
  assert.equal(s.events.length, 3);
  assert.equal(s.events.find((e) => e.title === "大学"), univ);
});

test("ICS: imported events prepare like hand-made ones", async () => {
  const s = world();
  s.bags[0].itemIds.push("key");
  mergeImportsSync(s, await prepareImports(parseIcs(SAMPLE)));
  const univ = s.events.find((e) => e.title === "大学")!;
  univ.plan = { bagId: "pack", add: [], remove: [], extra: [] };
  const units = unitsBetween(s, new Date("2026-09-28T00:00"), new Date("2026-09-30T00:00"));
  assert.equal(units[0].start, "2026-09-28T09:00");
  assert.deepEqual(units[0].itemIds, ["key"]);
});
