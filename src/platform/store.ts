import Dexie, { liveQuery } from "dexie";
import type { Table } from "dexie";
import { emptyState, validate } from "../core/model";
import type { State } from "../core/model";
import { fromV2 } from "../core/migrate";
import { fromDataURL, toDataURL } from "./photos";

export interface Photo {
  id: string;
  bytes: ArrayBuffer;
  type: string;
}
export const photoBlob = (p: Photo) => new Blob([p.bytes], { type: p.type });
export async function toPhoto(id: string, blob: Blob): Promise<Photo> {
  return { id, bytes: await blob.arrayBuffer(), type: blob.type || "image/jpeg" };
}

export class ConflictError extends Error {}

export class Store extends Dexie {
  kv!: Table<{ id: string; value: unknown }, string>;
  photos!: Table<Photo, string>;
  constructor(private ns: string) {
    super(`packcalendar3:${ns}`);
    this.version(1).stores({ kv: "id", photos: "id" });
  }

  async load(): Promise<State> {
    const row = await this.kv.get("state");
    if (row) {
      const state = validate(row.value);
      // Photos nothing refers to are removed on start (undo may still need them until then).
      const used = new Set(state.items.map((i) => i.photoId).filter(Boolean));
      const stale = (await this.photos.toCollection().primaryKeys()).filter((k) => !used.has(k));
      if (stale.length) await this.photos.bulkDelete(stale);
      return state;
    }
    const imported = await this.importV2().catch(() => null);
    const state = imported ?? emptyState();
    await this.transaction("rw", this.kv, this.photos, async () => {
      if (await this.kv.get("state")) return;
      await this.kv.put({ id: "state", value: state });
    });
    return validate((await this.kv.get("state"))!.value);
  }

  /** Reads the previous app's IndexedDB (never deletes it). */
  private async importV2(): Promise<State | null> {
    const name = `packcalendar:${this.ns}`;
    if (!(await Dexie.exists(name))) return null;
    const old = new Dexie(name);
    old.version(1).stores({ states: "id", photos: "id", meta: "id" });
    try {
      const row = (await old.table("states").get("current")) as { value: unknown } | undefined;
      if (!row) return null;
      const state = fromV2(row.value as Record<string, unknown>);
      const wanted = new Set(state.items.map((i) => i.photoId).filter(Boolean));
      for (const p of (await old.table("photos").toArray()) as Record<string, unknown>[]) {
        if (!wanted.has(p.id as string)) continue;
        const blob =
          p.blob instanceof Blob
            ? p.blob
            : new Blob([p.bytes as ArrayBuffer], { type: (p.type as string) ?? "image/jpeg" });
        await this.photos.put(await toPhoto(p.id as string, blob));
      }
      for (const i of state.items) if (i.photoId && !(await this.photos.get(i.photoId))) i.photoId = null;
      return state;
    } finally {
      old.close();
    }
  }

  /** Saves if nobody else saved since `state` was read. Returns the stored state. */
  async save(state: State, photos: Photo[] = []): Promise<State> {
    const next = validate({ ...state, revision: state.revision + 1 });
    await this.transaction("rw", this.kv, this.photos, async () => {
      const current = (await this.kv.get("state"))?.value as State | undefined;
      if (current && current.revision !== state.revision) throw new ConflictError();
      if (photos.length) await this.photos.bulkPut(photos);
      await this.kv.put({ id: "state", value: next });
    });
    return next;
  }

  async replace(state: State, photos: Photo[]) {
    const current = (await this.kv.get("state"))?.value as State | undefined;
    const next = validate({ ...state, revision: (current?.revision ?? 0) + 1 });
    await this.transaction("rw", this.kv, this.photos, async () => {
      await this.photos.clear();
      if (photos.length) await this.photos.bulkPut(photos);
      await this.kv.put({ id: "state", value: next });
    });
    return next;
  }

  watch(onChange: (s: State) => void) {
    const sub = liveQuery(() => this.kv.get("state")).subscribe({
      next: (row) => {
        if (!row) return;
        try {
          onChange(validate(row.value));
        } catch {
          /* ignore invalid external writes */
        }
      },
    });
    return () => sub.unsubscribe();
  }

  async getMeta<T>(id: string) {
    return (await this.kv.get(id))?.value as T | undefined;
  }
  async setMeta(id: string, value: unknown) {
    await this.kv.put({ id, value });
  }
  async deleteMeta(id: string) {
    await this.kv.delete(id);
  }

  async exportJSON(state: State) {
    const photos: Record<string, string> = {};
    for (const i of state.items)
      if (i.photoId) {
        const p = await this.photos.get(i.photoId);
        if (p) photos[p.id] = await toDataURL(photoBlob(p));
      }
    return JSON.stringify({
      app: "PackCalendar",
      format: 3,
      exportedAt: new Date().toISOString(),
      state,
      photos,
    });
  }
}

/** Parses a backup file (format 3, or format 2 from the previous app). */
export async function parseBackup(text: string): Promise<{ state: State; photos: Photo[] }> {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("バックアップを読み込めません");
  }
  if (data?.app !== "PackCalendar") throw new Error("PackCalendar のバックアップではありません");
  let state: State;
  if (data.format === 3) state = validate(data.state);
  else if (data.format === 2) state = fromV2(data.data as Record<string, unknown>);
  else throw new Error("対応していない形式です");
  const raw = (data.photos ?? {}) as Record<string, unknown>;
  const photos: Photo[] = [];
  for (const i of state.items) {
    const value = i.photoId ? raw[i.photoId] : null;
    if (typeof value === "string") photos.push(await toPhoto(i.photoId!, fromDataURL(value)));
    else i.photoId = null;
  }
  return { state: validate(state), photos };
}
