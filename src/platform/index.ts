import { Capacitor } from "@capacitor/core";
import type { Repository } from "./repository";
import { WebScheduler } from "./web";
export const isNative = Capacitor.isNativePlatform();
export async function getScheduler(repo: Repository) {
  return isNative
    ? new (await import("./native")).NativeScheduler()
    : new WebScheduler(repo);
}
export async function nativeBackup(json: string) {
  if (isNative) await (await import("./native")).autoBackup(json);
}
export async function capturePhoto(): Promise<Blob | null> {
  if (!isNative) return null;
  const { Camera, CameraResultType, CameraSource } =
    await import("@capacitor/camera");
  const photo = await Camera.getPhoto({
    quality: 85,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
  });
  if (!photo.webPath) throw new Error("写真を読み込めませんでした。");
  return (await fetch(photo.webPath)).blob();
}
