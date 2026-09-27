import { useMemo, useState } from "react";
import { Plus, X, Check, ChevronDown } from "lucide-react";
import * as C from "../core/domain";
import type { Event, Occurrence, State } from "../core/model";
import { BagOptions, ErrorMessage, Field, Modal, Weekdays } from "./shared";
import type { Commit } from "./types";
function cleanEvent(e: Event | Occurrence): Event {
  const {
    id,
    title,
    startAt,
    endAt,
    allDay,
    plan,
    categoryId,
    memo,
    recurrence,
    weekdays,
    until,
    createdAt,
    updatedAt,
    deletedAt,
  } = e;
  return structuredClone({
    id,
    title,
    startAt,
    endAt,
    allDay,
    plan,
    categoryId,
    memo,
    recurrence,
    weekdays,
    until,
    createdAt,
    updatedAt,
    deletedAt,
  });
}
export function EventEditor({
  state,
  source,
  day,
  commit,
  onClose,
}: {
  state: State;
  source?: Occurrence;
  day: string;
  commit: Commit;
  onClose: () => void;
}) {
  const base = source
    ? C.active(state.events).find((e) => e.id === source.baseId)
    : undefined;
  const [scope, setScope] = useState<"one" | "all">("one"),
    [draft, setDraft] = useState<Event>(() =>
      source ? cleanEvent(source) : C.newEvent(day),
    );
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [itemSearch, setItemSearch] = useState(""),
    [temporary, setTemporary] = useState(""),
    [newCategory, setNewCategory] = useState("");
  const [autofill, setAutofill] = useState<Event | null>(null),
    [autofilledTitle, setAutofilledTitle] = useState(""),
    [bagTouched, setBagTouched] = useState(false),
    [timeTouched, setTimeTouched] = useState(false);
  const edit = <K extends keyof Event>(key: K, value: Event[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const editPlan = <K extends keyof Event["plan"]>(
    key: K,
    value: Event["plan"][K],
  ) => setDraft((d) => ({ ...d, plan: { ...d.plan, [key]: value } }));
  const needed = C.requiredItems(state, draft.plan);
  const preview = useMemo(() => {
    const clone = structuredClone(state),
      now = new Date();
    C.advanceAutomatic(clone, now);
    if (clone.settings.autoComplete && new Date(draft.startAt) > now) {
      for (const e of C.occurrencesBetween(
        clone,
        C.dateKey(now),
        C.addDays(draft.startAt, 1),
      ).filter(
        (e) =>
          e.baseId !== draft.id &&
          e.plan.bagId &&
          new Date(e.startAt) > now &&
          e.startAt < draft.startAt,
      ))
        C.completePreparation(clone, e, undefined, "auto", new Date(e.startAt));
    }
    return C.preparation(clone, draft.plan);
  }, [state, draft]);
  function inherit() {
    if (source || autofilledTitle === draft.title.trim()) return;
    const match = [...C.active(state.events)]
      .filter((e) => e.title === draft.title.trim())
      .sort((a, b) => b.startAt.localeCompare(a.startAt))[0];
    if (!match) return;
    setAutofill(draft);
    setAutofilledTitle(draft.title.trim());
    const date = draft.startAt.slice(0, 10);
    setDraft({
      ...draft,
      ...(!bagTouched
        ? {
            plan: { ...draft.plan, bagId: match.plan.bagId },
            categoryId: match.categoryId,
          }
        : {}),
      ...(!timeTouched
        ? {
            startAt: `${date}T${match.startAt.slice(11)}`,
            endAt: match.endAt
              ? `${C.addDays(date, C.dayDiff(match.startAt, match.endAt))}T${match.endAt.slice(11)}`
              : null,
            allDay: match.allDay,
          }
        : {}),
    });
  }
  function changeStartDate(date: string) {
    if (!date) return;
    setTimeTouched(true);
    setDraft((d) => ({
      ...d,
      startAt: `${date}T${d.startAt.slice(11)}`,
      endAt: d.endAt
        ? `${C.addDays(date, C.dayDiff(d.startAt, d.endAt))}T${d.endAt.slice(11)}`
        : null,
      weekdays:
        d.recurrence === "weekly" ? d.weekdays : [C.dateAt(date).getDay()],
    }));
  }
  function toggleItem(itemId: string, include: boolean) {
    const inBase = C.bagById(state, draft.plan.bagId)?.itemIds.includes(itemId);
    setDraft((d) => ({
      ...d,
      plan: {
        ...d.plan,
        addedItemIds: [
          ...d.plan.addedItemIds.filter((i) => i !== itemId),
          ...(!inBase && include ? [itemId] : []),
        ],
        removedItemIds: [
          ...d.plan.removedItemIds.filter((i) => i !== itemId),
          ...(inBase && !include ? [itemId] : []),
        ],
      },
    }));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const next = cleanEvent({ ...draft, title: draft.title.trim() });
      const invalid =
        base && scope === "all"
          ? C.active(state.overrides).filter(
              (o) =>
                o.eventId === base.id &&
                (!C.isOccurrence(next, o.date) || next.recurrence === "none"),
            )
          : [];
      if (
        invalid.length &&
        !confirm(
          `繰り返しの範囲外になる「この回だけ」の変更${invalid.length}件を解除します。保存しますか？`,
        )
      ) {
        setBusy(false);
        return;
      }
      const result = await commit((s) => {
        if (base && base.recurrence !== "none" && scope === "one")
          C.saveOccurrence(s, base.id, source!.occurrenceDate, next);
        else {
          const index = s.events.findIndex((e) => e.id === next.id);
          if (index < 0) s.events.push(next);
          else s.events[index] = next;
          s.overrides
            .filter((o) => invalid.some((x) => x.id === o.id))
            .forEach((o) => C.softDelete(o));
        }
      }, "予定を保存しました");
      if (result) onClose();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }
  return (
    <Modal title={source ? "予定を編集" : "予定を追加"} onClose={onClose}>
      <form onSubmit={save} className="editor-form">
        <div className="form-body">
          <ErrorMessage message={error} />
          {base && base.recurrence !== "none" && (
            <Field label="編集する範囲">
              <select
                value={scope}
                onChange={(e) => {
                  const value = e.target.value as "one" | "all";
                  setScope(value);
                  setDraft(cleanEvent(value === "all" ? base : source!));
                }}
              >
                <option value="one">この回だけ</option>
                <option value="all">繰り返し全体</option>
              </select>
            </Field>
          )}
          <Field label="予定名">
            <input
              autoFocus
              name="title"
              required
              maxLength={200}
              value={draft.title}
              onChange={(e) => edit("title", e.target.value)}
              onBlur={inherit}
              list="event-names"
              placeholder="例：大学、仕事、友達とごはん"
              autoComplete="off"
            />
          </Field>
          <datalist id="event-names">
            {[...new Set(C.active(state.events).map((e) => e.title))].map(
              (t) => (
                <option value={t} key={t} />
              ),
            )}
          </datalist>
          {autofill && (
            <div className="inline-note">
              前回の同じ予定からバッグと時刻を入力しました。
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setDraft(autofill);
                  setAutofill(null);
                }}
              >
                戻す
              </button>
            </div>
          )}
          <div className="form-grid">
            <Field label="日付">
              <input
                type="date"
                required
                value={draft.startAt.slice(0, 10)}
                onChange={(e) => changeStartDate(e.target.value)}
              />
            </Field>
            {!draft.allDay && (
              <Field label="開始時刻">
                <input
                  type="time"
                  required
                  value={draft.startAt.slice(11)}
                  onChange={(e) => {
                    setTimeTouched(true);
                    edit(
                      "startAt",
                      `${draft.startAt.slice(0, 10)}T${e.target.value}`,
                    );
                  }}
                />
              </Field>
            )}
          </div>
          <div className="button-row">
            <label className="check-label">
              <input
                type="checkbox"
                checked={draft.allDay}
                onChange={(e) => {
                  setTimeTouched(true);
                  setDraft((d) => ({
                    ...d,
                    allDay: e.target.checked,
                    startAt: `${d.startAt.slice(0, 10)}T${e.target.checked ? "00:00" : "09:00"}`,
                    endAt: null,
                  }));
                }}
              />
              終日
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={!!draft.endAt}
                onChange={(e) => {
                  setTimeTouched(true);
                  edit(
                    "endAt",
                    e.target.checked
                      ? draft.allDay
                        ? `${C.addDays(draft.startAt, 1)}T00:00`
                        : C.localTime(
                            new Date(
                              new Date(draft.startAt).getTime() + 3600000,
                            ),
                          )
                      : null,
                  );
                }}
              />
              終了を指定する
            </label>
          </div>
          {draft.endAt && (
            <div className="form-grid">
              <Field label="終了日">
                <input
                  type="date"
                  required
                  value={
                    draft.allDay
                      ? C.addDays(draft.endAt, -1)
                      : draft.endAt.slice(0, 10)
                  }
                  onChange={(e) =>
                    edit(
                      "endAt",
                      `${draft.allDay ? C.addDays(e.target.value, 1) : e.target.value}T${draft.endAt!.slice(11)}`,
                    )
                  }
                />
              </Field>
              {!draft.allDay && (
                <Field label="終了時刻">
                  <input
                    type="time"
                    required
                    value={draft.endAt.slice(11)}
                    onChange={(e) =>
                      edit(
                        "endAt",
                        `${draft.endAt!.slice(0, 10)}T${e.target.value}`,
                      )
                    }
                  />
                </Field>
              )}
            </div>
          )}
          <Field label="使用バッグ">
            <select
              value={draft.plan.bagId ?? ""}
              onChange={(e) => {
                setBagTouched(true);
                editPlan("bagId", e.target.value || null);
              }}
            >
              <BagOptions bags={C.bags(state)} />
            </select>
          </Field>
          {draft.plan.bagId && (
            <div className="preparation-preview" aria-live="polite">
              <strong>
                <Check size={17} />
                この予定の準備
              </strong>
              <p>
                {preview.length
                  ? preview.map((a) => `${a.from}から${a.item.name}`).join("、")
                  : "登録した持ち物の移し替えはありません"}
                {draft.plan.temporaryItems.length
                  ? `。今回だけ：${draft.plan.temporaryItems.join("・")}`
                  : ""}
              </p>
              <small>それまでの予定を準備済みとした見込みです。</small>
            </div>
          )}
          <details className="form-details">
            <summary>
              カテゴリ・繰り返し・持ち物・メモ
              <ChevronDown size={18} />
            </summary>
            <div>
              <Field label="カテゴリ">
                <select
                  value={draft.categoryId ?? ""}
                  onChange={(e) => {
                    const category = C.active(state.categories).find(
                      (c) => c.id === e.target.value,
                    );
                    setDraft((d) => ({
                      ...d,
                      categoryId: category?.id ?? null,
                      ...(!bagTouched && category?.defaultBagId
                        ? { plan: { ...d.plan, bagId: category.defaultBagId } }
                        : {}),
                    }));
                  }}
                >
                  <option value="">指定しない</option>
                  {C.active(state.categories).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="inline-add">
                <input
                  aria-label="新しいカテゴリ名"
                  placeholder="カテゴリを追加"
                  value={newCategory}
                  maxLength={200}
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <button
                  type="button"
                  className="button secondary"
                  disabled={!newCategory.trim()}
                  onClick={async () => {
                    const categoryId = C.id();
                    if (
                      await commit(
                        (s) =>
                          s.categories.push({
                            ...C.entityStamp(),
                            id: categoryId,
                            name: newCategory.trim(),
                            defaultBagId: draft.plan.bagId,
                          }),
                        "カテゴリを追加しました",
                      )
                    ) {
                      edit("categoryId", categoryId);
                      setNewCategory("");
                    }
                  }}
                >
                  追加
                </button>
              </div>
              {(!base || base.recurrence === "none" || scope === "all") && (
                <>
                  <Field label="繰り返し">
                    <select
                      value={draft.recurrence}
                      onChange={(e) =>
                        edit(
                          "recurrence",
                          e.target.value as Event["recurrence"],
                        )
                      }
                    >
                      <option value="none">繰り返さない</option>
                      <option value="daily">毎日</option>
                      <option value="weekly">毎週</option>
                      {draft.recurrence === "monthly" && (
                        <option value="monthly">毎月（旧版の予定）</option>
                      )}
                    </select>
                  </Field>
                  {draft.recurrence === "weekly" && (
                    <Weekdays
                      value={draft.weekdays}
                      onChange={(v) => edit("weekdays", v)}
                    />
                  )}
                  {draft.recurrence !== "none" && (
                    <Field label="繰り返しの終了日（任意）">
                      <input
                        type="date"
                        value={draft.until ?? ""}
                        onChange={(e) => edit("until", e.target.value || null)}
                        min={draft.startAt.slice(0, 10)}
                      />
                    </Field>
                  )}
                </>
              )}
              {draft.plan.bagId && (
                <section className="event-items">
                  <h3>今回の必要セット</h3>
                  <div className="chips">
                    {needed.map((i) => (
                      <button
                        type="button"
                        className="chip selected"
                        key={i.id}
                        onClick={() => toggleItem(i.id, false)}
                        aria-label={`${i.name}をこの予定から外す`}
                      >
                        {i.name}
                        <X size={14} />
                      </button>
                    ))}
                    {!needed.length && (
                      <p className="muted">まだ持ち物がありません。</p>
                    )}
                  </div>
                  <input
                    aria-label="追加する持ち物を検索"
                    placeholder="登録済みの持ち物を検索して追加"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                  />
                  <div className="chips">
                    {C.items(state)
                      .filter(
                        (i) =>
                          !needed.some((n) => n.id === i.id) &&
                          i.name.includes(itemSearch),
                      )
                      .slice(0, 12)
                      .map((i) => (
                        <button
                          type="button"
                          className="chip"
                          key={i.id}
                          onClick={() => toggleItem(i.id, true)}
                        >
                          <Plus size={14} />
                          {i.name}
                        </button>
                      ))}
                  </div>
                  <small>
                    この予定だけの調整です。バッグの基本セットは変わりません。
                  </small>
                </section>
              )}
              <Field
                label="今回だけの持ち物"
                hint="持ち物一覧への登録は不要です。"
              >
                <div className="inline-add">
                  <input
                    value={temporary}
                    maxLength={200}
                    onChange={(e) => setTemporary(e.target.value)}
                    placeholder="例：提出する書類"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (temporary.trim()) {
                          editPlan("temporaryItems", [
                            ...new Set([
                              ...draft.plan.temporaryItems,
                              temporary.trim(),
                            ]),
                          ]);
                          setTemporary("");
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="button secondary"
                    disabled={!temporary.trim()}
                    onClick={() => {
                      editPlan("temporaryItems", [
                        ...new Set([
                          ...draft.plan.temporaryItems,
                          temporary.trim(),
                        ]),
                      ]);
                      setTemporary("");
                    }}
                  >
                    追加
                  </button>
                </div>
              </Field>
              <div className="chips">
                {draft.plan.temporaryItems.map((name) => (
                  <button
                    type="button"
                    className="chip selected"
                    key={name}
                    onClick={() =>
                      editPlan(
                        "temporaryItems",
                        draft.plan.temporaryItems.filter((n) => n !== name),
                      )
                    }
                    aria-label={`${name}を外す`}
                  >
                    {name}
                    <X size={14} />
                  </button>
                ))}
              </div>
              <Field label="メモ">
                <textarea
                  rows={3}
                  maxLength={10000}
                  value={draft.memo}
                  onChange={(e) => edit("memo", e.target.value)}
                />
              </Field>
            </div>
          </details>
        </div>
        <footer className="modal-footer">
          {source && (
            <button
              type="button"
              className="button danger"
              onClick={async () => {
                if (
                  confirm(
                    `${scope === "all" ? "繰り返し全体" : "この予定"}を削除しますか？`,
                  )
                ) {
                  if (
                    await commit(
                      (s) =>
                        C.removeEvent(
                          s,
                          source.baseId,
                          source.occurrenceDate,
                          scope,
                        ),
                      "予定を削除しました",
                      { undo: true },
                    )
                  )
                    onClose();
                }
              }}
            >
              削除
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="button secondary" onClick={onClose}>
            キャンセル
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "保存中…" : "保存する"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
