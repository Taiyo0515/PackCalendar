// Sample state for browser tests and screenshots (relative to "today").
export function seedState(today: string) {
  const d = (n: number) => {
    const t = new Date(`${today}T12:00:00`);
    t.setDate(t.getDate() + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  };
  const at = new Date(`${today}T00:00:00`).toISOString();
  const plan = (bagId: string | null, extra: string[] = []) => ({ bagId, add: [], remove: [], extra });
  const ev = (id: string, title: string, start: string, end: string | null, bagId: string | null, more = {}) => ({
    id,
    title,
    start,
    end,
    allDay: false,
    memo: "",
    plan: plan(bagId),
    repeat: null,
    ...more,
  });
  return {
    version: 3,
    revision: 1,
    bags: [
      { id: "pack", name: "リュック", color: "green", itemIds: ["wallet", "key", "pc", "card"] },
      { id: "mini", name: "ミニバッグ", color: "orange", itemIds: ["wallet", "key", "phone"] },
      { id: "tote", name: "トート", color: "blue", itemIds: ["wallet", "key"] },
    ],
    items: [
      { id: "wallet", name: "財布", photoId: null, at: "mini", atTime: at },
      { id: "key", name: "鍵", photoId: null, at: "home", atTime: at },
      { id: "pc", name: "ノートPC", photoId: null, at: "pack", atTime: at },
      { id: "card", name: "学生証", photoId: null, at: "home", atTime: at },
      { id: "phone", name: "スマホ", photoId: null, at: "worn", atTime: at },
      { id: "ear", name: "イヤホン", photoId: null, at: null, atTime: at },
    ],
    events: [
      ev("univ", "大学", `${d(1)}T09:00`, `${d(1)}T16:00`, "pack", {
        repeat: { freq: "weekly", weekdays: [1, 3, 5], until: null },
        plan: plan("pack", ["教科書"]),
      }),
      ev("dinner", "友達とごはん", `${d(1)}T18:30`, `${d(1)}T20:30`, "mini"),
      ev("hair", "髪を切る", `${d(3)}T13:30`, `${d(3)}T14:30`, null),
      ev("job", "バイト", `${d(-2)}T17:00`, `${d(-2)}T22:00`, "tote", {
        repeat: { freq: "weekly", weekdays: [2, 6], until: null },
      }),
      ev("trip", "旅行", `${d(9)}T00:00`, `${d(12)}T00:00`, "pack", { allDay: true }),
      ev("meeting", "オンライン会議", `${d(1)}T20:00`, `${d(1)}T21:00`, null),
    ],
    exceptions: {},
    settings: {
      weekStart: 0,
      holidays: true,
      auto: true,
      theme: "system",
      widgetTheme: "system",
      remind: { on: false, evening: "21:00", morning: "07:00" },
    },
    cursor: new Date(`${today}T00:00:00`).toISOString(),
  };
}

/** Writes the state into the app's IndexedDB before it starts (Dexie v1 = IDB v10). */
export function seedScript(state: unknown, dbName: string) {
  return `(() => new Promise((resolve) => {
    const req = indexedDB.open(${JSON.stringify(dbName)}, 10);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "id" });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
    };
    req.onsuccess = () => {
      const tx = req.result.transaction("kv", "readwrite");
      tx.objectStore("kv").put({ id: "state", value: ${JSON.stringify(state)} });
      tx.oncomplete = () => { req.result.close(); resolve(true); };
    };
  }))()`;
}
