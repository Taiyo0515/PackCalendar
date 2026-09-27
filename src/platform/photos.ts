export async function thumbnail(file: Blob): Promise<Blob> {
  if ((file.type && !file.type.startsWith("image/")) || file.size > 25000000)
    throw new Error("25MB以下の写真を選んでください");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      240 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b ? resolve(b) : reject(new Error("写真を保存できませんでした")),
        "image/jpeg",
        0.82,
      ),
    );
  } catch {
    throw new Error(
      "写真を読み込めませんでした",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function fromDataURL(data: string): Blob {
  const match =
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(data);
  if (!match || data.length > 2000000)
    throw new Error("バックアップの写真が壊れています");
  const raw = atob(match[2]);
  return new Blob([Uint8Array.from(raw, (c) => c.charCodeAt(0))], {
    type: match[1],
  });
}
export async function toDataURL(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return `data:${blob.type};base64,${btoa(binary)}`;
}
