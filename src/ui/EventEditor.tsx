import { useMemo, useRef, useState } from "react";
import { X, Clock, Backpack, Plus, Repeat, Package, StickyNote } from "lucide-react";
import { addDays, addMinutes, minutesBetween, weekday, WEEKDAYS } from "../core/date";
import { deleteEvent, findOccurrence, lastWithTitle, saveEvent, saveOne } from "../core/calendar";
import type { EventDraft } from "../core/calendar";
import { emptyPlan, newId } from "../core/model";
import type { Repeat as RepeatT } from "../core/model";
import { useApp } from "./App";
import { BagChip, Segment, Sheet, Switch } from "./kit";

type Freq = "none" | RepeatT["freq"];

export function EventEditor({ occKey, day }: { occKey: string | null; day: string }) {
  const { state, commit, close, say } = useApp();
  const original = useMemo(() => (occKey ? findOccurrence(state, occKey) : null), []); // eslint-disable-line react-hooks/exhaustive-deps
  const base = original ? state.events.find((e) => e.id === original.baseId)! : null;
  const init = original ?? {
    title: "",
    start: `${day}T09:00`,
    end: `${day}T10:00`,
    allDay: false,
    memo: "",
    plan: emptyPlan(),
    repeat: null,
  };
  const [title, setTitle] = useState(init.title);
  const [allDay, setAllDay] = useState(init.allDay);
  const [start, setStart] = useState(init.start);
  const [end, setEnd] = useState(init.end ?? addMinutes(init.start, 60));
  const [lastDay, setLastDay] = useState(init.allDay && init.end ? addDays(init.end, -1) : init.start.slice(0, 10));
  const [plan, setPlan] = useState(init.plan);
  const [memo, setMemo] = useState(init.memo);
  const [freq, setFreq] = useState<Freq>(base?.repeat?.freq ?? "none");
  const [weekdays, setWeekdays] = useState<number[]>(base?.repeat?.weekdays.length ? base.repeat.weekdays : [weekday(init.start)]);
  const [until, setUntil] = useState(base?.repeat?.until ?? "");
  const [openRepeat, setOpenRepeat] = useState(!!base?.repeat);
  const [openItems, setOpenItems] = useState(!!(init.plan.add.length || init.plan.remove.length || init.plan.extra.length));
  const [openMemo, setOpenMemo] = useState(!!init.memo);
  const [picking, setPicking] = useState(false);
  const [ask, setAsk] = useState<null | "save" | "delete">(null);
  const touched = useRef({ bag: false, time: false });
  const extraRef = useRef<HTMLInputElement>(null);

  const bag = state.bags.find((b) => b.id === plan.bagId) ?? null;
  const repeating = !!base?.repeat;

  const draft = (): EventDraft | null => {
    const t = title.trim();
    if (!t) return null;
    const repeat: RepeatT | null =
      freq === "none" ? null : { freq, weekdays: freq === "weekly" ? [...weekdays].sort() : [], until: until || null };
    const s = allDay ? `${start.slice(0, 10)}T00:00` : start;
    const e = allDay ? `${addDays(lastDay < s.slice(0, 10) ? s.slice(0, 10) : lastDay, 1)}T00:00` : end;
    return { title: t, start: s, end: e, allDay, memo: memo.trim(), plan, repeat };
  };

  const setStartKeep = (next: string) => {
    touched.current.time = true;
    const length = Math.max(0, minutesBetween(start, end));
    setStart(next);
    setEnd(addMinutes(next, length || 60));
    if (lastDay < next.slice(0, 10)) setLastDay(next.slice(0, 10));
  };

  const onTitle = (value: string) => {
    setTitle(value);
    if (original) return;
    const last = lastWithTitle(state, value);
    if (!last) return;
    if (!touched.current.bag && last.plan.bagId && state.bags.some((b) => b.id === last.plan.bagId))
      setPlan((p) => ({ ...p, bagId: last.plan.bagId }));
    if (!touched.current.time && !last.allDay) {
      const s = `${start.slice(0, 10)}${last.start.slice(10)}`;
      setStart(s);
      setEnd(addMinutes(s, last.end ? minutesBetween(last.start, last.end) : 60));
    }
  };

  const save = (scope: "one" | "all" | null) => {
    const d = draft();
    if (!d) return;
    if (!d.allDay && d.end && d.end <= d.start) {
      setAsk(null);
      return say("終了は開始より後にしてください");
    }
    const repeatChanged = JSON.stringify(d.repeat) !== JSON.stringify(base?.repeat ?? null);
    if (repeating && scope === null && !repeatChanged) return setAsk("save");
    const ok = commit((s) => {
      if (!original) saveEvent(s, newId(), d);
      else if (repeating && scope === "one") saveOne(s, original.key, { ...d, repeat: base!.repeat });
      else saveEvent(s, original.baseId, d);
    });
    if (ok) close();
  };

  const remove = (scope: "one" | "all" | null) => {
    if (!original) return;
    if (repeating && scope === null) return setAsk("delete");
    const ok = commit((s) => deleteEvent(s, original.key, scope ?? "all"), { toast: "予定を削除しました", undo: true });
    if (ok) close(2);
  };

  const needed = bag ? bag.itemIds : [];
  const others = state.items.filter((i) => !needed.includes(i.id) && !plan.add.includes(i.id));
  const itemName = (id: string) => state.items.find((i) => i.id === id)?.name ?? "";

  return (
    <>
    <Sheet onClose={() => close()} full label={original ? "予定を編集" : "予定を追加"}>
      <div className="sheet-head">
        <button className="icon-btn" aria-label="閉じる" onClick={() => close()}>
          <X size={26} />
        </button>
        <span style={{ flex: 1 }} />
        <button className="save-btn" disabled={!title.trim()} onClick={() => save(null)}>
          保存
        </button>
      </div>
      <div className="sheet-body">
        <div className="editor-title">
          <input
            className="field"
            value={title}
            onChange={(e) => onTitle(e.target.value)}
            placeholder="タイトル"
            aria-label="タイトル"
            maxLength={200}
            autoFocus={!original}
            enterKeyHint="done"
          />
        </div>

        <div className="eblock">
          <div className="erow">
            <Clock size={22} />
            <span className="label">終日</span>
            <Switch on={allDay} onChange={setAllDay} label="終日" />
          </div>
          <div className="erow">
            <span className="indent" />
            <span className="label">開始</span>
            <div className="datetime">
              <input
                type="date"
                className="pill num"
                aria-label="開始日"
                value={start.slice(0, 10)}
                onChange={(e) => e.target.value && setStartKeep(`${e.target.value}${start.slice(10)}`)}
              />
              {!allDay && (
                <input
                  type="time"
                  className="pill num"
                  aria-label="開始時刻"
                  value={start.slice(11)}
                  onChange={(e) => e.target.value && setStartKeep(`${start.slice(0, 10)}T${e.target.value}`)}
                />
              )}
            </div>
          </div>
          <div className="erow">
            <span className="indent" />
            <span className="label">終了</span>
            <div className="datetime">
              <input
                type="date"
                className="pill num"
                aria-label="終了日"
                value={allDay ? lastDay : end.slice(0, 10)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  touched.current.time = true;
                  if (allDay) setLastDay(e.target.value);
                  else setEnd(`${e.target.value}${end.slice(10)}`);
                }}
              />
              {!allDay && (
                <input
                  type="time"
                  className="pill num"
                  aria-label="終了時刻"
                  value={end.slice(11)}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    touched.current.time = true;
                    setEnd(`${end.slice(0, 10)}T${e.target.value}`);
                  }}
                />
              )}
            </div>
          </div>
        </div>

        <div className="eblock">
          <div className="erow" style={{ alignItems: state.bags.length ? "flex-start" : "center" }}>
            <Backpack size={22} style={{ marginTop: state.bags.length ? 6 : 0 }} />
            {state.bags.length ? (
              <div className="chips" role="group" aria-label="バッグ">
                {state.bags.map((b) => (
                  <BagChip
                    key={b.id}
                    bag={b}
                    on={plan.bagId === b.id}
                    onClick={() => {
                      touched.current.bag = true;
                      setPlan((p) => ({ ...p, bagId: p.bagId === b.id ? null : b.id }));
                    }}
                  />
                ))}
              </div>
            ) : (
              <span className="label" style={{ color: "var(--sub)" }}>
                バッグ未登録
              </span>
            )}
          </div>
        </div>

        {openRepeat && (
          <div className="eblock">
            <div className="erow">
              <Repeat size={22} />
              <Segment<Freq>
                label="繰り返し"
                value={freq}
                onChange={setFreq}
                options={[
                  ["none", "なし"],
                  ["daily", "毎日"],
                  ["weekly", "毎週"],
                  ["monthly", "毎月"],
                ]}
              />
            </div>
            {freq !== "none" && (
              <div className="eextra" style={{ paddingTop: 0 }}>
                {freq === "weekly" && (
                  <div className="weekday-picks" role="group" aria-label="曜日">
                    {[0, 1, 2, 3, 4, 5, 6].map((d) => (
                      <button
                        key={d}
                        className="chip"
                        aria-pressed={weekdays.includes(d)}
                        onClick={() =>
                          setWeekdays((w) => (w.includes(d) ? (w.length > 1 ? w.filter((x) => x !== d) : w) : [...w, d]))
                        }
                      >
                        {WEEKDAYS[d]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="erow" style={{ minHeight: 48 }}>
                  <span className="label">終了日</span>
                  <input
                    type="date"
                    className="pill num"
                    aria-label="繰り返しの終了日"
                    value={until}
                    min={start.slice(0, 10)}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {openItems && (
          <div className="eblock">
            <div className="erow" style={{ alignItems: "flex-start" }}>
              <Package size={22} style={{ marginTop: 6 }} />
              <div style={{ flex: 1 }}>
                <div className="chips">
                  {needed.map((id) => {
                    const off = plan.remove.includes(id);
                    return (
                      <button
                        key={id}
                        className={`chip${off ? " off" : ""}`}
                        aria-pressed={false}
                        aria-label={`${itemName(id)}${off ? "（外す）" : ""}`}
                        onClick={() =>
                          setPlan((p) => ({
                            ...p,
                            remove: off ? p.remove.filter((x) => x !== id) : [...p.remove, id],
                          }))
                        }
                      >
                        {itemName(id)}
                      </button>
                    );
                  })}
                  {plan.add.map((id) => (
                    <button
                      key={id}
                      className="chip"
                      aria-pressed={true}
                      onClick={() => setPlan((p) => ({ ...p, add: p.add.filter((x) => x !== id) }))}
                    >
                      {itemName(id)}
                    </button>
                  ))}
                  {plan.extra.map((t) => (
                    <button
                      key={`x-${t}`}
                      className="chip"
                      aria-pressed={true}
                      aria-label={`${t}（今回だけ）`}
                      onClick={() => setPlan((p) => ({ ...p, extra: p.extra.filter((x) => x !== t) }))}
                    >
                      {t}
                    </button>
                  ))}
                  {others.length > 0 && (
                    <button className="chip" aria-label="持ち物を追加" aria-expanded={picking} onClick={() => setPicking(!picking)}>
                      <Plus size={16} />
                    </button>
                  )}
                  <input
                    ref={extraRef}
                    className="extra-input"
                    placeholder="今回だけ"
                    aria-label="今回だけの持ち物"
                    maxLength={100}
                    enterKeyHint="enter"
                    onKeyDown={(e) => {
                      const v = e.currentTarget.value.trim();
                      if (e.key !== "Enter" || !v) return;
                      e.preventDefault();
                      setPlan((p) => (p.extra.includes(v) ? p : { ...p, extra: [...p.extra, v] }));
                      e.currentTarget.value = "";
                    }}
                  />
                </div>
                {picking && (
                  <div className="chips" style={{ marginTop: 10 }}>
                    {others.map((i) => (
                      <button
                        key={i.id}
                        className="chip"
                        onClick={() => setPlan((p) => ({ ...p, add: [...p.add, i.id] }))}
                      >
                        {i.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {openMemo && (
          <div className="eblock">
            <div className="erow" style={{ alignItems: "flex-start" }}>
              <StickyNote size={22} style={{ marginTop: 10 }} />
              <textarea
                className="memo-input"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                aria-label="メモ"
                maxLength={10000}
                autoFocus={!init.memo}
              />
            </div>
          </div>
        )}

        {(!openRepeat || !openItems || !openMemo) && (
          <div className="erow">
            <Plus size={22} />
            <div className="chips">
              {!openRepeat && (
                <button className="chip" onClick={() => setOpenRepeat(true)}>
                  <Repeat size={16} />
                  繰り返し
                </button>
              )}
              {!openItems && (
                <button className="chip" onClick={() => setOpenItems(true)}>
                  <Package size={16} />
                  持ち物
                </button>
              )}
              {!openMemo && (
                <button className="chip" onClick={() => setOpenMemo(true)}>
                  <StickyNote size={16} />
                  メモ
                </button>
              )}
            </div>
          </div>
        )}

        {original && (
          <div className="group" style={{ marginTop: 32 }}>
            <button className="row danger" onClick={() => remove(null)}>
              予定を削除
            </button>
          </div>
        )}
      </div>
    </Sheet>
      {ask && (
        <Sheet nested onClose={() => setAsk(null)} label={ask === "save" ? "保存する範囲" : "削除する範囲"}>
          <div className="sheet-body choice-list" style={{ paddingTop: 16 }}>
            <button className="secondary" autoFocus onClick={() => (ask === "save" ? save("one") : remove("one"))}>
              この予定のみ
            </button>
            <button className="secondary" onClick={() => (ask === "save" ? save("all") : remove("all"))}>
              すべての予定
            </button>
            <button className="text-btn" style={{ color: "var(--sub)" }} onClick={() => setAsk(null)}>
              キャンセル
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
