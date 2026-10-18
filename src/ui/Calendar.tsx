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
  const todayKey = dayKey(now);
  const ref = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  /** The month the three panes are built from; it lags behind props.month during a slide. */
  const [shown, setShown] = useState(props.month);
  const [cap, setCap] = useState(2);
  const [w, setW] = useState(0);
  /** What the strip is doing: idle, following the finger, or animating to a commit. */
  const strip = useRef({ mode: "idle" as "idle" | "drag", month: props.month });
  const lastDrag = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const row = el.clientHeight / 6;
      const bar = parseFloat(getComputedStyle(el).getPropertyValue("--bar-h")) || 16;
      setCap(Math.max(1, Math.floor((row - 26) / (bar + 2))));
      setW(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One shared map per pane: day key -> occurrences that reach into it.
  const panes = useMemo(() => {
    return [addMonths(shown, -1), shown, addMonths(shown, 1)].map((m) => {
      const days = monthGrid(m, ws);
      const byDay = new Map<string, Occurrence[]>();
      const list = visibleOccurrences(state, occurrences(state, days[0], addDays(days[41], 1)));
      for (const o of list) {
        const last = endOf(o);
        for (let d = o.start.slice(0, 10); `${d}T00:00` < last && d <= days[41]; d = addDays(d, 1)) {
          if (d < days[0]) continue;
          if (!byDay.has(d)) byDay.set(d, []);
          byDay.get(d)!.push(o);
        }
      }
      return { days, byDay };
    });
  }, [state, shown, ws]); // eslint-disable-line react-hooks/exhaustive-deps

  // props.month moved: either the finger already carried the strip to the neighbor pane
  // (then just swap the content under it), or play a one-pane slide from the strip's center.
  useLayoutEffect(() => {
    const tr = trackRef.current;
    if (!tr || w === 0 || strip.current.month === props.month) return;
    strip.current.month = props.month;
    if (strip.current.mode === "drag") {
      strip.current.mode = "idle";
      setShown(props.month);
      tr.style.transition = "none";
      tr.style.transform = `translateX(${-w}px)`;
      return;
    }
    const d = props.dir || 1;
    tr.style.transition = "transform 0.26s ease-out";
    tr.style.transform = `translateX(${-w * (1 + d)}px)`;
    const t = setTimeout(() => {
      tr.style.transition = "none";
      tr.style.transform = `translateX(${-w}px)`;
      setShown(props.month);
    }, 280);
    return () => clearTimeout(t);
  }, [props.month, props.dir, w]);

  const touch = useRef<{ x: number; y: number; at: number; horizontal: boolean | null } | null>(null);
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
      // Only a clearly sideways finger takes over; up and down keeps scrolling.
      g.horizontal = Math.abs(dx) > Math.abs(dy);
      if (!g.horizontal) return;
      strip.current.mode = "drag";
      tr.style.transition = "none";
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
    lastDrag.current = Date.now();
    // Decide like the system calendar: far enough or a quick fling moves a month.
    const fling = dt < 240 && Math.abs(dx) > 45;
    const d = dx <= -w * 0.3 || (fling && dx < 0) ? 1 : dx >= w * 0.3 || (fling && dx > 0) ? -1 : 0;
    tr.style.transition = "transform 0.22s ease-out";
    tr.style.transform = d ? `translateX(${-w + d * w}px)` : `translateX(${-w}px)`;
    if (d) setTimeout(() => props.onShift(d), 230);
    else strip.current.mode = "idle";
  };

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
      <div className="month" ref={ref} onTouchStart={start} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
        {/* Three months side by side; the strip follows the finger and snaps to one pane. */}
        <div className="month-track" ref={trackRef} style={w ? { transform: `translateX(${-w}px)` } : undefined}>
          {panes.map((pane, i) => (
            /* Neighbor panes are copy slides for the drag; only the center one is active. */
            <div className="month-pane" key={i} aria-hidden={i !== 1 || undefined} inert={i !== 1 ? true : undefined}>
              <Grid
                days={pane.days}
                month={shown}
                selected={props.selected}
                cap={cap}
                byDay={pane.byDay}
                onPick={(day) => {
                  if (Date.now() - lastDrag.current < 300) return; // the drag just ended, not a tap
                  props.onPick(day);
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Grid(props: {
  days: string[];
  month: string;
  selected: string;
  cap: number;
  byDay: Map<string, Occurrence[]>;
  onPick: (day: string) => void;
}) {
  const { state, now } = useApp();
  const todayKey = dayKey(now);
  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((wk) => (
        <div className="week" key={wk}>
          {props.days.slice(wk * 7, wk * 7 + 7).map((day) => {
            const holiday = state.settings.holidays ? holidayName(day) : null;
            const list = props.byDay.get(day) ?? [];
            const bars: { text: string; color: string; key: string }[] = [];
            if (holiday) bars.push({ text: holiday, color: "var(--holiday)", key: "h" });
            for (const o of list) bars.push({ text: o.title, color: bagColor(bagOf(state, o.plan.bagId)), key: o.key });
            const over = bars.length > props.cap;
            // With room for only one bar there is no space for the "+N" line, so show one name.
            const visible = over ? bars.slice(0, Math.max(1, props.cap - 1)) : bars;
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
                {over && props.cap > 1 && <span className="bar more">+{more}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </>
  );
}
