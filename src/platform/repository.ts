import Dexie, { liveQuery } from "dexie";
import type { Table } from "dexie";
import { emptyState, validateState, stateForStorage } from "../core/domain";
import type { State } from "../core/model";
import { migrateLegacy } from "../core/migration";
import { fromDataURL, thumbnail, toDataURL } from "./photos";
import type { PhotoRecord } from "./photos";
export type Backup = { state: State; photos: PhotoRecord[] };
export class SaveConflictError extends Error {
  constructor() {
    super(
      "別のタブで更新されました。最新の内容を確認してから、もう一度操作してください。",
    );
  }
}
export class Repository extends Dexie {
  states!: Table<{ id: string; value: State }, string>;
  photos!: Table<PhotoRecord, string>;
  meta!: Table<{ id: string; value: string }, string>;
  readonly legacyKey: string;
  private binaryPhotos = false;
  constructor(
    namespace: string,
    private legacyStorage: Pick<
      Storage,
      "getItem"
    > | null = globalThis.localStorage ?? null,
    private convert = thumbnail,
  ) {
    super(`packcalendar:${namespace}`);
    this.version(1).stores({ states: "id", photos: "id", meta: "id" });
    this.photos.hook("reading", (record) => {
      const stored = record as unknown as {
        id: string;
        bytes?: ArrayBuffer;
        type?: string;
      };
      return stored?.bytes
        ? {
            id: stored.id,
            blob: new Blob([stored.bytes], {
              type: stored.type ?? "image/jpeg",
            }),
          }
        : record;
    });
    this.legacyKey = `packcalendar:v1:${namespace}`;
  }
  async load(): Promise<State> {
    const saved = await this.states.get("current");
    if (saved) return validateState(saved.value);
    const raw = this.legacyStorage?.getItem(this.legacyKey);
    const imported = raw
      ? await migrateLegacy(JSON.parse(raw), this.convert)
      : { state: emptyState(), photos: [] };
    return this.withPhotos(imported.photos, (records) =>
      this.transaction("rw", this.states, this.photos, this.meta, async () => {
        const existing = await this.states.get("current");
        if (existing) return validateState(existing.value);
        if (records.length) await this.photos.bulkPut(records);
        await this.states.put({
          id: "current",
          value: stateForStorage(imported.state),
        });
        if (raw) await this.meta.put({ id: "legacy-original", value: raw });
        return imported.state;
      }),
    );
  }
  async withPhotos<T>(
    photos: PhotoRecord[],
    operation: (records: PhotoRecord[]) => Promise<T>,
  ): Promise<T> {
    const binary = async () =>
      Promise.all(
        photos.map(
          async (p) =>
            ({
              id: p.id,
              bytes: await p.blob.arrayBuffer(),
              type: p.blob.type,
            }) as unknown as PhotoRecord,
        ),
      );
    try {
      return await operation(this.binaryPhotos ? await binary() : photos);
    } catch (error) {
      // WebKit on some platforms cannot persist Blob objects. Retry only that error,
      // after the original transaction rolled back, using lossless binary storage.
      if (
        this.binaryPhotos ||
        !photos.length ||
        !String(error).includes("preparing Blob/File")
      )
        throw error;
      this.binaryPhotos = true;
      return operation(await binary());
    }
  }
  async save(input: State, photos: PhotoRecord[] = []): Promise<State> {
    const state = validateState(input);
    return this.withPhotos(photos, (records) =>
      this.transaction("rw", this.states, this.photos, async () => {
        const current = await this.states.get("current");
        if (current && current.value.revision !== state.revision)
          throw new SaveConflictError();
        if (records.length) await this.photos.bulkPut(records);
        for (const object of [...state.items, ...state.containers])
          if (object.imageId && !(await this.photos.get(object.imageId)))
            throw new Error(
              "写真が見つかりません。バックアップを確認してください。",
            );
        const next = { ...state, revision: state.revision + 1 };
        await this.states.put({ id: "current", value: stateForStorage(next) });
        return next;
      }),
    );
  }
  watch(callback: (s: State) => void, onError: (e: unknown) => void) {
    const subscription = liveQuery(() => this.states.get("current")).subscribe({
      next: (row) => {
        if (row) {
          try {
            callback(validateState(row.value));
          } catch (e) {
            onError(e);
          }
        }
      },
      error: onError,
    });
    return () => subscription.unsubscribe();
  }
  async export(state: State): Promise<string> {
    validateState(state);
    const ids = [
      ...new Set(
        [...state.items, ...state.containers].flatMap((i) =>
          i.imageId ? [i.imageId] : [],
        ),
      ),
    ];
    const photos: Record<string, string> = {};
    for (const id of ids) {
      const p = await this.photos.get(id);
      if (!p)
        throw new Error(
          "写真が見つからないため、バックアップを作成できません。",
        );
      photos[id] = await toDataURL(p.blob);
    }
    return JSON.stringify({
      app: "PackCalendar",
      schemaVersion: 2,
      format: 2,
      exportedAt: new Date().toISOString(),
      data: stateForStorage(state),
      photos,
    });
  }
  async parseBackup(text: string): Promise<Backup> {
    if (text.length > 50000000)
      throw new Error("バックアップの上限は50MBです。");
    let parsed: {
      app?: string;
      data?: unknown;
      format?: number;
      photos?: Record<string, unknown>;
    };
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("JSONファイルを読み込めませんでした。");
    }
    if (!parsed || parsed.app !== "PackCalendar")
      throw new Error("PackCalendarのバックアップを選んでください。");
    if ((parsed.data as { version?: number })?.version === 1)
      return migrateLegacy(parsed.data, this.convert);
    if (
      parsed.format !== 2 ||
      !parsed.photos ||
      typeof parsed.photos !== "object" ||
      Array.isArray(parsed.photos)
    )
      throw new Error("対応していないバックアップです。");
    const state = validateState(parsed.data),
      photos: PhotoRecord[] = [];
    const ids = [
      ...new Set(
        [...state.items, ...state.containers].flatMap((i) =>
          i.imageId ? [i.imageId] : [],
        ),
      ),
    ];
    for (const id of ids) {
      const raw = parsed.photos[id];
      if (typeof raw !== "string")
        throw new Error("バックアップに必要な写真がありません。");
      photos.push({ id, blob: await this.convert(fromDataURL(raw)) });
    }
    return { state, photos };
  }
  rescueLegacy() {
    return this.legacyStorage?.getItem(this.legacyKey) ?? null;
  }
  async rescueRaw() {
    const row = await this.states.get("current");
    if (!row) return this.rescueLegacy() ?? "{}";
    const photos: Record<string, string> = {};
    for (const photo of await this.photos.toArray())
      photos[photo.id] = await toDataURL(photo.blob);
    return JSON.stringify({
      app: "PackCalendar",
      schemaVersion: 2,
      format: 2,
      data: row.value,
      photos,
      legacyOriginal: this.rescueLegacy(),
    });
  }
}
