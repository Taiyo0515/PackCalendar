import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Backpack,
  Wallet,
  KeyRound,
  Laptop,
  Smartphone,
  BookOpen,
  Headphones,
  BottleWine,
  Package,
  X,
  Camera,
  ImagePlus,
} from "lucide-react";
import type { Bag, Item } from "../core/model";
import { id } from "../core/model";
import { capturePhoto, isNative } from "../platform";
import { thumbnail } from "../platform/photos";
import type { PhotoRecord } from "../platform/photos";
import type { Repository } from "../platform/repository";
export const iconMap = {
  bag: Backpack,
  wallet: Wallet,
  key: KeyRound,
  laptop: Laptop,
  phone: Smartphone,
  book: BookOpen,
  headphones: Headphones,
  bottle: BottleWine,
  item: Package,
};
export function Visual({
  object,
  repo,
  size = 40,
}: {
  object: Bag | Item;
  repo: Repository;
  size?: number;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true,
      address = "";
    setUrl(undefined);
    if (object.imageId)
      repo.photos.get(object.imageId).then((p) => {
        if (p && alive) {
          address = URL.createObjectURL(p.blob);
          setUrl(address);
        }
      });
    return () => {
      alive = false;
      if (address) URL.revokeObjectURL(address);
    };
  }, [object.imageId, repo]);
  const Icon = "icon" in object ? iconMap[object.icon] : Backpack;
  return (
    <span
      className={`visual ${"color" in object ? `color-${object.color}` : ""}`}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" />
      ) : (
        <Icon size={size * 0.53} strokeWidth={1.8} />
      )}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [operationError, setOperationError] = useState("");
  useEffect(() => {
    const show = (e: Event) =>
      setOperationError((e as CustomEvent<string>).detail);
    window.addEventListener("packcalendar-error", show);
    return () => window.removeEventListener("packcalendar-error", show);
  }, []);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      className={`modal ${wide ? "wide" : ""}`}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
      aria-label={title}
    >
      <header className="modal-header">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="閉じる"
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <ErrorMessage message={operationError} />
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="error" role="alert">
      {message}
    </p>
  ) : null;
}
export function PhotoField({
  onPhoto,
  initial,
  repo,
}: {
  onPhoto: (photo: PhotoRecord | null) => void;
  initial?: Bag | Item;
  repo: Repository;
}) {
  const camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  async function pick(file?: Blob) {
    if (!file) return;
    try {
      const blob = await thumbnail(file);
      setUrl(URL.createObjectURL(blob));
      onPhoto({ id: id(), blob });
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="photo-field">
      {url ? (
        <img className="photo-preview" src={url} alt="選択した写真" />
      ) : initial ? (
        <Visual object={initial} repo={repo} size={64} />
      ) : (
        <span className="photo-placeholder">
          <Camera />
        </span>
      )}
      <div className="button-row">
        <button
          type="button"
          className="button secondary"
          onClick={async () => {
            if (!isNative) camera.current?.click();
            else {
              try {
                const photo = await capturePhoto();
                if (photo) await pick(photo);
              } catch (e) {
                setError((e as Error).message);
              }
            }
          }}
        >
          <Camera size={18} />
          撮影
        </button>
        <button
          type="button"
          className="button secondary"
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus size={18} />
          写真を選ぶ
        </button>
        {(url || initial?.imageId) && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setUrl("");
              onPhoto(null);
            }}
          >
            写真を外す
          </button>
        )}
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-label="写真を撮影"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/*"
        hidden
        aria-label="写真ファイル"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      <ErrorMessage message={error} />
    </div>
  );
}
export const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
export function Weekdays({
  value,
  onChange,
}: {
  value: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <fieldset className="weekdays">
      <legend>繰り返す曜日</legend>
      {[1, 2, 3, 4, 5, 6, 0].map((day) => (
        <label key={day}>
          <input
            type="checkbox"
            checked={value.includes(day)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...value, day]
                  : value.filter((d) => d !== day),
              )
            }
          />
          <span>{weekdays[day]}</span>
        </label>
      ))}
    </fieldset>
  );
}
export function BagOptions({ bags }: { bags: Bag[] }) {
  return (
    <>
      <option value="">指定しない</option>
      {bags.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </>
  );
}
export const dayLabel = (day: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${day.slice(0, 10)}T12:00`));
export function BagBadge({ bag }: { bag?: Bag }) {
  return bag ? (
    <span className={`bag-badge color-${bag.color}`}>
      <span className="bag-dot" />
      {bag.name}
    </span>
  ) : (
    <span className="muted">バッグなし</span>
  );
}
