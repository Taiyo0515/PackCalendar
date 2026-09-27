import { LocalNotifications } from "@capacitor/local-notifications";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import type {
  NotificationScheduler,
  ScheduledNotification,
} from "../core/notifications";
export class NativeScheduler implements NotificationScheduler {
  async connected() {
    return (await LocalNotifications.checkPermissions()).display === "granted";
  }
  async connect() {
    const p = await LocalNotifications.requestPermissions();
    if (p.display !== "granted")
      throw new Error("通知が許可されていません。端末の設定で変更できます。");
  }
  async sync(schedule: ScheduledNotification[]) {
    if ((await LocalNotifications.checkPermissions()).display !== "granted")
      throw new Error("端末の通知が許可されていません。");
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length)
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    if (schedule.length)
      await LocalNotifications.schedule({
        notifications: schedule
          .slice(0, 60)
          .map((n, index) => ({
            id: index + 1,
            title: n.title,
            body: n.body,
            schedule: { at: new Date(n.at) },
            extra: { url: n.url },
            sound: "default",
          })),
      });
  }
  async disable() {
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length)
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
  }
}
let backupQueue = Promise.resolve();
export function autoBackup(json: string) {
  const operation = backupQueue
    .catch(() => {})
    .then(async () => {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
        name = `backup-${stamp}`;
      await Filesystem.writeFile({
        path: `PackCalendar/${name}.tmp`,
        data: json,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      await Filesystem.rename({
        from: `PackCalendar/${name}.tmp`,
        to: `PackCalendar/${name}.json`,
        directory: Directory.Documents,
      });
      // Only remove previous backups after the new file has been successfully committed.
      const files = (
        await Filesystem.readdir({
          path: "PackCalendar",
          directory: Directory.Documents,
        })
      ).files
        .filter((f) => /^backup-\d{4}-\d{2}-\d{2}.*\.json$/.test(f.name))
        .sort((a, b) => b.name.localeCompare(a.name));
      const kept = new Set<string>();
      for (const file of files) {
        const day = file.name.slice(7, 17);
        if (kept.has(day) || kept.size >= 7)
          await Filesystem.deleteFile({
            path: `PackCalendar/${file.name}`,
            directory: Directory.Documents,
          });
        else kept.add(day);
      }
    });
  backupQueue = operation;
  return operation;
}
