import { useRef, useState } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Pin,
  Plus,
  Search,
  TriangleAlert,
} from "lucide-react";
import * as C from "../core/domain";
import type { Item, Location, Occurrence, State } from "../core/model";
import type { Repository } from "../platform/repository";
import type { Commit } from "./types";
import { Modal, Visual } from "./shared";
export function BagContents({
  state,
  repo,
  commit,
  initialBag,
  event,
  onClose,
  onQuick,
}: {
  state: State;
  repo: Repository;
  commit: Commit;
  initialBag: string;
  event?: Occurrence;
  onClose: () => void;
  onQuick: (bagId: string) => void;
}) {
  const [bagId, setBagId] = useState(initialBag),
    [otherBag, setOtherBag] = useState(""),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [dropTarget, setDropTarget] = useState(""),
    [dragging, setDragging] = useState("");
  const press = useRef<ReturnType<typeof setTimeout> | null>(null),
    held = useRef(false);
  const bag = C.bagById(state, bagId);
  if (!bag)
    return (
      <Modal title="バッグの中身" onClose={onClose}>
        <div className="form-body">
          <p>バッグが削除されています。</p>
        </div>
      </Modal>
    );
  const relevant =
    event && event.plan.bagId === bagId
      ? event.plan
      : { ...C.emptyPlan(), bagId };
  const needed = C.requiredItems(state, relevant),
    missing = C.preparation(state, relevant).map((a) => a.item),
    inside = C.items(state).filter((i) => i.location.containerId === bagId);
  const outside = C.items(state).filter(
    (i) => i.location.containerId !== bagId,
  );
  const places = [
    ...C.active(state.containers)
      .filter((c) => c.id !== bagId)
      .map((c) => ({
        id: c.id,
        name: c.name,
        containerId: c.id as string | null,
      })),
    { id: "unknown", name: "不明", containerId: null },
  ];
  const matches = (i: Item) =>
    i.name.toLowerCase().includes(search.toLowerCase());
  async function move(ids: string[], target: string | null) {
    if (
      await commit(
        (s) =>
          C.moveItems(s, ids, target, {
            initialPin: true,
            source: event ? "prep" : "manual",
            event,
          }),
        `${ids.length}点の位置を変更しました`,
        { undo: true },
      )
    )
      setSelected([]);
  }
  const toggle = (id: string) =>
    setSelected((ids) =>
      ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id],
    );
  function dropProps(place: string, target: string | null) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDropTarget(place);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node))
          setDropTarget("");
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const key = e.dataTransfer.getData("application/packcalendar-item");
        const ids = selected.includes(key) ? selected : [key];
        if (
          ids.length &&
          ids.every((id) => C.items(state).some((i) => i.id === id))
        )
          void move(ids, target);
        setDropTarget("");
        setDragging("");
      },
    };
  }
  function card(item: Item, isMissing = false, right = false) {
    const pinned = bag!.itemIds.includes(item.id),
      inBag = item.location.containerId === bagId;
    const target = inBag ? otherBag || "home" : bagId;
    return (
      <div
        className={`content-item ${isMissing ? "missing" : ""} ${selected.includes(item.id) ? "checked" : ""}`}
        key={`${isMissing ? "missing-" : ""}${item.id}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("application/packcalendar-item", item.id);
          e.dataTransfer.effectAllowed = "move";
          setDragging(item.id);
        }}
        onDragEnd={() => {
          setDragging("");
          setDropTarget("");
        }}
      >
        <label className="select-item">
          <input
            type="checkbox"
            checked={selected.includes(item.id)}
            onChange={() => toggle(item.id)}
            aria-label={`${item.name}を選択`}
          />
        </label>
        <button
          className="content-item-main"
          aria-label={`${item.name}を${inBag ? (otherBag ? C.bagById(state, otherBag)?.name : "自宅") : bag!.name}へ移す`}
          onPointerDown={(e) => {
            if (e.pointerType === "touch") {
              held.current = false;
              press.current = setTimeout(() => {
                held.current = true;
                toggle(item.id);
              }, 550);
            }
          }}
          onPointerUp={() => {
            if (press.current) clearTimeout(press.current);
          }}
          onPointerCancel={() => {
            if (press.current) clearTimeout(press.current);
          }}
          onClick={() => {
            if (held.current) {
              held.current = false;
              return;
            }
            if (selected.length) toggle(item.id);
            else void move([item.id], target);
          }}
        >
          <Visual object={item} repo={repo} size={36} />
          <span>
            <strong>{item.name}</strong>
            {isMissing && (
              <small>
                {C.locationName(state, item.location)}から
                {C.suggestLocation(state, item)
                  ? `（たぶん${C.containerById(state, C.suggestLocation(state, item))?.name}）`
                  : ""}
              </small>
            )}
          </span>
          <ArrowRight size={16} className={inBag ? "" : "point-left"} />
        </button>
        {!right && (
          <button
            className="pin-button"
            aria-label={`${item.name}を基本セット${pinned ? "から外す" : "にする"}`}
            aria-pressed={pinned}
            onClick={() =>
              void commit(
                (s) => {
                  const b = C.bagById(s, bagId)!;
                  b.itemIds = pinned
                    ? b.itemIds.filter((id) => id !== item.id)
                    : [...b.itemIds, item.id];
                },
                "基本セットを更新しました",
                { undo: true },
              )
            }
          >
            <Pin size={17} fill={pinned ? "currentColor" : "none"} />
          </button>
        )}
      </div>
    );
  }
  return (
    <Modal title="バッグの中身" wide onClose={onClose}>
      <div className="contents-body">
        <div className="bag-switcher" aria-label="バッグを切り替え">
          {C.bags(state).map((b) => (
            <button
              className={`bag-tab color-${b.color}`}
              key={b.id}
              aria-pressed={b.id === bagId}
              onClick={() => {
                setBagId(b.id);
                if (otherBag === b.id) setOtherBag("");
                setSelected([]);
              }}
            >
              {b.name}
            </button>
          ))}
        </div>
        <div className="contents-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="中身を検索"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="持ち物を検索"
            />
          </label>
          <label className="swap-select">
            <ArrowLeftRight size={18} />
            <span className="sr-only">移し替える相手</span>
            <select
              aria-label="移し替える相手"
              value={otherBag}
              onChange={(e) => setOtherBag(e.target.value)}
            >
              <option value="">すべての場所</option>
              {C.bags(state)
                .filter((b) => b.id !== bagId)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}と移し替え
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="button-row">
          <button
            className="text-button"
            disabled={!inside.length}
            onClick={() =>
              void move(
                inside.map((i) => i.id),
                "home",
              )
            }
          >
            バッグを空にした（自宅へ）
          </button>
        </div>
        <p className="contents-help">
          タップで入れる・出す。ピンは「いつも必要な物」です。PCではドラッグでも移せます。
        </p>
        {selected.length > 0 && (
          <div className="selection-bar" role="status">
            <strong>{selected.length}点選択</strong>
            <button
              className="button small primary"
              onClick={() => void move(selected, bagId)}
            >
              まとめて入れる
            </button>
            <button
              className="button small secondary"
              onClick={() => void move(selected, otherBag || "home")}
            >
              {otherBag ? "相手に移す" : "自宅へ出す"}
            </button>
            <button className="text-button" onClick={() => setSelected([])}>
              解除
            </button>
          </div>
        )}
        <div
          className={`contents-grid ${otherBag ? "swap-mode" : ""} ${dragging ? "dragging" : ""}`}
        >
          <section
            className={`inside-panel ${dropTarget === bagId ? "drop-active" : ""}`}
            {...dropProps(bagId, bagId)}
          >
            <header className={`contents-panel-header color-${bag.color}`}>
              <Visual object={bag} repo={repo} size={40} />
              <div>
                <h3>{bag.name}</h3>
                <span>入っている {inside.length}点</span>
              </div>
            </header>
            <div className="content-cards">
              {inside.filter(matches).map((i) => card(i))}
              {!inside.length && <p className="empty-drop">ここへ入れる</p>}
            </div>
            {missing.length > 0 && (
              <div className="missing-section">
                <h4>
                  足りない <span>{missing.length}点</span>
                </h4>
                <div className="content-cards">
                  {missing.filter(matches).map((i) => card(i, true))}
                </div>
              </div>
            )}
            {needed.some(
              (i) =>
                C.containerById(state, i.location.containerId)?.kind === "worn",
            ) && (
              <p className="inline-note">
                身につけている物は、バッグへ移す必要がありません。
              </p>
            )}
            {event?.plan.temporaryItems.length ? (
              <div className="temporary-section">
                <h4>今回だけ</h4>
                {event.plan.temporaryItems.map((name) => (
                  <p key={name}>{name}</p>
                ))}
                {!state.processed.includes(`temporary:${event.key}`) && (
                  <button
                    className="button small secondary"
                    onClick={() =>
                      void commit(
                        (s) => {
                          s.processed.push(`temporary:${event.key}`);
                        },
                        "今回だけの持ち物を準備済みにしました",
                        { undo: true },
                      )
                    }
                  >
                    <Check size={16} />
                    準備済みにする
                  </button>
                )}
              </div>
            ) : null}
            <button
              className="text-button add-content"
              onClick={() => onQuick(bagId)}
            >
              <Plus size={17} />
              このバッグに持ち物を登録
            </button>
          </section>
          <section className="outside-panel">
            <h3>
              {otherBag ? C.bagById(state, otherBag)?.name : "バッグの外"}
            </h3>
            {places
              .filter((p) => !otherBag || p.containerId === otherBag)
              .map((place) => {
                const items = outside.filter(
                  (i) =>
                    i.location.containerId === place.containerId && matches(i),
                );
                return (
                  <details
                    open
                    className={`place-group ${dropTarget === place.id ? "drop-active" : ""}`}
                    key={place.id}
                    {...dropProps(place.id, place.containerId)}
                  >
                    <summary>
                      {place.name}
                      <span>{items.length}点</span>
                    </summary>
                    <div className="content-cards">
                      {items.map((i) => card(i, false, true))}
                      {!items.length && (
                        <p className="empty-drop">ここへ移す</p>
                      )}
                    </div>
                  </details>
                );
              })}
          </section>
        </div>
        <details className="forget-section">
          <summary>
            <TriangleAlert size={17} />
            持ってくるのを忘れた
          </summary>
          <p>記録上の位置を「不明」に戻し、履歴に残します。</p>
          <div className="chips">
            {needed.map((i) => (
              <button
                className="chip"
                key={i.id}
                onClick={() =>
                  void commit(
                    (s) =>
                      C.moveItems(s, [i.id], null, { source: "forgot", event }),
                    `${i.name}を「不明」に戻しました`,
                    { undo: true },
                  )
                }
              >
                {i.name}を忘れた
              </button>
            ))}
          </div>
        </details>
      </div>
      <footer className="modal-footer">
        <small>位置の記録です。実際に動かした場所に合わせてください。</small>
        <button className="button secondary" onClick={onClose}>
          閉じる
        </button>
      </footer>
    </Modal>
  );
}
