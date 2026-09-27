import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import Dexie from "dexie";
import { ConflictError, Store, parseBackup } from "../../src/platform/store";
import { emptyState } from "../../src/core/model";

const v2 = {
  version: 2,
  revision: 3,
  containers: [
    { id: "home", kind: "place", name: "自宅", color: "sage", itemIds: [], deletedAt: null },
    { id: "b1", kind: "bag", name: "リュック", color: "sage", itemIds: ["i1"], deletedAt: null },
  ],
  items: [
    { id: "i1", name: "財布", imageId: "p1", location: { containerId: "b1", updatedAt: "2026-09-01T00:00:00.000Z" }, deletedAt: null },
  ],
  events: [],
  overrides: [],
  settings: { weekStart: 0 },
};

test("imports the previous app's database once and keeps it", async () => {
  const old = new Dexie("packcalendar:/a/");
  old.version(1).stores({ states: "id", photos: "id", meta: "id" });
  await old.table("states").put({ id: "current", value: v2 });
  await old.table("photos").put({ id: "p1", bytes: new Uint8Array([1, 2, 3]).buffer, type: "image/jpeg" });
  old.close();
  const store = new Store("/a/");
  const s = await store.load();
  assert.equal(s.bags[0].name, "リュック");
  assert.equal(s.items[0].photoId, "p1");
  assert.equal((await store.photos.get("p1"))?.type, "image/jpeg");
  assert.ok(await Dexie.exists("packcalendar:/a/"));
  store.close();
});

test("detects writes from another tab", async () => {
  const a = new Store("/b/");
  const s = await a.load();
  const saved = await a.save(s);
  assert.equal(saved.revision, 1);
  await assert.rejects(a.save(s), ConflictError);
  a.close();
});

test("backup export and parse keep photos", async () => {
  const store = new Store("/c/");
  const s = emptyState();
  s.items.push({ id: "i1", name: "鍵", photoId: "ph", at: "home", atTime: new Date().toISOString() });
  await store.replace(s, [{ id: "ph", bytes: new Uint8Array([9, 9]).buffer, type: "image/png" }]);
  const json = await store.exportJSON(await store.load());
  const back = await parseBackup(json);
  assert.equal(back.state.items[0].name, "鍵");
  assert.equal(back.photos[0].id, "ph");
  assert.equal(new Uint8Array(back.photos[0].bytes).length, 2);
  await assert.rejects(parseBackup("{}"), /PackCalendar/);
  store.close();
});
