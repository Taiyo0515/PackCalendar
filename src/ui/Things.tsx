import { ChevronRight, Plus } from "lucide-react";
import { placeName } from "../core/prep";
import { useApp } from "./App";
import { Avatar, bagColor } from "./kit";

export function Things() {
  const { state, photos, open } = useApp();
  return (
    <>
      <header className="head">
        <h1 className="title">持ち物</h1>
      </header>
      <div className="scroll">
        <div className="page">
          <div className="section" style={{ marginTop: 4 }}>
            <span>バッグ</span>
            <button className="icon-btn" aria-label="バッグを追加" onClick={() => open({ type: "bagEdit", bagId: null })}>
              <Plus size={22} />
            </button>
          </div>
          {state.bags.length > 0 && (
            <div className="group">
              {state.bags.map((b) => (
                <button key={b.id} className="row" onClick={() => open({ type: "bag", bagId: b.id })}>
                  <span className="avatar" style={{ background: "transparent" }}>
                    <span className="dot" style={{ background: bagColor(b), width: 14, height: 14, margin: 0 }} />
                  </span>
                  <span className="main-text">{b.name}</span>
                  <span className="value num">{b.itemIds.length}</span>
                  <ChevronRight size={18} className="chev" />
                </button>
              ))}
            </div>
          )}
          <div className="section">
            <span>持ち物</span>
            <button className="icon-btn" aria-label="持ち物を追加" onClick={() => open({ type: "item", itemId: null })}>
              <Plus size={22} />
            </button>
          </div>
          {state.items.length > 0 && (
            <div className="group">
              {state.items.map((i) => (
                <button key={i.id} className="row" onClick={() => open({ type: "item", itemId: i.id })}>
                  <Avatar item={i} photos={photos} />
                  <span className="main-text">{i.name}</span>
                  <span className="value">{placeName(state, i.at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
