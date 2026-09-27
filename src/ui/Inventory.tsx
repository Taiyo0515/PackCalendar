import { useState } from "react";
import {
  ArrowRight,
  Backpack,
  Plus,
  Search,
  History,
  Undo2,
  TriangleAlert,
  Pencil,
} from "lucide-react";
import * as C from "../core/domain";
import type { Bag, Item, State } from "../core/model";
import type { Repository } from "../platform/repository";
import type { Commit } from "./types";
import { Visual, dayLabel } from "./shared";
export function Inventory({
  state,
  repo,
  commit,
  onQuick,
  onBag,
  onEditBag,
  onItem,
}: {
  state: State;
  repo: Repository;
  commit: Commit;
  onQuick: () => void;
  onBag: (bag: Bag) => void;
  onEditBag: (bag?: Bag) => void;
  onItem: (item: Item) => void;
}) {
  const [tab, setTab] = useState("bags"),
    [search, setSearch] = useState(""),
    [limit, setLimit] = useState(30);
  const sourceName = {
    auto: "自動記録",
    manual: "位置修正",
    prep: "早めの準備",
    forgot: "忘れた",
    undo: "取消",
    initial: "初期登録",
  };
  return (
    <>
      <div className="page-title">
        <div>
          <h1>持ち物</h1>
          <p>バッグと、移し忘れたくない物</p>
        </div>
        <button className="button primary" onClick={onQuick}>
          <Plus size={20} />
          クイック登録
        </button>
      </div>
      <div className="inventory-toolbar">
        <div className="segmented" role="tablist" aria-label="持ち物の表示">
          {[
            ["bags", "バッグ"],
            ["items", "持ち物"],
            ["history", "履歴"],
          ].map(([id, text]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {id === "history" && <History size={16} />}
              {text}
            </button>
          ))}
        </div>
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="持ち物を検索"
            placeholder="名前で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      {tab === "bags" && (
        <div className="bag-grid">
          {C.bags(state)
            .filter((b) => b.name.includes(search))
            .map((bag) => {
              const current = C.items(state).filter(
                (i) => i.location.containerId === bag.id,
              );
              const missing = C.preparation(state, {
                bagId: bag.id,
                addedItemIds: [],
                removedItemIds: [],
                temporaryItems: [],
              });
              return (
                <article className={`bag-card color-${bag.color}`} key={bag.id}>
                  <button className="bag-open" onClick={() => onBag(bag)}>
                    <Visual object={bag} repo={repo} size={72} />
                    <h2>{bag.name}</h2>
                    <p>
                      基本セット {bag.itemIds.length}点{" "}
                      <span>／ 中に{current.length}点</span>
                    </p>
                    <span
                      className={`bag-status ${missing.length ? "" : "ready"}`}
                    >
                      {missing.length
                        ? `外にある基本セット ${missing.length}点`
                        : "基本セットがそろっています"}
                      <ArrowRight size={18} />
                    </span>
                  </button>
                  <button
                    className="text-button bag-edit"
                    onClick={() => onEditBag(bag)}
                  >
                    <Pencil size={16} />
                    名前・写真を編集
                  </button>
                </article>
              );
            })}
          <button className="add-bag" onClick={() => onEditBag()}>
            <Backpack size={32} />
            <strong>バッグを追加</strong>
            <span>既存のバッグからも作れます</span>
          </button>
        </div>
      )}
      {tab === "items" && (
        <div className="panel item-list">
          {C.items(state)
            .filter((i) => i.name.includes(search))
            .map((item) => (
              <div className="item-list-row" key={item.id}>
                <button className="item-open" onClick={() => onItem(item)}>
                  <Visual object={item} repo={repo} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{C.locationName(state, item.location)}</small>
                  </span>
                </button>
                <button
                  className="text-button forgot-button"
                  onClick={() =>
                    void commit(
                      (s) =>
                        C.moveItems(s, [item.id], null, { source: "forgot" }),
                      `${item.name}を「不明」に戻しました`,
                      { undo: true },
                    )
                  }
                >
                  <TriangleAlert size={16} />
                  忘れた
                </button>
              </div>
            ))}
          {!C.items(state).length && (
            <div className="empty-state">
              <p>写真と名前だけで登録できます。</p>
              <button className="button primary" onClick={onQuick}>
                <Plus size={18} />
                最初の持ち物を登録
              </button>
            </div>
          )}
        </div>
      )}
      {tab === "history" && (
        <section className="panel history-panel">
          <header>
            <h2>位置の記録</h2>
            <p>
              自動記録は実際の移動を検知したものではありません。違っていたら取り消せます。
            </p>
          </header>
          {[...state.moves]
            .reverse()
            .filter((m) => m.itemName.includes(search))
            .slice(0, limit)
            .map((move) => {
              const canUndo =
                !move.undone &&
                C.items(state).find((i) => i.id === move.itemId)?.location
                  .moveId === move.id;
              return (
                <article className="history-row" key={move.id}>
                  <div>
                    <span
                      className={`source-label ${move.source === "auto" ? "auto" : ""}`}
                    >
                      {sourceName[move.source]}
                    </span>
                    <strong>{move.itemName}</strong>
                    <p>
                      {C.locationName(state, move.from)} →{" "}
                      {C.locationName(state, move.to)}
                    </p>
                    <small>
                      {dayLabel(C.dateKey(new Date(move.at)))}{" "}
                      {new Date(move.at).toLocaleTimeString("ja-JP", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {move.eventTitle ? ` · ${move.eventTitle}` : ""}
                    </small>
                  </div>
                  {canUndo ? (
                    <button
                      className="button small secondary"
                      onClick={() =>
                        void commit(
                          (s) => C.undoMove(s, move.id),
                          "位置の記録を取り消しました",
                        )
                      }
                    >
                      <Undo2 size={16} />
                      取消
                    </button>
                  ) : (
                    <small>{move.undone ? "取消済み" : "後の記録あり"}</small>
                  )}
                </article>
              );
            })}
          {!state.moves.length && (
            <div className="empty-state">
              <History />
              <p>まだ位置の変更はありません。</p>
            </div>
          )}
          {state.moves.length > limit && (
            <button
              className="button secondary"
              onClick={() => setLimit((n) => n + 30)}
            >
              さらに表示
            </button>
          )}
        </section>
      )}
    </>
  );
}
