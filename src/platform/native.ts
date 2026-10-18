import { registerPlugin } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { Notice } from "../core/schedule";
import type { Dto } from "../core/import";
import type { Theme } from "../core/model";

interface PackBridge {
  saveWidget(o: { json: string }): Promise<{ groups: string[] }>;
  setAppearance(o: { mode: Theme }): Promise<void>;
  widgetStatus(): Promise<{ candidates: string[]; readable: boolean }>;
  readCalendar(o: { from: string; to: string }): Promise<{
    events: {
      uid: string;
      title: string;
      start: string;
      end: string | null;
      allDay: boolean;
      memo: string;
      repeat: { freq: "daily" | "weekly" | "monthly"; weekdays: number[]; until?: string } | null;
    }[];
  }>;
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

/** The iPhone's own calendars, read with full calendar access. */
export async function readDeviceCalendar(from: Date, to: Date): Promise<Dto[]> {
  const stampLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(
      d.getHours(),
    ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const { events } = await bridge.readCalendar({ from: stampLocal(from), to: stampLocal(to) });
  return events.map((e) => ({
    uid: e.uid,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    memo: e.memo,
    repeat: e.repeat ? { freq: e.repeat.freq, weekdays: e.repeat.weekdays, until: e.repeat.until ?? null } : null,
    gone: [],
    edits: [],
  }));
}

/** Local stamp used in backup file names, down to the second. */
export function backupStamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * One backup per write in Files > PackCalendar, keeping the latest 7.
 * The name carries the second so several backups on one day stay separate files.
 */
export async function dailyBackup(json: string) {
  const dir = "PackCalendar";
  await Filesystem.writeFile({
    path: `${dir}/backup-${backupStamp()}.json`,
    data: json,
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  const files = (await Filesystem.readdir({ path: dir, directory: Directory.Documents })).files
    .map((f) => f.name)
    .filter((n) => /^backup-\d{4}-\d{2}-\d{2}-\d{6}\.json$/.test(n))
    .sort()
    .reverse();
  for (const name of files.slice(7))
    await Filesystem.deleteFile({ path: `${dir}/${name}`, directory: Directory.Documents });
}

/** The app cannot download files in the WebView, so hand the JSON to the share sheet. */
export async function shareJSON(json: string, name: string) {
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: json,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  await Share.share({ title: name, url: uri });
}
