import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { Repository } from "../../src/platform/repository";
import { migrateLegacy } from "../../src/core/migration";
import type { LegacyState } from "../../src/core/migration";
import * as C from "../../src/core/domain";
import * as Legacy from "../../src/legacy/core.js";
const identity = async (blob: Blob) => blob;
const old = () =>
  Legacy.sampleState(new Date("2026-09-26T10:00")) as unknown as LegacyState;
test("旧データの写真・月次・複数タグ・例外を移行し、入力を変更しない", async () => {
  const input = old();
  input.events[0].recurrence = "monthly";
  input.events[0].tagIds = input.tags.map((t) => t.id);
  input.items[0].image = "data:image/png;base64,aGVsbG8=";
  Legacy.saveOccurrence(input, input.events[0].id, "2026-09-27", {
    title: "例外",
    addedItemIds: [input.items[4].id],
  });
  const original = JSON.stringify(input),
    { state, photos } = await migrateLegacy(input, identity);
  assert.equal(state.events[0].recurrence, "monthly");
  assert(state.events[0].memo.includes("プライベート"));
  assert.equal(state.events[0].categoryId, input.tags[0].id);
  assert.equal(photos.length, 1);
  assert.equal(state.items[0].imageId, photos[0].id);
  assert.equal(
    C.occurrencesBetween(state, "2026-09-27", "2026-09-28")[0].title,
    "例外",
  );
  assert.equal(JSON.stringify(input), original);
});
test("localStorageからの移行は一度だけ、元データは保持", async () => {
  const raw = JSON.stringify(old()),
    storage = { getItem: () => raw },
    db = new Repository(`test-${C.id()}`, storage, identity);
  try {
    const first = await db.load();
    first.items[0].name = "新しい財布";
    await db.save(first);
    const second = await db.load();
    assert.equal(second.items[0].name, "新しい財布");
    assert.equal(storage.getItem(), raw);
    assert.equal((await db.meta.get("legacy-original"))?.value, raw);
  } finally {
    await db.delete();
  }
});
test("2つのRepositoryからの古い書き込みを拒否", async () => {
  const name = `test-${C.id()}`,
    a = new Repository(name, null, identity),
    b = new Repository(name, null, identity);
  try {
    const oldState = await a.load();
    await b.load();
    const next = structuredClone(oldState);
    next.settings.onboarded = true;
    await a.save(next);
    await assert.rejects(b.save(oldState), /別のタブ/);
    assert.equal((await b.load()).settings.onboarded, true);
  } finally {
    b.close();
    await a.delete();
  }
});
test("写真込みバックアップを別DBへ復元、schemaVersion付き", async () => {
  const a = new Repository(`test-${C.id()}`, null, identity),
    b = new Repository(`test-${C.id()}`, null, identity);
  try {
    await a.load();
    const s = C.sampleState();
    const photo = {
      id: C.id(),
      blob: new Blob(["photo"], { type: "image/jpeg" }),
    };
    s.items[0].imageId = photo.id;
    const saved = await a.save(s, [photo]);
    const text = await a.export(saved);
    assert.equal(JSON.parse(text).schemaVersion, 2);
    const parsed = await b.parseBackup(text);
    await b.load();
    parsed.state.revision = 0;
    await b.save(parsed.state, parsed.photos);
    const result = await b.load();
    assert.equal(result.items[0].name, "財布");
    assert.equal(await (await b.photos.get(photo.id))!.blob.text(), "photo");
  } finally {
    await a.delete();
    await b.delete();
  }
});
test("写真欠落・壊れたバックアップで既存データを壊さない", async () => {
  const db = new Repository(`test-${C.id()}`, null, identity);
  try {
    const s = await db.load();
    const next = C.sampleState();
    next.items[0].imageId = C.id();
    await assert.rejects(db.save(next), /写真/);
    assert.deepEqual(await db.load(), s);
    await assert.rejects(db.parseBackup("{bad"));
    await assert.rejects(
      db.parseBackup(
        JSON.stringify({
          app: "PackCalendar",
          format: 2,
          data: next,
          photos: {},
        }),
      ),
      /写真/,
    );
    assert.deepEqual(await db.load(), s);
  } finally {
    await db.delete();
  }
});
test("壊れた旧保存は空データに置き換えず復旧用に残す", async () => {
  const db = new Repository(
    `test-${C.id()}`,
    { getItem: () => "{broken" },
    identity,
  );
  try {
    await assert.rejects(db.load());
    assert.equal(await db.states.count(), 0);
    assert.equal(db.rescueLegacy(), "{broken");
  } finally {
    await db.delete();
  }
});
