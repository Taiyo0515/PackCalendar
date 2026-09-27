import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import * as C from "../core/domain";
import type { Bag, Item, State } from "../core/model";
import type { Repository } from "../platform/repository";
import type { PhotoRecord } from "../platform/photos";
import type { Commit } from "./types";
import {
  BagOptions,
  ErrorMessage,
  Field,
  Modal,
  PhotoField,
  iconMap,
} from "./shared";
export function QuickEditor({
  state,
  repo,
  commit,
  initialBagId,
  item,
  bag,
  bagMode = false,
  onClose,
  onBagCreated,
}: {
  state: State;
  repo: Repository;
  commit: Commit;
  initialBagId?: string;
  item?: Item;
  bag?: Bag;
  bagMode?: boolean;
  onClose: () => void;
  onBagCreated: (id: string) => void;
}) {
  const [kind, setKind] = useState<"item" | "bag">(
      bag || bagMode ? "bag" : "item",
    ),
    [name, setName] = useState(item?.name ?? bag?.name ?? ""),
    [bagId, setBagId] = useState(
      initialBagId ?? (item ? (item.location.containerId ?? "") : "home"),
    );
  const [photo, setPhoto] = useState<PhotoRecord | null | undefined>(),
    [color, setColor] = useState<Bag["color"]>(bag?.color ?? "sage"),
    [memo, setMemo] = useState(item?.memo ?? bag?.memo ?? ""),
    [icon, setIcon] = useState<Item["icon"] | "">(item?.icon ?? ""),
    [copyId, setCopyId] = useState("");
  const [continuous, setContinuous] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [round, setRound] = useState(0),
    [saved, setSaved] = useState(""),
    [locationChanged, setLocationChanged] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const objectId = item?.id ?? bag?.id ?? C.id(),
      imageId =
        photo === undefined
          ? (item?.imageId ?? bag?.imageId ?? null)
          : (photo?.id ?? null);
    try {
      const ok = await commit(
        (s) => {
          if (kind === "bag") {
            const value: Bag = {
              ...C.entityStamp(),
              kind: "bag",
              id: objectId,
              name: name.trim(),
              memo,
              color,
              imageId,
              itemIds: s.containers.find((b) => b.id === bag?.id)?.itemIds ?? [
                ...(s.containers.find((b) => b.id === copyId)?.itemIds ?? []),
              ],
            };
            const index = s.containers.findIndex((b) => b.id === objectId);
            if (index < 0) s.containers.push(value);
            else s.containers[index] = value;
          } else {
            const target = bagId || null;
            const value: Item = {
              ...C.entityStamp(),
              id: objectId,
              name: name.trim(),
              memo,
              icon: icon || C.guessIcon(name),
              imageId,
              location:
                s.items.find((i) => i.id === item?.id)?.location ??
                C.homeLocation(),
            };
            const index = s.items.findIndex((i) => i.id === objectId);
            if (index < 0) s.items.push(value);
            else s.items[index] = value;
            if (!item || locationChanged)
              C.moveItems(s, [objectId], target, {
                source: item ? "manual" : "initial",
              });
            if (!item && C.bagById(s, bagId)) {
              const b = C.bagById(s, bagId)!;
              if (!b.itemIds.includes(objectId)) b.itemIds.push(objectId);
            }
          }
        },
        `${name.trim()}を保存しました`,
        { photos: photo ? [photo] : [] },
      );
      if (ok) {
        if (continuous && !item && !bag && kind === "item") {
          setSaved(`${name.trim()}を登録しました。続けて登録できます。`);
          setName("");
          setPhoto(undefined);
          setMemo("");
          setIcon("");
          setRound((n) => n + 1);
          input.current?.focus();
        } else {
          onClose();
          if (kind === "bag" && !bag) onBagCreated(objectId);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <Modal
      title={item ? "持ち物を編集" : bag ? "バッグを編集" : "クイック登録"}
      onClose={onClose}
    >
      <form className="editor-form" onSubmit={save}>
        <div className="form-body">
          <ErrorMessage message={error} />
          {saved && (
            <p className="success-message" role="status">
              {saved}
            </p>
          )}
          <PhotoField
            key={round}
            initial={item ?? bag}
            repo={repo}
            onPhoto={setPhoto}
          />
          <Field label="名前">
            <input
              autoFocus
              ref={input}
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                kind === "bag" ? "例：通勤リュック" : "例：財布、鍵、イヤホン"
              }
            />
          </Field>
          {!item && !bag && (
            <div className="chips">
              {(kind === "item"
                ? ["財布", "鍵", "スマホ", "イヤホン", "学生証"]
                : ["リュック", "トート", "ミニバッグ"]
              ).map((n) => (
                <button
                  type="button"
                  key={n}
                  className="chip"
                  onClick={() => {
                    setName(n);
                    input.current?.focus();
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
          {!item && !bag && (
            <fieldset className="segmented kind-picker">
              <legend className="sr-only">登録する種類</legend>
              <label>
                <input
                  type="radio"
                  name="kind"
                  checked={kind === "item"}
                  onChange={() => setKind("item")}
                />
                <span>持ち物</span>
              </label>
              <label>
                <input
                  type="radio"
                  name="kind"
                  checked={kind === "bag"}
                  onChange={() => setKind("bag")}
                />
                <span>バッグ</span>
              </label>
            </fieldset>
          )}
          {kind === "item" ? (
            <Field
              label={item ? "記録上の位置" : "入っているバッグ（任意）"}
              hint={
                !item && C.bagById(state, bagId)
                  ? "位置と基本セットに、同時に登録します。"
                  : undefined
              }
            >
              <select
                value={bagId}
                onChange={(e) => {
                  setBagId(e.target.value);
                  setLocationChanged(true);
                }}
              >
                {C.active(state.containers).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="">不明</option>
              </select>
            </Field>
          ) : (
            !bag && (
              <Field
                label="既存のバッグから作る（任意）"
                hint="基本セットをコピーします。持ち物の位置は現在のままです。"
              >
                <select
                  value={copyId}
                  onChange={(e) => {
                    setCopyId(e.target.value);
                    const b = C.bags(state).find(
                      (b) => b.id === e.target.value,
                    );
                    if (b) setColor(b.color);
                  }}
                >
                  <BagOptions bags={C.bags(state)} />
                </select>
              </Field>
            )
          )}
          <details className="form-details">
            <summary>詳細設定</summary>
            <div>
              {kind === "bag" ? (
                <fieldset className="color-options">
                  <legend>バッグの色</legend>
                  {C.COLORS.map((c) => (
                    <label key={c} className={`color-${c}`}>
                      <input
                        type="radio"
                        name="color"
                        value={c}
                        checked={color === c}
                        onChange={() => setColor(c)}
                      />
                      <span>
                        {
                          {
                            sage: "緑",
                            sand: "黄",
                            blue: "青",
                            rose: "赤",
                            plum: "紫",
                          }[c]
                        }
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <Field label="アイコン">
                  <select
                    value={icon}
                    onChange={(e) => setIcon(e.target.value as Item["icon"])}
                  >
                    <option value="">名前から自動で選ぶ</option>
                    {Object.keys(iconMap).map((i) => (
                      <option key={i} value={i}>
                        {
                          (
                            {
                              bag: "バッグ",
                              wallet: "財布",
                              key: "鍵",
                              laptop: "PC",
                              phone: "スマートフォン",
                              book: "本",
                              headphones: "イヤホン",
                              bottle: "水筒",
                              item: "その他の物",
                            } as Record<string, string>
                          )[i]
                        }
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="メモ">
                <textarea
                  value={memo}
                  rows={3}
                  maxLength={10000}
                  onChange={(e) => setMemo(e.target.value)}
                />
              </Field>
            </div>
          </details>
          {!item && !bag && kind === "item" && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={continuous}
                onChange={(e) => setContinuous(e.target.checked)}
              />
              続けて登録する
            </label>
          )}
        </div>
        <footer className="modal-footer">
          {(item || bag) && (
            <button
              className="button danger"
              type="button"
              onClick={async () => {
                if (confirm(`${name}を削除しますか？`))
                  if (
                    await commit(
                      (s) =>
                        item
                          ? C.removeItem(s, item.id)
                          : C.removeBag(s, bag!.id),
                      "削除しました",
                      { undo: true },
                    )
                  )
                    onClose();
              }}
            >
              削除
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button secondary" onClick={onClose}>
            キャンセル
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            <Plus size={17} />
            {continuous && !item && kind === "item"
              ? "保存して次へ"
              : "保存する"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
