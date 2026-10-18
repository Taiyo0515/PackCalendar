import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Check } from "lucide-react";
import { addDays, addMonths, dayKey, monthGrid, WEEKDAYS, weekday } from "../core/date";
import { occurrences, endOf, visibleOccurrences } from "../core/calendar";
import { holidayName } from "../core/holidays";
import { bagOf, linesOf, nextUnit } from "../core/prep";
import { forecast } from "../core/schedule";
import { whenLabel } from "../core/schedule";
import { CALENDARS, CALENDAR_NAMES, showsCalendar } from "../core/model";
import type { CalendarId, Occurrence } from "../core/model";
import { useApp } from "./App";
import { bagColor } from "./kit";
import { DayList, DayTitle } from "./DaySheet";

export function CalendarScreen() {
  const { state, now, wide, open } = useApp();
  const todayKey = dayKey(now);
  const [month, setMonth] = useState(todayKey.slice(0, 7));
  const [selected, setSelected] = useState(todayKey);
  /** Direction of the last month change: 1 forward, -1 back, 0 none. */
  const [dir, setDir] = useState(0);
  const shift = (n: number) => {
    setDir(n > 0 ? 1 : -1);
    setMonth((m) => addMonths(m, n));
  };
  const backToday = () => {
    const nowMonth = todayKey.slice(0, 7);
    if (month !== nowMonth) setDir(nowMonth > month ? 1 : -1);
    setMonth(nowMonth);
    setSelected(todayKey);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector(".shade")) return;
      if ((e.target as HTMLElement).closest("input,textarea")) return;
      if (e.key === "ArrowLeft") shift(-1);
      if (e.key === "ArrowRight") shift(1);
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const unit = nextUnit(state, now);
  return (
    <div className="cal-wrap">
      <div className="cal">
        <header className="head cal-head">
          <h1 className="title num">
            {Number(month.slice(0, 4))}年{Number(month.slice(5))}月
          </h1>
          {month !== todayKey.slice(0, 7) && (
            <button className="text-btn" onClick={backToday}>
              今日
            </button>
          )}
          <button className="icon-btn" aria-label="前の月" onClick={() => shift(-1)}>
            <ChevronLeft size={24} />
          </button>
          <button className="icon-btn" aria-label="次の月" onClick={() => shift(1)}>
            <ChevronRight size={24} />
          </button>
        </header>
        {unit && <PrepCard unitKey={unit.key} />}
        <CalendarFilter />
        <Month
          month={month}
          dir={dir}
          selected={selected}
          onShift={shift}
          onPick={(day) => {
            setSelected(day);
            if (day.slice(0, 7) !== month) {
              setDir(day.slice(0, 7) > month ? 1 : -1);
              setMonth(day.slice(0, 7));
            }
            if (!wide) open({ type: "day", day });
          }}
        />
        <button
          className="fab"
          aria-label="予定を追加"
          onClick={() => open({ type: "edit", key: null, day: selected })}
        >
          <Plus size={28} />
        </button>
      </div>
      {wide && (
        <aside className="side" aria-label="選択した日">
          <div className="sheet-head">
            <DayTitle day={selected} />
            <button className="round-btn" aria-label="この日に予定を追加" onClick={() => open({ type: "edit", key: null, day: selected })}>
              <Plus size={20} />
            </button>
          </div>
          <div className="sheet-body">
            <DayList day={selected} />
          </div>
        </aside>
      )}
    </div>
  );
}

/** TimeTree-style calendar list: tap a name to show or hide its events. */
function CalendarFilter() {
  const { state, commit } = useApp();
  return (
    <div className="cal-filter" role="group" aria-label="表示するカレンダー">
      {CALENDARS.map((id) => (
        <button
          key={id}
          className="chip"
          aria-pressed={showsCalendar(state, id)}
          onClick={() =>
            commit((s) => {
              s.settings.hidden = showsCalendar(s, id)
                ? [...s.settings.hidden, id]
                : s.settings.hidden.filter((x) => x !== id);
            })
          }
        >
          {CALENDAR_NAMES[id]}
        </button>
      ))}
    </div>
  );
}

function PrepCard({ unitKey }: { unitKey: string }) {
  const { state, now, open } = useApp();
  const unit = nextUnit(state, now);
  if (!unit || unit.key !== unitKey) return null;
  const bag = bagOf(state, unit.bagId)!;
  // Predicted lines: a take-home item still recorded in the bag while today's use is on counts as back home by tomorrow.
  const lines = forecast(state, now, 3).find((f) => f.unit.key === unit.key)?.lines ?? linesOf(state, unit);
  const shown = lines.length > 4 ? [...lines.slice(0, 3)] : lines;
  const rest = lines.slice(3).reduce((n, l) => n + l.names.length, 0);
  const when = whenLabel(unit.start, now);
  return (
    <button
      className={`prep${lines.length ? "" : " ready"}`}
      onClick={() => open({ type: "bag", bagId: bag.id, unitKey: unit.key })}
      aria-label={`${when} ${unit.title} の準備`}
    >
      <div className="prep-top">
        {!lines.length && <Check size={18} className="check" />}
        <span className="what num">
          {when} {unit.title}
        </span>
        <span className="bag" style={{ color: bagColor(bag) }}>
          {bag.name}
        </span>
      </div>
      {shown.map((l) => (
        <div className="prep-line" key={l.label}>
          <span className="from">{l.label}</span>
          <span className="names">{l.names.join("・")}</span>
        </div>
      ))}
      {lines.length > 4 && (
        <div className="prep-line">
          <span className="from" />
          <span className="names">ほか{rest}点</span>
        </div>
      )}
    </button>
  );
}

function Month(
  props: {
    month: string;
    dir: number;
    selected: string;
    onPick: (d: string) => void;
    onShift: (n: number) => void;
  },
) {
  const { state, now } = useApp();
  const ws = state.settings.weekStart;
  const days = monthGrid(props.month, ws);
  const todayKey = dayKey(now);
  const ref = useRef<HTMLDivElement>(null);
  const [cap, setCap] = useState(2);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const row = el.clientHeight / 6;
      const bar = parseFloat(getComputedStyle(el).getPropertyValue("--bar-h")) || 16;
      setCap(Math.max(1, Math.floor((row - 26) / (bar + 2))));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<string, Occurrence[]>();
    const list = visibleOccurrences(state, occurrences(state, days[0], addDays(days[41], 1)));
    for (const o of list) {
      const last = endOf(o);
      for (let d = o.start.slice(0, 10); `${d}T00:00` < last && d <= days[41]; d = addDays(d, 1)) {
        if (d < days[0]) continue;
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(o);
      }
    }
    return map;
  }, [state, days[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const touch = useRef<{ x: number; y: number } | null>(null);
  const head = Array.from({ length: 7 }, (_, i) => (i + ws) % 7);
  return (
    <>
      <div className="weekdays" aria-hidden="true">
        {head.map((d) => (
          <span key={d} className={d === 0 ? "sun" : d === 6 ? "sat" : ""}>
            {WEEKDAYS[d]}
          </span>
        ))}
      </div>
      <div
        className="month"
        ref={ref}
        onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
        onTouchEnd={(e) => {
          const t = touch.current;
          touch.current = null;
          if (!t) return;
          const dx = e.changedTouches[0].clientX - t.x,
            dy = e.changedTouches[0].clientY - t.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) props.onShift(dx < 0 ? 1 : -1);
        }}
      >
        {/* The inner grid is keyed on the month so a change replays the slide-in animation. */}
        <div key={props.month} className={`month-grid${dirClass(props.dir)}`}>
          {[0, 1, 2, 3, 4, 5].map((w) => (
          <div className="week" key={w}>
            {days.slice(w * 7, w * 7 + 7).map((day) => {
              const holiday = state.settings.holidays ? holidayName(day) : null;
              const list = byDay.get(day) ?? [];
              const bars: { text: string; color: string; key: string }[] = [];
              if (holiday) bars.push({ text: holiday, color: "var(--holiday)", key: "h" });
              for (const o of list) bars.push({ text: o.title, color: bagColor(bagOf(state, o.plan.bagId)), key: o.key });
              const over = bars.length > cap;
              // With room for only one bar there is no space for the "+N" line, so show one name.
              const visible = over ? bars.slice(0, Math.max(1, cap - 1)) : bars;
              const more = bars.length - visible.length;
              const wd = weekday(day);
              const cls = [
                "day",
                day.slice(0, 7) !== props.month && "other",
                day === todayKey && "today",
                day === props.selected && "sel",
                holiday || wd === 0 ? "sun" : wd === 6 ? "sat" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={day}
                  className={cls}
                  onClick={() => props.onPick(day)}
                  aria-label={`${Number(day.slice(5, 7))}月${Number(day.slice(8))}日 ${bars.map((b) => b.text).join("、")}`}
                >
                  <span className="n num">{Number(day.slice(8))}</span>
                  {visible.map((b) => (
                    <span className="bar" key={b.key} style={{ background: b.color }}>
                      {b.text}
                    </span>
                  ))}
                  {over && cap > 1 && <span className="bar more">+{more}</span>}
                </button>
              );
            })}
          </div>
        ))}
        </div>
      </div>
    </>
  );
}

/** Animation class for the month grid, based on the direction of the change. */
const dirClass = (dir: number) => (dir > 0 ? " next" : dir < 0 ? " prev" : "");
