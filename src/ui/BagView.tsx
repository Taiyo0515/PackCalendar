import { useEffect, useState } from "react";
import type { DragEvent } from "react";
import { ArrowLeft, Pin } from "lucide-react";
import { HOME, WORN } from "../core/model";
import type { Item } from "../core/model";
import { bagOf, moveItems, placeName, togglePin, unitsBetween } from "../core/prep";
import { useApp } from "./App";
import { Avatar, Sheet, bagColor } from "./kit";

export function BagView({ bagId, unitKey }: { bagId: string; unitKey?: string }) {
  const { state, now, photos, wide, commit, open, close } = useApp();
  const [over, setOver] = useState<"in" | "out" | null>(null);
  const bag = bagOf(state, bagId);
  useEffect(() => {
    if (!bag) close();
  }, [bag, close]);
  if (!bag) return null;
  const unit = unitKey
    ? unitsBetween(state, now, new Date(now.getTime() + 49 * 3600000)).find((u) => u.key === unitKey && u.bagId === bagId)
    : undefined;
  const wanted = unit ? unit.itemIds : bag.itemIds;
  const missing = state.items.filter((i) => wanted.includes(i.id) && i.at !== bagId && i.at !== WORN);
  const inside = state.items.filter((i) => i.at === bagId);
  const others = state.items.filter((i) => !missing.includes(i) && !inside.includes(i));

  const move = (item: Item, to: string) =>
    commit((s) => moveItems(s, [item.id], to), { toast: `${item.name} → ${placeName(state, to)}`, undo: true });
  const pin = (item: Item) =>
    commit((s) => togglePin(s.bags.find((b) => b.id === bagId)!, item.id));

  const row = (item: Item, action: "in" | "out", showPlace: boolean) => (
    <div
      key={item.id}
      className="row tap"
      draggable={wide}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
    >
      <button
        style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0, minHeight: 40, textAlign: "left" }}
        onClick={() => move(item, action === "in" ? bagId : HOME)}
        aria-label={`${item.name}を${action === "in" ? `${bag.name}に入れる` : "出す"}`}
      >
        <Avatar item={item} photos={photos} />
        <span className="main-text">{item.name}</span>
        {showPlace && <span className="value">{placeName(state, item.at)}</span>}
      </button>
      <button
        className="pin"
        aria-pressed={bag.itemIds.includes(item.id)}
        aria-label={`${item.name}を基本セットに${bag.itemIds.includes(item.id) ? "入れない" : "入れる"}`}
        onClick={() => pin(item)}
      >
        <Pin size={18} fill={bag.itemIds.includes(item.id) ? "currentColor" : "none"} />
      </button>
    </div>
  );

  const drop = (zone: "in" | "out") => ({
    onDragOver: (e: DragEvent) => {
      if (!wide) return;
      e.preventDefault();
      setOver(zone);
    },
    onDragLeave: () => setOver(null),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setOver(null);
      const item = state.items.find((i) => i.id === e.dataTransfer.getData("text/plain"));
      if (!item) return;
      if (zone === "in" && item.at !== bagId) move(item, bagId);
      if (zone === "out" && item.at === bagId) move(item, HOME);
    },
  });

  return (
    <Sheet onClose={() => close()} full label={bag.name}>
      <div className="sheet-head">
        <button className="icon-btn" aria-label="戻る" onClick={() => close()} autoFocus>
          <ArrowLeft size={24} />
        </button>
        <h2 style={{ justifyContent: "center" }}>
          <span className="dot" style={{ background: bagColor(bag), alignSelf: "center" }} />
          {bag.name}
        </h2>
        <button className="text-btn" onClick={() => open({ type: "bagEdit", bagId })}>
          編集
        </button>
      </div>
      <div className="sheet-body">
        <div className={`bag-cols${wide ? " dnd" : ""}`}>
          <div className={over === "in" ? "drop" : ""} {...drop("in")} style={{ minHeight: wide ? 120 : undefined }}>
            {(missing.length > 0 || (unit && unit.extra.length > 0)) && (
              <>
                <div className="section">足りない</div>
                <div className="group">
                  {missing.map((i) => row(i, "in", true))}
                  {unit?.extra.map((t) => (
                    <div key={`x-${t}`} className="row extra">
                      <span className="avatar">{[...t][0]}</span>
                      <span className="main-text">{t}</span>
                      <span className="value">今回だけ</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {inside.length > 0 && (
              <>
                <div className="section">入っている</div>
                <div className="group">{inside.map((i) => row(i, "out", false))}</div>
              </>
            )}
          </div>
          <div className={over === "out" ? "drop" : ""} {...drop("out")} style={{ minHeight: wide ? 120 : undefined }}>
            {others.length > 0 && (
              <>
                <div className="section">ほか</div>
                <div className="group">{others.map((i) => row(i, "in", true))}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
