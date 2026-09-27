import type { Notice } from "../core/schedule";
import type { Store } from "./store";

// Web Push through the Cloudflare Worker (API unchanged from the previous app).
interface Connection {
  url: string;
  deviceId: string;
  token: string;
}
export const PUSH_URL = (import.meta.env.VITE_PUSH_URL as string | undefined) ?? "";
const KEY = "push";
const SENT = "push-sent";

export async function pushConnected(store: Store) {
  return !!(await store.getMeta<Connection>(KEY));
}

export async function connectPush(store: Store, invitation: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    throw new Error("このブラウザは通知に対応していません。iPhone はホーム画面に追加して開いてください。");
  if (!PUSH_URL) throw new Error("通知サーバーが設定されていません");
  if ((await Notification.requestPermission()) !== "granted")
    throw new Error("通知が許可されていません");
  const url = new URL(PUSH_URL).origin;
  const config = await fetch(`${url}/config`);
  if (!config.ok) throw new Error("通知サーバーに接続できません");
  const { publicKey } = (await config.json()) as { publicKey: string };
  const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
    }));
  const res = await fetch(`${url}/device`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Invitation": invitation },
    body: JSON.stringify({ subscription: sub.toJSON() }),
  });
  if (!res.ok) throw new Error(res.status === 403 ? "招待コードが違います" : "登録できませんでした");
  const data = (await res.json()) as { deviceId: string; token: string };
  await store.setMeta(KEY, { url, deviceId: data.deviceId, token: data.token });
  await store.deleteMeta(SENT);
}

/** Sends the schedule when it changed. Silently keeps the last error for retry. */
export async function syncPush(store: Store, schedule: Notice[]) {
  const c = await store.getMeta<Connection>(KEY);
  if (!c) return;
  const body = JSON.stringify(schedule);
  if ((await store.getMeta<string>(SENT)) === body) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const res = await fetch(`${c.url}/schedule`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${c.token}`,
      "X-Device-Id": c.deviceId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ schedule, subscription: sub.toJSON() }),
  });
  if ([401, 404, 410].includes(res.status)) {
    await store.deleteMeta(KEY);
    throw new Error("通知の登録が切れました。設定から接続し直してください");
  }
  if (res.ok) await store.setMeta(SENT, body);
}

export async function disconnectPush(store: Store) {
  const c = await store.getMeta<Connection>(KEY);
  if (c)
    await fetch(`${c.url}/device`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${c.token}`, "X-Device-Id": c.deviceId },
    }).catch(() => undefined);
  const reg = await navigator.serviceWorker?.ready;
  await (await reg?.pushManager.getSubscription())?.unsubscribe();
  await store.deleteMeta(KEY);
  await store.deleteMeta(SENT);
}
