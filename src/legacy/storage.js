import { emptyState, validateState } from "./core.js";

export class Repository {
  constructor(storage, namespace) {
    this.storage = storage;
    this.key = `packcalendar:v1:${namespace}`;
    this.raw = null;
  }
  load() {
    const raw = this.storage.getItem(this.key);
    this.raw = raw;
    return raw === null ? emptyState() : validateState(JSON.parse(raw));
  }
  save(state, { force = false } = {}) {
    validateState(state);
    if (!force && this.storage.getItem(this.key) !== this.raw)
      throw new Error(
        "別のタブでデータが更新されました。画面を再読み込みしてから、もう一度操作してください。",
      );
    const next = { ...state, revision: state.revision + 1 };
    const raw = JSON.stringify(next);
    try {
      this.storage.setItem(this.key, raw);
    } catch {
      throw new Error(
        "端末への保存ができませんでした。空き容量やブラウザの保存設定を確認してください。変更は保存されていません。",
      );
    }
    this.raw = raw;
    return next;
  }
  export(state) {
    return JSON.stringify(
      {
        app: "PackCalendar",
        exportedAt: new Date().toISOString(),
        data: validateState(state),
      },
      null,
      2,
    );
  }
  import(text) {
    if (text.length > 12000000)
      throw new Error("ファイルが大きすぎます（上限12MB）。");
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("JSONファイルを読み込めませんでした。");
    }
    if (parsed.app !== "PackCalendar")
      throw new Error("PackCalendarのバックアップファイルを選んでください。");
    return validateState(parsed.data);
  }
}
