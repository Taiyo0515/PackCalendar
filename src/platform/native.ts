import { registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import type { Notice } from "../core/schedule";
import type { Theme } from "../core/model";

interface PackBridge {
  saveWidget(o: { json: string }): Promise<{ groups: string[] }>;
  setAppearance(o: { mode: Theme }): Promise<void>;
  widgetStatus(): Promise<{ candidates: string[]; readable: boolean }>;
}
const bridge = registerPlugin<PackBridge>("PackBridge");

export async function notifyPermission(ask: boolean) {
  const p = ask ? await LocalNotifications.requestPermissions() : await LocalNotifications.checkPermissions();
  return p.display === "granted";
}

let lastSchedule = "";
export async function scheduleLocal(list: Notice[]) {
  const key = JSON.stringify(list);
  if (key === lastSchedule) return;
  if (!(await notifyPermission(false))) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length)
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (list.length)
    await LocalNotifications.schedule({
      notifications: list.map((n, i) => ({
        id: i + 1,
        title: n.title,
        body: n.body,
        schedule: { at: new Date(n.at), allowWhileIdle: true },
      })),
    });
  lastSchedule = key;
}

/** Last widget write result, shown in Settings only when something is wrong. */
export let widgetError: string | null = null;
export async function saveWidget(json: string) {
  try {
    await bridge.saveWidget({ json });
    widgetError = null;
  } catch (e) {
    widgetError = e instanceof Error ? e.message : String(e);
  }
}
export async function widgetProblem(): Promise<string | null> {
  if (widgetError) return widgetError;
  try {
    const s = await bridge.widgetStatus();
    return s.readable ? null : `ウィジェットのデータが見つかりません（${s.candidates.join(", ")}）`;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
export async function setAppearance(mode: Theme) {
  await bridge.setAppearance({ mode }).catch(() => undefined);
}

/** One backup per day in Files > PackCalendar, keeping the latest 7. */
export async function dailyBackup(json: string) {
  const day = new Date().toISOString().slice(0, 10);
  const dir = "PackCalendar";
  await Filesystem.writeFile({
    path: `${dir}/backup-${day}.json`,
    data: json,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  const files = (await Filesystem.readdir({ path: dir, directory: Directory.Documents })).files
    .map((f) => f.name)
    .filter((n) => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n))
    .sort()
    .reverse();
  for (const name of files.slice(7))
    await Filesystem.deleteFile({ path: `${dir}/${name}`, directory: Directory.Documents });
}
