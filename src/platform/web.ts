import type {
  NotificationScheduler,
  ScheduledNotification,
} from "../core/notifications";
import type { Repository } from "./repository";
export interface PushConnection {
  url: string;
  deviceId: string;
  token: string;
}
export class WebScheduler implements NotificationScheduler {
  constructor(private repo: Repository) {}
  async connection(): Promise<PushConnection | null> {
    const row = await this.repo.meta.get("push-connection");
    return row ? JSON.parse(row.value) : null;
  }
  async connect(server: string, invitation: string) {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    )
      throw new Error(
        "このブラウザでは通知を利用できません。iPhoneはSafariからホーム画面に追加して開いてください。",
      );
    const permission = await Notification.requestPermission();
    if (permission !== "granted")
      throw new Error(
        "通知が許可されていません。ブラウザの設定を確認してください。",
      );
    const endpoint = new URL(server);
    if (endpoint.protocol !== "https:")
      throw new Error("通知サーバーのHTTPS URLを指定してください。");
    const url = endpoint.origin;
    const response = await fetch(`${url}/config`);
    if (!response.ok) throw new Error("通知サーバーに接続できません。");
    const config = (await response.json()) as { publicKey: string };
    const raw = atob(config.publicKey.replace(/-/g, "+").replace(/_/g, "/"));
    const key = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const old = await this.connection();
    if (old && old.url !== url) await this.disable();
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
    const result = await fetch(`${url}/device`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Invitation": invitation,
        ...(old?.url === url
          ? {
              Authorization: `Bearer ${old.token}`,
              "X-Device-Id": old.deviceId,
            }
          : {}),
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    if (!result.ok)
      throw new Error(
        result.status === 403
          ? "招待コードを確認してください。"
          : "通知の登録に失敗しました。",
      );
    const data = (await result.json()) as { deviceId?: string; token?: string };
    if (typeof data.deviceId !== "string" || typeof data.token !== "string")
      throw new Error("通知サーバーから正しい登録情報を受け取れませんでした。");
    const connection: PushConnection = {
      url,
      deviceId: data.deviceId,
      token: data.token,
    };
    await this.repo.meta.put({
      id: "push-connection",
      value: JSON.stringify(connection),
    });
  }
  async sync(schedule: ScheduledNotification[]) {
    const c = await this.connection();
    if (!c)
      throw new Error("通知サーバーは未接続です。設定から接続してください。");
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription)
      throw new Error(
        "通知の購読が切れています。「通知を接続」から登録し直してください。",
      );
    const response = await fetch(`${c.url}/schedule`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${c.token}`,
        "X-Device-Id": c.deviceId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ schedule, subscription: subscription.toJSON() }),
    });
    if (!response.ok)
      throw new Error(
        [401, 404, 410].includes(response.status)
          ? "通知の登録が失効しました。「通知を接続」から登録し直してください。"
          : "通知予定を送信できませんでした。オンラインになったら再試行します。",
      );
  }
  async disable() {
    const c = await this.connection();
    if (!c) return;
    const response = await fetch(`${c.url}/device`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${c.token}`,
        "X-Device-Id": c.deviceId,
      },
    });
    if (!response.ok && ![404, 410].includes(response.status))
      throw new Error(
        "通知の停止を送信できません。オンラインで再試行してください。",
      );
    const registration = await navigator.serviceWorker.ready;
    await (await registration.pushManager.getSubscription())?.unsubscribe();
    await this.repo.meta.delete("push-connection");
  }
}
