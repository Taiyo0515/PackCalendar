import { ArrowLeft, Backpack, ChevronRight, Package, Repeat, StickyNote } from "lucide-react";
import { addDays, hm, jaDate } from "../core/date";
import { findOccurrence, repeatLabel } from "../core/calendar";
import { bagOf, neededIds } from "../core/prep";
import { useApp } from "./App";
import { Sheet, bagColor } from "./kit";

export function EventView({ occKey }: { occKey: string }) {
  const { state, open, close } = useApp();
  const o = findOccurrence(state, occKey);
  if (!o) {
    return (
      <Sheet onClose={() => close()} full label="予定">
        <div className="sheet-head">
          <button className="icon-btn" aria-label="戻る" onClick={() => close()}>
            <ArrowLeft size={24} />
          </button>
        </div>
      </Sheet>
    );
  }
  const bag = bagOf(state, o.plan.bagId);
  const names = [
    ...neededIds(state, o.plan).map((id) => state.items.find((i) => i.id === id)!.name),
    ...o.plan.extra,
  ];
  const repeat = repeatLabel(o);
  const lastDay = o.allDay && o.end ? addDays(o.end, -1) : o.end?.slice(0, 10);
  return (
    <Sheet onClose={() => close()} full label="予定">
      <div className="sheet-head">
        <button className="icon-btn" aria-label="戻る" onClick={() => close()} autoFocus>
          <ArrowLeft size={24} />
        </button>
        <span style={{ flex: 1 }} />
        <button className="text-btn" onClick={() => open({ type: "edit", key: o.key, day: o.date })}>
          編集
        </button>
      </div>
      <div className="sheet-body">
        <h2 className="detail-title">{o.title}</h2>
        <div className="span num">
          <div>
            <small>{jaDate(o.start, true)}</small>
            {!o.allDay && <strong>{hm(o.start)}</strong>}
          </div>
          {(o.end && !o.allDay) || (o.allDay && lastDay && lastDay !== o.start.slice(0, 10)) ? (
            <>
              <ChevronRight className="arrow" size={28} />
              <div>
                <small>{jaDate(o.allDay ? lastDay! : o.end!, true)}</small>
                {!o.allDay && <strong style={{ fontWeight: 400 }}>{hm(o.end!)}</strong>}
              </div>
            </>
          ) : (
            <span />
          )}
        </div>
        {bag && (
          <div className="line-row">
            <Backpack size={22} />
            <span style={{ color: bagColor(bag), fontWeight: 700 }}>{bag.name}</span>
          </div>
        )}
        {names.length > 0 && (
          <div className="line-row">
            <Package size={22} />
            <span>{names.join("・")}</span>
          </div>
        )}
        {repeat && (
          <div className="line-row">
            <Repeat size={22} />
            <span>{repeat}</span>
          </div>
        )}
        {o.memo && (
          <div className="line-row">
            <StickyNote size={22} />
            <span className="memo">{o.memo}</span>
          </div>
        )}
      </div>
    </Sheet>
  );
}
