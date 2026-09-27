import { Plus } from "lucide-react";
import { hm, toDate, WEEKDAYS } from "../core/date";
import { onDay } from "../core/calendar";
import { holidayName } from "../core/holidays";
import { bagOf } from "../core/prep";
import type { Occurrence } from "../core/model";
import { useApp } from "./App";
import { Sheet, bagColor } from "./kit";

export function DayTitle({ day }: { day: string }) {
  const { state } = useApp();
  const d = toDate(day);
  const holiday = state.settings.holidays ? holidayName(day) : null;
  return (
    <h2 className="num">
      {d.getMonth() + 1}月{d.getDate()}日 {WEEKDAYS[d.getDay()]}曜日
      {holiday && <span className="holiday-name">{holiday}</span>}
    </h2>
  );
}

function times(o: Occurrence, day: string) {
  if (o.allDay) return ["終日", ""];
  const startsToday = o.start.slice(0, 10) === day;
  const endsToday = o.end ? o.end.slice(0, 10) === day : true;
  return [startsToday ? hm(o.start) : "", o.end && endsToday ? hm(o.end) : ""];
}

export function DayList({ day }: { day: string }) {
  const { state, open } = useApp();
  return (
    <>
      {onDay(state, day).map((o) => {
        const bag = bagOf(state, o.plan.bagId);
        const [a, b] = times(o, day);
        return (
          <button key={o.key} className="ev" onClick={() => open({ type: "event", key: o.key })}>
            <span className="time num">
              {a || "…"}
              {b && <small>{b}</small>}
            </span>
            <span className="stripe" style={{ background: bagColor(bag) }} />
            <span className="what">
              <strong>{o.title}</strong>
              {bag && <small>{bag.name}</small>}
            </span>
          </button>
        );
      })}
    </>
  );
}

export function DaySheet({ day }: { day: string }) {
  const { open, close } = useApp();
  return (
    <Sheet onClose={() => close()} label="日の予定">
      <div className="sheet-head">
        <DayTitle day={day} />
        <button className="round-btn" aria-label="この日に予定を追加" onClick={() => open({ type: "edit", key: null, day })}>
          <Plus size={20} />
        </button>
      </div>
      <div className="sheet-body" style={{ minHeight: "30dvh" }}>
        <DayList day={day} />
      </div>
    </Sheet>
  );
}
