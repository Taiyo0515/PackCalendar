import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  Download,
  Upload,
  Plus,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import * as C from "../core/domain";
import { buildSchedule } from "../core/notifications";
import type { State, Rule, Category, Container } from "../core/model";
import type { Repository } from "../platform/repository";
import { getScheduler, isNative } from "../platform";
import { WebScheduler } from "../platform/web";
import type { Commit } from "./types";
import { BagOptions, ErrorMessage, Field, Modal, Weekdays } from "./shared";
export function download(text: string, name: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function Settings({
  state,
  repo,
  commit,
  syncStatus,
  offlineReady,
  onMessage,
}: {
  state: State;
  repo: Repository;
  commit: Commit;
  syncStatus: string;
  offlineReady: boolean;
  onMessage: (message: string) => void;
}) {
  const [error, setError] = useState(""),
    [server, setServer] = useState(import.meta.env.VITE_PUSH_URL ?? ""),
    [invitation, setInvitation] = useState(""),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [used, setUsed] = useState(""),
    [editing, setEditing] = useState<
      | { kind: "category"; value: Category }
      | { kind: "rule"; value: Rule }
      | null
    >(null);
  const [placeEditor, setPlaceEditor] = useState<Container | null>(null);
  const totals = C.metricsSummary(state);
  const file = useRef<HTMLInputElement>(null),
    schedule = buildSchedule(state);
  useEffect(() => {
    if (isNative) {
      void import("../platform/native")
        .then(async ({ NativeScheduler }) =>
          setConnected(await new NativeScheduler().connected()),
        )
        .catch(() => setConnected(false));
    } else
      new WebScheduler(repo).connection().then((c) => {
        setConnected(!!c);
        if (c) setServer(c.url);
      });
    navigator.storage
      ?.estimate()
      .then((e) => setUsed(`${((e.usage ?? 0) / 1048576).toFixed(1)} MB`));
  }, [repo, state.revision]);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function importFile(chosen?: File) {
    if (!chosen) return;
    await run(async () => {
      const backup = await repo.parseBackup(await chosen.text());
      const s = backup.state;
      if (
        !confirm(
          `バッグ${C.bags(s).length}個・持ち物${s.items.length}点・予定${s.events.length}件を読み込み、現在のデータを置き換えます。よろしいですか？`,
        )
      )
        return;
      await commit(
        (next) => {
          const revision = next.revision;
          Object.assign(next, s, { revision });
        },
        "バックアップを読み込みました",
        { photos: backup.photos, undo: true },
      );
    });
    if (file.current) file.current.value = "";
  }
  return (
    <>
      <div className="page-title">
        <div>
          <h1>設定</h1>
          <p>記録と通知を、自分に合わせる</p>
        </div>
      </div>
      <ErrorMessage message={error} />
      <div className="settings-grid">
        <section className="panel settings-section">
          <header>
            <Check />
            <h2>準備の記録</h2>
          </header>
          <label className="toggle-row">
            <span>
              <strong>開始時刻に自動で準備済みにする</strong>
              <small>
                閉じていた間の予定も、次に開いたときに記録します。履歴から取り消せます。
              </small>
            </span>
            <input
              type="checkbox"
              checked={state.settings.autoComplete}
              onChange={(e) =>
                void commit((s) => {
                  s.settings.autoComplete = e.target.checked;
                  s.settings.autoCursor = new Date().toISOString();
                }, "自動記録の設定を変更しました")
              }
            />
          </label>
          <Field label="週の始まり">
            <select
              value={state.settings.weekStart}
              onChange={(e) =>
                void commit((s) => {
                  s.settings.weekStart = Number(e.target.value) as 0 | 1;
                }, "週の始まりを変更しました")
              }
            >
              <option value="1">月曜日</option>
              <option value="0">日曜日</option>
            </select>
          </Field>
        </section>
        <section className="panel settings-section">
          <header>
            <Bell />
            <h2>準備の通知</h2>
          </header>
          <p>
            移動が必要な物だけを、移動元ごとに知らせます。予定は先14日分を用意し、アプリを開くたびに更新します。
          </p>
          <label className="toggle-row">
            <span>
              <strong>通知予定を作る</strong>
              <small>
                {connected
                  ? "変更した予定は、接続先にも反映します。"
                  : "受け取るには、この下の「通知を接続」を設定してください。"}
              </small>
            </span>
            <input
              type="checkbox"
              checked={state.settings.reminders.enabled}
              disabled={busy}
              onChange={(e) => {
                const enabled = e.target.checked;
                void run(async () => {
                  if (!enabled) {
                    const scheduler = await getScheduler(repo);
                    await scheduler.disable();
                    setConnected(false);
                  }
                  await commit(
                    (s) => {
                      s.settings.reminders.enabled = enabled;
                    },
                    enabled ? "通知予定を有効にしました" : "通知を停止しました",
                  );
                });
              }}
            />
          </label>
          <div className="form-grid">
            {(["evening", "morning"] as const).map((kind, i) => (
              <div key={kind}>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={!!state.settings.reminders[kind]}
                    onChange={(e) =>
                      void commit((s) => {
                        s.settings.reminders[kind] = e.target.checked
                          ? i === 0
                            ? "21:00"
                            : "07:00"
                          : null;
                      }, "通知時刻を変更しました")
                    }
                  />
                  {i === 0 ? "前日の夜" : "当日の朝"}
                </label>
                {state.settings.reminders[kind] && (
                  <input
                    aria-label={i === 0 ? "前夜の通知時刻" : "当朝の通知時刻"}
                    type="time"
                    value={state.settings.reminders[kind]!}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value)
                        void commit((s) => {
                          s.settings.reminders[kind] = value;
                        }, "通知時刻を変更しました");
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="connection-status">
            <span className={`status-dot ${connected ? "online" : ""}`} />
            {connected ? "通知の接続あり" : "通知は未接続"}
            {syncStatus && <small role="status">{syncStatus}</small>}
          </div>
          <details className="form-details">
            <summary>{connected ? "通知の接続を管理" : "通知を接続"}</summary>
            <div>
              {!isNative && (
                <>
                  <ol className="setup-steps">
                    <li>
                      iPhoneでは、Safariの共有メニューからホーム画面に追加します。
                    </li>
                    <li>
                      追加したアイコンから開き、下のボタンで通知を許可します。
                    </li>
                  </ol>
                  <p>
                    通知の文面・送信時刻・通知先を送信します。写真や持ち物一覧は送信しません。
                  </p>
                  <Field label="通知サーバーのURL">
                    <input
                      type="url"
                      value={server}
                      onChange={(e) => setServer(e.target.value)}
                      placeholder="https://通知用サーバー.workers.dev"
                    />
                  </Field>
                  <Field label="招待コード">
                    <input
                      type="password"
                      value={invitation}
                      onChange={(e) => setInvitation(e.target.value)}
                      autoComplete="off"
                    />
                  </Field>
                </>
              )}
              <button
                className="button primary"
                disabled={busy || (!isNative && !server.trim())}
                onClick={() =>
                  void run(async () => {
                    const scheduler = await getScheduler(repo);
                    if (scheduler instanceof WebScheduler)
                      await scheduler.connect(server, invitation);
                    else await scheduler.connect();
                    await commit((s) => {
                      s.settings.reminders.enabled = true;
                    }, "通知を接続しました");
                    await scheduler.sync(
                      buildSchedule({
                        ...state,
                        settings: {
                          ...state.settings,
                          reminders: {
                            ...state.settings.reminders,
                            enabled: true,
                          },
                        },
                      }),
                    );
                    setConnected(true);
                    setInvitation("");
                  })
                }
              >
                通知を許可して接続
              </button>
              {connected && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await (await getScheduler(repo)).disable();
                      setConnected(false);
                      onMessage("通知先と送信予定を削除しました");
                    })
                  }
                >
                  通知先を削除する
                </button>
              )}
            </div>
          </details>
          <details className="form-details">
            <summary>これからの通知文（{schedule.length}件）</summary>
            <div className="notification-list">
              {schedule.length ? (
                schedule.map((n) => (
                  <article key={n.id}>
                    <small>{new Date(n.at).toLocaleString("ja-JP")}</small>
                    <strong>{n.title}</strong>
                    <p>{n.body}</p>
                  </article>
                ))
              ) : (
                <p>通知対象はありません。差分がないときは通知しません。</p>
              )}
            </div>
          </details>
        </section>
        <section className="panel settings-section">
          <header>
            <h2>曜日ごとのバッグ</h2>
            <button
              className="icon-button"
              aria-label="曜日ルールを追加"
              disabled={!C.bags(state).length}
              onClick={() =>
                setEditing({
                  kind: "rule",
                  value: {
                    ...C.entityStamp(),
                    id: C.id(),
                    name: "",
                    bagId: C.bags(state)[0].id,
                    weekdays: [1, 3, 5],
                    time: "09:00",
                    enabled: true,
                    from: C.dateKey(new Date()),
                  },
                })
              }
            >
              <Plus />
            </button>
          </header>
          <p>
            バッグ付きの予定がない日に使います。例外の日は、カレンダーに予定を入れて上書きできます。
          </p>
          {C.active(state.rules).map((rule) => (
            <div className="setting-list-row" key={rule.id}>
              <button
                className="plain"
                onClick={() =>
                  setEditing({ kind: "rule", value: structuredClone(rule) })
                }
              >
                <strong>{rule.name}</strong>
                <small>
                  {rule.weekdays.map((i) => "日月火水木金土"[i]).join("・")}{" "}
                  {rule.time} · {C.bagById(state, rule.bagId)?.name}
                </small>
              </button>
              <input
                type="checkbox"
                aria-label={`${rule.name}を有効にする`}
                checked={rule.enabled}
                onChange={(e) =>
                  void commit((s) => {
                    s.rules.find((r) => r.id === rule.id)!.enabled =
                      e.target.checked;
                  }, "曜日ルールを更新しました")
                }
              />
            </div>
          ))}
          {!C.active(state.rules).length && (
            <p className="muted">曜日ルールはまだありません。</p>
          )}
        </section>
        <section className="panel settings-section">
          <header>
            <h2>カテゴリ</h2>
            <button
              className="icon-button"
              aria-label="カテゴリを追加"
              onClick={() =>
                setEditing({
                  kind: "category",
                  value: {
                    ...C.entityStamp(),
                    id: C.id(),
                    name: "",
                    defaultBagId: null,
                  },
                })
              }
            >
              <Plus />
            </button>
          </header>
          <p>予定には1つだけ選べます。よく使うバッグも指定できます。</p>
          {C.active(state.categories).map((c) => (
            <button
              className="setting-list-row plain"
              key={c.id}
              onClick={() =>
                setEditing({ kind: "category", value: structuredClone(c) })
              }
            >
              <strong>{c.name}</strong>
              <small>
                {C.bagById(state, c.defaultBagId)?.name ?? "バッグ指定なし"}
              </small>
            </button>
          ))}
        </section>
        <section className="panel settings-section">
          <header>
            <h2>保管場所</h2>
            <button
              className="icon-button"
              aria-label="保管場所を追加"
              onClick={() =>
                setPlaceEditor({
                  id: C.id(),
                  name: "",
                  kind: "place",
                  memo: "",
                  color: "sage",
                  imageId: null,
                  itemIds: [],
                  ...C.entityStamp(),
                })
              }
            >
              <Plus />
            </button>
          </header>
          <p>自宅やバッグ以外の置き場所に名前を付けます。</p>
          {C.active(state.containers)
            .filter((c) => c.kind === "place" && c.id !== "home")
            .map((c) => (
              <button
                className="setting-list-row plain"
                key={c.id}
                onClick={() => setPlaceEditor(structuredClone(c))}
              >
                <strong>{c.name}</strong>
                <small>
                  {
                    C.items(state).filter(
                      (i) => i.location.containerId === c.id,
                    ).length
                  }
                  点
                </small>
              </button>
            ))}
          <small>自宅・身につける場所は常に使えます。</small>
        </section>
        <section className="panel settings-section">
          <header>
            <h2>この7日間の記録</h2>
          </header>
          <div className="metrics-grid">
            {[
              [totals.shown, "表示した準備"],
              [totals.auto, "自動記録"],
              [totals.manual, "手動で位置修正"],
              [totals.forgotten, "忘れた物"],
            ].map(([count, label]) => (
              <div key={label}>
                <strong>{count}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <small>
            表示数は同じ準備の見直しも含みます。記録はこの端末だけに保存します。
          </small>
          <button
            className="text-button"
            onClick={() =>
              download(
                JSON.stringify({
                  app: "PackCalendar",
                  exportedAt: new Date().toISOString(),
                  summary: totals,
                  displays: state.metrics,
                  moves: state.moves,
                }),
                `PackCalendar-log-${C.dateKey(new Date())}.json`,
              )
            }
          >
            検証ログを書き出す
          </button>
        </section>
        <section className="panel settings-section">
          <header>
            <ShieldCheck />
            <h2>保存とバックアップ</h2>
          </header>
          <p>
            データはこの端末に保存されます。別の端末へは、バックアップを書き出して読み込んでください。
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void run(async () =>
                  download(
                    await repo.export(state),
                    `PackCalendar-${C.dateKey(new Date())}.json`,
                  ),
                )
              }
            >
              <Download size={18} />
              書き出す
            </button>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              <Upload size={18} />
              読み込む
            </button>
            <input
              ref={file}
              type="file"
              hidden
              accept=".json,application/json"
              aria-label="バックアップファイル"
              onChange={(e) => void importFile(e.target.files?.[0])}
            />
          </div>
          <p className="storage-note">
            保存容量：{used || "確認中"}
            <br />
            {offlineReady
              ? "オフライン起動の準備ができています。"
              : isNative
                ? "アプリ内に保存しています。"
                : "オフライン起動を準備中です。"}
          </p>
          {isNative && (
            <p>
              自動バックアップは「ファイル」アプリのPackCalendarフォルダに、直近7日分を保存します。
            </p>
          )}
          <details className="form-details">
            <summary>データを削除する</summary>
            <div>
              <p>
                予定・バッグ・持ち物をすべて削除します。必要な記録は先に書き出してください。
              </p>
              <button
                className="button danger"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (!confirm("この端末のすべてのデータを削除しますか？"))
                      return;
                    await (await getScheduler(repo)).disable();
                    await commit(
                      (s) => {
                        const revision = s.revision;
                        Object.assign(s, C.emptyState(), { revision });
                        s.settings.onboarded = true;
                      },
                      "すべてのデータを削除しました",
                      { undo: true },
                    );
                  })
                }
              >
                <Trash2 size={17} />
                すべてのデータを削除
              </button>
            </div>
          </details>
        </section>
      </div>
      {placeEditor && (
        <Modal title="保管場所" onClose={() => setPlaceEditor(null)}>
          <form
            className="editor-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await commit((s) => {
                  const i = s.containers.findIndex(
                    (c) => c.id === placeEditor.id,
                  );
                  if (i < 0) s.containers.push(placeEditor);
                  else s.containers[i] = placeEditor;
                }, "保管場所を保存しました")
              )
                setPlaceEditor(null);
            }}
          >
            <div className="form-body">
              <Field label="場所の名前">
                <input
                  autoFocus
                  required
                  maxLength={200}
                  placeholder="例：職場ロッカー、車"
                  value={placeEditor.name}
                  onChange={(e) =>
                    setPlaceEditor({ ...placeEditor, name: e.target.value })
                  }
                />
              </Field>
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button danger"
                onClick={async () => {
                  if (
                    confirm(
                      "この場所を削除し、中にある物の位置を不明にしますか？",
                    )
                  )
                    if (
                      await commit(
                        (s) => C.removeContainer(s, placeEditor.id),
                        "保管場所を削除しました",
                        { undo: true },
                      )
                    )
                      setPlaceEditor(null);
                }}
              >
                削除
              </button>
              <span className="spacer" />
              <button className="button primary" type="submit">
                保存する
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title={editing.kind === "rule" ? "曜日ルール" : "カテゴリ"}
          onClose={() => setEditing(null)}
        >
          <form
            className="editor-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const success = await commit((s) => {
                const list = editing.kind === "rule" ? s.rules : s.categories;
                const index = list.findIndex((v) => v.id === editing.value.id);
                if (index >= 0) list.splice(index, 1);
                if (editing.kind === "rule") s.rules.push(editing.value);
                else s.categories.push(editing.value);
              }, "設定を保存しました");
              if (success) setEditing(null);
            }}
          >
            <div className="form-body">
              <Field label="名前">
                <input
                  autoFocus
                  required
                  value={editing.value.name}
                  maxLength={200}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      value: { ...editing.value, name: e.target.value },
                    } as typeof editing)
                  }
                />
              </Field>
              {editing.kind === "category" ? (
                <Field label="既定のバッグ">
                  <select
                    value={editing.value.defaultBagId ?? ""}
                    onChange={(e) =>
                      setEditing({
                        kind: "category",
                        value: {
                          ...editing.value,
                          defaultBagId: e.target.value || null,
                        },
                      })
                    }
                  >
                    <BagOptions bags={C.bags(state)} />
                  </select>
                </Field>
              ) : (
                <>
                  <Field label="使用バッグ">
                    <select
                      value={editing.value.bagId}
                      required
                      onChange={(e) =>
                        setEditing({
                          kind: "rule",
                          value: { ...editing.value, bagId: e.target.value },
                        })
                      }
                    >
                      {C.bags(state).map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Weekdays
                    value={editing.value.weekdays}
                    onChange={(v) =>
                      setEditing({
                        kind: "rule",
                        value: { ...editing.value, weekdays: v },
                      })
                    }
                  />
                  <Field label="出発時刻">
                    <input
                      type="time"
                      required
                      value={editing.value.time}
                      onChange={(e) =>
                        setEditing({
                          kind: "rule",
                          value: { ...editing.value, time: e.target.value },
                        })
                      }
                    />
                  </Field>
                </>
              )}
            </div>
            <footer className="modal-footer">
              <button
                type="button"
                className="button danger"
                onClick={async () => {
                  if (confirm("この設定を削除しますか？"))
                    if (
                      await commit(
                        (s) => {
                          if (editing.kind === "category")
                            C.removeCategory(s, editing.value.id);
                          else
                            s.rules
                              .filter((r) => r.id === editing.value.id)
                              .forEach((r) => C.softDelete(r));
                        },
                        "設定を削除しました",
                        { undo: true },
                      )
                    )
                      setEditing(null);
                }}
              >
                削除
              </button>
              <span className="spacer" />
              <button className="button primary" type="submit">
                保存する
              </button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}
