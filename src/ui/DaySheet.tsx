import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { addDays, hm, toDate, WEEKDAYS } from "../core/date";
import { visibleOnDay } from "../core/calendar";
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
      {visibleOnDay(state, day).map((o) => {
        const bag = bagOf(state, o.plan.bagId);
        const [a, b] = times(o, day);
        return (
          <button
            key={o.key}
            className="ev"
            onClick={(e) => {
              // A swipe that just ended on this row must not open the event.
              const sh = (e.currentTarget as HTMLElement).closest<HTMLElement>(".sheet");
              if (sh?.dataset.dragged) {
                delete sh.dataset.dragged;
                return;
              }
              open({ type: "event", key: o.key });
            }}
          >
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
  /** The day shown; it moves when the finger swipes across the panes. */
  const [d, setD] = useState(day);
  const ref = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  const strip = useRef({ mode: "idle" as "idle" | "drag", day });
  const touch = useRef<{ x: number; y: number; at: number; horizontal: boolean | null } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // A committed swipe already carried the strip to the neighbor pane; swap the content under it.
  useLayoutEffect(() => {
    const tr = trackRef.current;
    if (!tr || w === 0 || strip.current.day === d) return;
    strip.current.day = d;
    strip.current.mode = "idle";
    tr.style.transition = "none";
    tr.style.transform = `translateX(${-w}px)`;
  }, [d, w]);

  const start = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, at: Date.now(), horizontal: null };
  };
  const move = (e: React.TouchEvent) => {
    const g = touch.current;
    const tr = trackRef.current;
    if (!g || !tr || w === 0) return;
    const dx = e.touches[0].clientX - g.x,
      dy = e.touches[0].clientY - g.y;
    if (g.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      g.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!g.horizontal) return;
      strip.current.mode = "drag";
      tr.style.transition = "none";
      ref.current?.closest<HTMLElement>(".sheet")?.setAttribute("data-dragged", "1");
    }
    const dx2 = Math.max(-w, Math.min(w, dx));
    tr.style.transform = `translateX(${dx2 - w}px)`;
  };
  const end = (e: React.TouchEvent) => {
    const g = touch.current;
    touch.current = null;
    const tr = trackRef.current;
    if (!g?.horizontal || !tr || w === 0) return;
    const dx = e.changedTouches[0].clientX - g.x;
    const dt = Date.now() - g.at;
    const fling = dt < 240 && Math.abs(dx) > 45;
    const dir = dx <= -w * 0.3 || (fling && dx < 0) ? 1 : dx >= w * 0.3 || (fling && dx > 0) ? -1 : 0;
    tr.style.transition = "transform 0.22s ease-out";
    tr.style.transform = dir ? `translateX(${-w + dir * w}px)` : `translateX(${-w}px)`;
    const sheet = ref.current?.closest<HTMLElement>(".sheet");
    if (sheet) setTimeout(() => sheet.removeAttribute("data-dragged"), 150);
    if (dir) setTimeout(() => setD((x) => addDays(x, dir)), 230);
  };

  return (
    <Sheet onClose={() => close()} label="日の予定" expandable>
      <div className="sheet-head">
        <DayTitle day={d} />
        <button className="round-btn" aria-label="この日に予定を追加" onClick={() => open({ type: "edit", key: null, day: d })}>
          <Plus size={20} />
        </button>
      </div>
      {/* Three days side by side; swipe horizontally to walk through the days. */}
      <div className="day-pager" ref={ref} onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
        <div className="day-track" ref={trackRef} style={w ? { transform: `translateX(${-w}px)` } : undefined}>
          {[addDays(d, -1), d, addDays(d, 1)].map((day) => (
            <div className="day-pane" key={day}>
              <DayList day={day} />
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
