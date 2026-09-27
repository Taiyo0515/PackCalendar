import { Capacitor } from "@capacitor/core";
import type { Theme } from "../core/model";
import type { Notice } from "../core/schedule";
import type { Store } from "./store";

export const isNative = Capacitor.isNativePlatform();
const native = () => import("./native");
const push = () => import("./push");

export async function syncNotices(store: Store, list: Notice[]) {
  if (isNative) await (await native()).scheduleLocal(list);
  else await (await push()).syncPush(store, list);
}
export async function syncWidget(json: string) {
  if (isNative) await (await native()).saveWidget(json);
}
export async function syncAppearance(mode: Theme) {
  if (isNative) await (await native()).setAppearance(mode);
}
export async function backupDaily(store: Store, json: () => Promise<string>) {
  if (!isNative) return;
  const today = new Date().toISOString().slice(0, 10);
  if ((await store.getMeta<string>("lastBackup")) === today) return;
  await (await native()).dailyBackup(await json());
  await store.setMeta("lastBackup", today);
}
