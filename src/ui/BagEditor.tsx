import { useState } from "react";
import { X, Check } from "lucide-react";
import { BAG_COLORS, newId } from "../core/model";
import type { BagColor } from "../core/model";
import { removeBag } from "../core/prep";
import { useApp } from "./App";
import { Sheet } from "./kit";

export function BagEditor({ bagId }: { bagId: string | null }) {
  const { state, commit, close } = useApp();
  const bag = bagId ? state.bags.find((b) => b.id === bagId) ?? null : null;
  const unused = (Object.keys(BAG_COLORS) as BagColor[]).find((c) => !state.bags.some((b) => b.color === c));
  const [name, setName] = useState(bag?.name ?? "");
  const [color, setColor] = useState<BagColor>(bag?.color ?? unused ?? "green");

  const save = () => {
    const n = name.trim();
    if (!n) return;
    const ok = commit((s) => {
      const b = s.bags.find((x) => x.id === bagId);
      if (b) Object.assign(b, { name: n, color });
      else s.bags.push({ id: newId(), name: n, color, itemIds: [] });
    });
    if (ok) close();
  };

  return (
    <Sheet onClose={() => close()} label={bag ? "バッグを編集" : "バッグを追加"}>
      <div className="sheet-head">
        <button className="icon-btn" aria-label="閉じる" onClick={() => close()}>
          <X size={26} />
        </button>
        <span style={{ flex: 1 }} />
        <button className="save-btn" disabled={!name.trim()} onClick={save}>
          保存
        </button>
      </div>
      <div className="sheet-body">
        <input
          className="name-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="名前"
          aria-label="名前"
          maxLength={200}
          autoFocus={!bag}
          enterKeyHint="done"
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <div className="section">色</div>
        <div className="swatches" role="radiogroup" aria-label="色">
          {(Object.entries(BAG_COLORS) as [BagColor, string][]).map(([c, hex]) => (
            <button
              key={c}
              className="swatch"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              style={{ background: hex }}
              onClick={() => setColor(c)}
            >
              {color === c && <Check size={20} strokeWidth={3} />}
            </button>
          ))}
        </div>
        {bag && (
          <div className="group" style={{ marginTop: 32 }}>
            <button
              className="row danger"
              onClick={() => {
                if (commit((s) => removeBag(s, bag.id), { toast: `${bag.name}を削除しました`, undo: true })) close(2);
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
