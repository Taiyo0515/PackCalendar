import { useRef, useState } from "react";
import { X, Camera } from "lucide-react";
import { HOME, WORN, newId } from "../core/model";
import { removeItem } from "../core/prep";
import { thumbnail } from "../platform/photos";
import { toPhoto } from "../platform/store";
import type { Photo } from "../platform/store";
import { useApp } from "./App";
import { BagChip, Sheet } from "./kit";

export function ItemEditor({ itemId }: { itemId: string | null }) {
  const { state, photos, commit, close, say } = useApp();
  const item = itemId ? state.items.find((i) => i.id === itemId) ?? null : null;
  const [name, setName] = useState(item?.name ?? "");
  const [at, setAt] = useState<string | null>(item ? item.at : HOME);
  const [pins, setPins] = useState<string[]>(() => state.bags.filter((b) => item && b.itemIds.includes(item.id)).map((b) => b.id));
  const [photo, setPhoto] = useState<{ id: string; blob: Blob; url: string } | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(item?.photoId ?? null);
  const pinsTouched = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const pickPlace = (where: string | null) => {
    if (!item && !pinsTouched.current) {
      const bagIds = state.bags.map((b) => b.id);
      setPins((p) => {
        const kept = p.filter((x) => x !== at);
        return where && bagIds.includes(where) && !kept.includes(where) ? [...kept, where] : kept;
      });
    }
    setAt(where);
  };

  const save = (again: boolean) => {
    const n = name.trim();
    if (!n) return;
    const id = item?.id ?? newId();
    const list: Photo[] = [];
    const commitWith = (p: Photo | null) => {
      if (p) list.push(p);
      const ok = commit(
        (s) => {
          const nowIso = new Date().toISOString();
          const existing = s.items.find((i) => i.id === id);
          if (existing) {
            existing.name = n;
            existing.photoId = photoId;
            if (existing.at !== at) {
              existing.at = at;
              existing.atTime = nowIso;
            }
          } else s.items.push({ id, name: n, photoId, at, atTime: nowIso });
          for (const b of s.bags) {
            const has = b.itemIds.includes(id);
            if (pins.includes(b.id) && !has) b.itemIds.push(id);
            if (!pins.includes(b.id) && has) b.itemIds = b.itemIds.filter((x) => x !== id);
          }
        },
        { photos: list },
      );
      if (!ok) return;
      if (again) {
        setName("");
        setPhoto(null);
        setPhotoId(null);
        say(`${n}を追加しました`);
        nameRef.current?.focus();
      } else close();
    };
    if (photo) void toPhoto(photo.id, photo.blob).then(commitWith);
    else commitWith(null);
  };

  const src = photo?.url ?? (photoId ? photos[photoId] : undefined);
  const places: [string | null, string][] = [
    [HOME, "自宅"],
    [WORN, "身につける"],
    ...state.bags.map((b) => [b.id, b.name] as [string, string]),
    [null, "不明"],
  ];
  return (
    <Sheet onClose={() => close()} full label={item ? "持ち物を編集" : "持ち物を追加"}>
      <div className="sheet-head">
        <button className="icon-btn" aria-label="閉じる" onClick={() => close()}>
          <X size={26} />
        </button>
        <span style={{ flex: 1 }} />
        <button className="save-btn" disabled={!name.trim()} onClick={() => save(false)}>
          保存
        </button>
      </div>
      <div className="sheet-body">
        <label className="photo-pick" aria-label="写真">
          {src ? <img src={src} alt="" /> : <Camera size={30} />}
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const blob = await thumbnail(file);
                const id = newId();
                setPhoto({ id, blob, url: URL.createObjectURL(blob) });
                setPhotoId(id);
              } catch (err) {
                say(err instanceof Error ? err.message : "写真を読み込めませんでした");
              }
            }}
          />
        </label>
        <input
          ref={nameRef}
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前"
          aria-label="名前"
          maxLength={200}
          autoFocus={!item}
          enterKeyHint="done"
          onKeyDown={(e) => e.key === "Enter" && save(!item)}
        />
        <div className="section">場所</div>
        <div className="chips" role="group" aria-label="場所">
          {places.map(([id, label]) => (
            <button key={String(id)} className="chip" aria-pressed={at === id} onClick={() => pickPlace(id)}>
              {label}
            </button>
          ))}
        </div>
        {state.bags.length > 0 && (
          <>
            <div className="section">いつも入れるバッグ</div>
            <div className="chips" role="group" aria-label="いつも入れるバッグ">
              {state.bags.map((b) => (
                <BagChip
                  key={b.id}
                  bag={b}
                  on={pins.includes(b.id)}
                  onClick={() => {
                    pinsTouched.current = true;
                    setPins((p) => (p.includes(b.id) ? p.filter((x) => x !== b.id) : [...p, b.id]));
                  }}
                />
              ))}
            </div>
          </>
        )}
        {photoId && (
          <div className="buttons">
            <button
              className="secondary"
              onClick={() => {
                setPhoto(null);
                setPhotoId(null);
              }}
            >
              写真を外す
            </button>
          </div>
        )}
        {!item && (
          <div className="buttons">
            <button className="secondary" disabled={!name.trim()} onClick={() => save(true)}>
              続けて追加
            </button>
          </div>
        )}
        {item && (
          <div className="group" style={{ marginTop: 32 }}>
            <button
              className="row danger"
              onClick={() => {
                if (commit((s) => removeItem(s, item.id), { toast: `${item.name}を削除しました`, undo: true })) close();
              }}
            >
              削除
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
