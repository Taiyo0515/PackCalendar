import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Clock3,
} from "lucide-react";
import * as C from "../core/domain";
import type { State, Occurrence } from "../core/model";
import type { Commit } from "./types";
import { BagBadge, dayLabel, weekdays, Modal } from "./shared";
export function Home({
  state,
  commit,
  onEvent,
  onNew,
  onContents,
}: {
  state: State;
  commit: Commit;
  onEvent: (e: Occurrence) => void;
  onNew: (day: string) => void;
  onContents: (bagId: string, event?: Occurrence) => void;
}) {
  const today = C.dateKey(new Date()),
    [selected, setSelected] = useState(today),
    [month, setMonth] = useState(today.slice(0, 7));
  const [quick, setQuick] = useState(false),
    measured = useRef("");
  const now = new Date(),
    units = C.groupUnits(state, C.upcoming(state, now, 100)),
    unit = units[0];
  const lines = unit ? C.groupedLines(state, unit) : [],
    count = lines.reduce((n, l) => n + l.names.length, 0);
  useEffect(() => {
    if (!unit) return;
    const key = `${unit.event.key}:${count}`;
    if (measured.current === key) return;
    measured.current = key;
    void commit((s) => C.recordDisplay(s, unit), "", { background: true });
  }, [unit?.event.key, count, commit]);
  const first = `${month}-01`,
    offset = (C.dateAt(first).getDay() - state.settings.weekStart + 7) % 7;
  const monthEnd = C.dateAt(first);
  monthEnd.setMonth(monthEnd.getMonth() + 1, 0);
  const daysInGrid = Math.ceil((offset + monthEnd.getDate()) / 7) * 7;
  const gridStart = C.addDays(first, -offset),
    dates = Array.from({ length: daysInGrid }, (_, i) =>
      C.addDays(gridStart, i),
    );
  const events = useMemo(
    () =>
      C.occurrencesBetween(state, gridStart, C.addDays(gridStart, daysInGrid)),
    [state, gridStart, daysInGrid],
  );
  const dayEvents = C.occurrencesBetween(
    state,
    selected,
    C.addDays(selected, 1),
  );
  const eventsOn = (day: string) =>
    events.filter(
      (e) =>
        e.startAt < `${C.addDays(day, 1)}T00:00` && C.endOf(e) > `${day}T00:00`,
    );
  const shift = (delta: number) => {
    const d = C.dateAt(first);
    d.setMonth(d.getMonth() + delta);
    setMonth(C.dateKey(d).slice(0, 7));
  };
  return (
    <>
      <div className="page-title">
        <div>
          <h1>ホーム</h1>
          <p>{dayLabel(today)}</p>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={() => setQuick(true)}>
            今から準備
          </button>
          <button
            className="button primary desktop-add"
            onClick={() => onNew(selected)}
          >
            <Plus size={19} />
            予定を追加
          </button>
        </div>
      </div>
      <div className="home-layout">
        <div className="home-main">
          <section
            className={`prep-card ${count === 0 ? "compact" : ""}`}
            aria-label="次の準備"
          >
            {!unit ? (
              <p className="all-ready">
                <Check size={20} />
                48時間以内に必要な準備はありません
              </p>
            ) : (
              <>
                {count > 0 && (
                  <div className="prep-heading">
                    <div>
                      <span className="section-label">次の準備</span>
                      <button
                        className="plain event-link"
                        onClick={() => onEvent(unit.event)}
                      >
                        {dayLabel(unit.event.startAt)}{" "}
                        {unit.event.allDay
                          ? "終日"
                          : unit.event.startAt.slice(11)}{" "}
                        · {unit.event.title}
                      </button>
                    </div>
                    <BagBadge bag={C.bagById(state, unit.event.plan.bagId)} />
                  </div>
                )}
                {count === 0 ? (
                  <button
                    className="all-ready ready-line plain"
                    onClick={() =>
                      onContents(
                        unit.event.plan.bagId!,
                        C.unitEvent(state, unit),
                      )
                    }
                  >
                    <Check size={18} />
                    <span>
                      {dayLabel(unit.event.startAt)} {unit.event.title} ·{" "}
                      {C.bagById(state, unit.event.plan.bagId)?.name}：準備なし
                    </span>
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <>
                    <div className="prep-lines">
                      {lines.slice(0, 3).map((line) => (
                        <div className="prep-line" key={line.label}>
                          <span>{line.label}</span>
                          <strong>{line.names.join("・")}</strong>
                          <button
                            className="check-button"
                            aria-label={`${line.names.join("・")}を準備済みにする`}
                            title="早めに準備済みとして記録"
                            onClick={() =>
                              void commit(
                                (s) => {
                                  if (line.itemIds.length)
                                    C.moveItems(
                                      s,
                                      line.itemIds,
                                      unit.event.plan.bagId,
                                      { source: "prep", event: unit.event },
                                    );
                                  else
                                    s.processed.push(
                                      ...unit.events.map(
                                        (e) => `temporary:${e.key}`,
                                      ),
                                    );
                                },
                                "準備済みとして記録しました",
                                { undo: true },
                              )
                            }
                          >
                            <Check size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="prep-foot">
                      <span>
                        {lines.length > 3
                          ? `ほか${lines.slice(3).reduce((n, l) => n + l.names.length, 0)}点 · `
                          : ""}
                        {state.settings.autoComplete
                          ? `${unit.event.startAt.slice(11)}に自動で準備済みとして記録`
                          : "準備できたらチェックで記録"}
                      </span>
                      <button
                        className="text-button"
                        onClick={() =>
                          onContents(
                            unit.event.plan.bagId!,
                            C.unitEvent(state, unit),
                          )
                        }
                      >
                        詳細
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                )}
                {units[1] && count > 0 && (
                  <p className="next-note">
                    このあと：{units[1].event.startAt.slice(11)}{" "}
                    {C.bagById(state, units[1].event.plan.bagId)?.name}
                  </p>
                )}
              </>
            )}
          </section>
          <section className="calendar panel" aria-label="月間カレンダー">
            <div className="calendar-toolbar">
              <h2>
                {Number(month.slice(0, 4))}年{" "}
                <strong>{Number(month.slice(5))}月</strong>
              </h2>
              <div className="button-row">
                <button
                  className="button small secondary"
                  onClick={() => {
                    setMonth(today.slice(0, 7));
                    setSelected(today);
                  }}
                >
                  今日
                </button>
                <label className="month-picker">
                  <CalendarDays size={18} />
                  <span className="sr-only">表示する月</span>
                  <input
                    type="month"
                    value={month}
                    onChange={(e) => {
                      if (e.target.value) setMonth(e.target.value);
                    }}
                  />
                </label>
                <button
                  className="icon-button"
                  aria-label="前の月"
                  onClick={() => shift(-1)}
                >
                  <ChevronLeft />
                </button>
                <button
                  className="icon-button"
                  aria-label="次の月"
                  onClick={() => shift(1)}
                >
                  <ChevronRight />
                </button>
              </div>
            </div>
            <div className="calendar-weekdays" aria-hidden="true">
              {Array.from(
                { length: 7 },
                (_, i) => (state.settings.weekStart + i) % 7,
              ).map((day) => (
                <span
                  className={day === 0 ? "sunday" : day === 6 ? "saturday" : ""}
                  key={day}
                >
                  {weekdays[day]}
                </span>
              ))}
            </div>
            <div className="calendar-grid">
              {dates.map((day) => {
                const list = eventsOn(day);
                return (
                  <button
                    key={day}
                    className={`calendar-day ${day.slice(0, 7) !== month ? "outside-month" : ""} ${day === selected ? "selected" : ""} ${day === today ? "today" : ""}`}
                    onClick={() => setSelected(day)}
                    aria-pressed={day === selected}
                    aria-label={`${dayLabel(day)}、予定${list.length}件`}
                  >
                    <span className="day-number">{Number(day.slice(8))}</span>
                    <span className="day-markers">
                      {list.slice(0, 3).map((e) => (
                        <span
                          className={`calendar-event color-${C.bagById(state, e.plan.bagId)?.color ?? "none"}`}
                          key={e.key}
                        >
                          <span className="bag-dot" />
                          <span className="calendar-event-title">
                            {e.title}
                          </span>
                        </span>
                      ))}
                      {list.length > 3 && (
                        <span className="event-more">+{list.length - 3}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
        <aside className="agenda panel" aria-label="選んだ日の予定">
          <header>
            <div>
              <span className="section-label">選んだ日</span>
              <h2>{dayLabel(selected)}</h2>
            </div>
            <button
              className="icon-button"
              aria-label="この日に予定を追加"
              onClick={() => onNew(selected)}
            >
              <Plus />
            </button>
          </header>
          {dayEvents.length === 0 ? (
            <div className="empty-state">
              <CalendarDays size={32} />
              <p>予定はありません</p>
              <button className="text-button" onClick={() => onNew(selected)}>
                予定を追加
                <Plus size={16} />
              </button>
            </div>
          ) : (
            <div className="agenda-list">
              {dayEvents.map((e) => (
                <button
                  className="agenda-event"
                  key={e.key}
                  onClick={() => onEvent(e)}
                >
                  <span className="event-time">
                    <Clock3 size={15} />
                    {e.allDay
                      ? "終日"
                      : `${e.startAt.slice(11)}${e.endAt ? ` — ${e.endAt.slice(11)}` : ""}`}
                  </span>
                  <strong>{e.title}</strong>
                  <BagBadge bag={C.bagById(state, e.plan.bagId)} />
                  {e.isRule && <small>曜日ルール</small>}
                  {e.recurrence !== "none" && (
                    <small>
                      {e.isOverride ? "この回は変更あり" : "繰り返し"}
                    </small>
                  )}
                </button>
              ))}
            </div>
          )}
          <div className="agenda-footer">
            予定を選ぶと、準備と持ち物を確認できます。
          </div>
        </aside>
      </div>
      <button
        className="fab"
        aria-label="予定を追加"
        onClick={() => onNew(selected)}
      >
        <Plus size={26} />
        <span>予定</span>
      </button>
      {quick && (
        <Modal title="今から使うバッグ" onClose={() => setQuick(false)}>
          <div className="form-body quick-bag-list">
            <p>予定の登録なしで、今の位置との差分を確認します。</p>
            {C.bags(state).map((b) => (
              <button
                className={`button secondary color-${b.color}`}
                key={b.id}
                onClick={() => {
                  setQuick(false);
                  onContents(b.id, C.quickPreparation(state, b.id));
                }}
              >
                {b.name}
                <ArrowRight size={18} />
              </button>
            ))}
            {!C.bags(state).length && (
              <p>持ち物タブからバッグを登録してください。</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
