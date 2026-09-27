import { useCallback, useEffect, useRef, useState } from "react";
import {
  Backpack,
  CalendarDays,
  Layers3,
  Settings2,
  Check,
  Plus,
  Undo2,
  Download,
} from "lucide-react";
import * as C from "./core/domain";
import type { Bag, Item, Occurrence, State } from "./core/model";
import { buildSchedule } from "./core/notifications";
import { Repository, SaveConflictError } from "./platform/repository";
import { getScheduler, isNative, nativeBackup } from "./platform";
import type { Commit } from "./ui/types";
import { Home } from "./ui/Home";
import { Inventory } from "./ui/Inventory";
import { EventEditor } from "./ui/EventEditor";
import { QuickEditor } from "./ui/QuickEditor";
import { BagContents } from "./ui/BagContents";
import { Settings, download } from "./ui/Settings";
import { BagBadge, Modal, dayLabel } from "./ui/shared";
type Screen =
  | { kind: "event"; day: string; source?: Occurrence }
  | { kind: "detail"; event: Occurrence }
  | { kind: "contents"; bagId: string; event?: Occurrence }
  | {
      kind: "quick";
      bagId?: string;
      item?: Item;
      bag?: Bag;
      bagMode?: boolean;
    };
const namespace = new URL("./", window.location.href).pathname;
export const repository = new Repository(namespace);
const tabs = [
  { id: "home", label: "ホーム", Icon: CalendarDays },
  { id: "items", label: "持ち物", Icon: Layers3 },
  { id: "settings", label: "設定", Icon: Settings2 },
];
const initialTab = () =>
  ["items", "bags"].includes(location.hash.slice(1))
    ? "items"
    : location.hash === "#settings"
      ? "settings"
      : "home";
export default function App() {
  const [state, setState] = useState<State | null>(null),
    [failure, setFailure] = useState(""),
    [view, setView] = useState(initialTab),
    [screen, setScreen] = useState<Screen | null>(null),
    [message, setMessage] = useState(""),
    [undo, setUndo] = useState<{ state: State; revision: number } | null>(null),
    [offline, setOffline] = useState(false),
    [update, setUpdate] = useState<ServiceWorker | null>(null),
    [syncStatus, setSyncStatus] = useState("");
  const current = useRef<State | null>(null),
    writing = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    syncQueue = useRef(Promise.resolve()),
    lastSchedule = useRef("");
  const announce = useCallback((text: string) => {
    setMessage(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setMessage("");
      setUndo(null);
    }, 14000);
  }, []);
  const accept = useCallback((s: State) => {
    current.current = s;
    setState(s);
  }, []);
  const commit: Commit = useCallback(
    async (change, text, options = {}) => {
      if (!current.current || writing.current) {
        announce("保存処理の完了を待ってください。");
        return false;
      }
      writing.current = true;
      try {
        const before = structuredClone(current.current),
          next = structuredClone(before);
        change(next);
        C.stampChanges(before, next);
        const saved = await repository.save(next, options.photos);
        accept(saved);
        setUndo((previous) =>
          options.undo
            ? { state: before, revision: saved.revision }
            : options.background && previous
              ? {
                  state: {
                    ...previous.state,
                    metrics: saved.metrics,
                    settings: {
                      ...previous.state.settings,
                      autoCursor: saved.settings.autoCursor,
                    },
                  },
                  revision: saved.revision,
                }
              : null,
        );
        window.dispatchEvent(
          new CustomEvent("packcalendar-error", { detail: "" }),
        );
        if (text) announce(text);
        void navigator.storage?.persist?.().catch(() => false);
        return true;
      } catch (e) {
        const error = (e as Error).message;
        announce(error);
        window.dispatchEvent(
          new CustomEvent("packcalendar-error", { detail: error }),
        );
        try {
          accept(await repository.load());
        } catch {
          /* keep the last known good state visible */
        }
        return false;
      } finally {
        writing.current = false;
      }
    },
    [accept, announce],
  );
  useEffect(() => {
    let stop: (() => void) | undefined,
      alive = true;
    repository
      .load()
      .then(async (loaded) => {
        const next = structuredClone(loaded);
        let moves = C.advanceAutomatic(next),
          saved: State;
        try {
          saved = await repository.save(next);
        } catch (error) {
          if (!(error instanceof SaveConflictError)) throw error;
          saved = await repository.load();
          moves = 0;
        }
        if (!alive) return;
        accept(saved);
        if (moves)
          announce(
            `${moves}点を予定の開始時刻に準備済みとして記録しました。履歴から取り消せます。`,
          );
        stop = repository.watch(
          (incoming) => {
            if (
              !writing.current &&
              incoming.revision !== current.current?.revision
            ) {
              accept(incoming);
              setScreen(null);
              setUndo(null);
              announce("別の画面での変更を反映しました。");
            }
          },
          (e) => setFailure((e as Error).message),
        );
      })
      .catch((e) => setFailure((e as Error).message));
    return () => {
      alive = false;
      stop?.();
    };
  }, [accept, announce]);
  useEffect(() => {
    const tick = () => {
      if (!current.current?.settings.onboarded || writing.current) return;
      const clone = structuredClone(current.current),
        count = C.advanceAutomatic(clone);
      if (clone.settings.autoCursor !== current.current.settings.autoCursor)
        void commit(
          (s) => Object.assign(s, clone),
          count ? `${count}点を自動で準備済みとして記録しました` : "",
          { background: count === 0 },
        );
    };
    const visible = () => {
      if (document.visibilityState === "visible") tick();
    };
    const interval = setInterval(tick, 60000);
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [commit]);
  useEffect(() => {
    if (!state?.settings.onboarded) return;
    const schedule = buildSchedule(state),
      encoded = JSON.stringify(schedule);
    if (!state.settings.reminders.enabled) {
      lastSchedule.current = "";
      setSyncStatus("");
    }
    if (state.settings.reminders.enabled && encoded !== lastSchedule.current) {
      syncQueue.current = syncQueue.current.then(async () => {
        try {
          if (!current.current?.settings.reminders.enabled) return;
          const scheduler = await getScheduler(repository);
          await scheduler.sync(schedule);
          if (!current.current?.settings.reminders.enabled) {
            await scheduler.disable();
            lastSchedule.current = "";
            return;
          }
          lastSchedule.current = encoded;
          setSyncStatus(`通知予定：${schedule.length}件`);
        } catch (e) {
          setSyncStatus((e as Error).message);
        }
      });
    }
    if (isNative) {
      const timeout = setTimeout(() => {
        void repository
          .export(state)
          .then(nativeBackup)
          .catch((e) => announce(`自動バックアップ：${(e as Error).message}`));
      }, 1200);
      return () => clearTimeout(timeout);
    }
  }, [state, announce]);
  useEffect(() => {
    const retry = () => {
      lastSchedule.current = "";
      if (current.current) setState({ ...current.current });
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || import.meta.env.DEV || isNative)
      return;
    let reload = false;
    navigator.serviceWorker
      .register("./sw.js", { scope: "./" })
      .then((reg) => {
        if (reg.waiting) setUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setUpdate(worker);
          });
        });
      })
      .catch((e) => announce(`オフライン機能：${(e as Error).message}`));
    navigator.serviceWorker.ready.then(() => setOffline(true));
    const changed = () => {
      if (reload) location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", changed);
    const request = () => {
      reload = true;
    };
    window.addEventListener("packcalendar-update", request);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", changed);
      window.removeEventListener("packcalendar-update", request);
    };
  }, [announce]);
  useEffect(() => {
    const change = () => {
      setView(initialTab());
      setScreen(null);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  const go = (tab: string) => {
    setView(tab);
    setScreen(null);
    location.hash = tab;
    window.scrollTo(0, 0);
  };
  if (failure)
    return (
      <main className="recovery panel">
        <Backpack size={36} />
        <h1>記録を読み込めませんでした</h1>
        <p role="alert">{failure}</p>
        <p>元の保存データを残しています。バックアップから復元できます。</p>
        <button
          className="button secondary"
          onClick={() =>
            void repository
              .rescueRaw()
              .then((raw) => download(raw, "PackCalendar-rescue.json"))
              .catch((e) => setFailure((e as Error).message))
          }
        >
          <Download size={18} />
          元データを救出
        </button>
        <label className="button primary">
          バックアップを読み込む
          <input
            type="file"
            accept=".json"
            hidden
            onChange={async (e) => {
              try {
                const file = e.target.files?.[0];
                if (!file) return;
                const imported = await repository.parseBackup(
                  await file.text(),
                );
                if (
                  !confirm(
                    `バッグ${C.bags(imported.state).length}個・持ち物${C.items(imported.state).length}点のバックアップで復元しますか？`,
                  )
                )
                  return;
                await repository.withPhotos(imported.photos, (records) =>
                  repository.transaction(
                    "rw",
                    repository.states,
                    repository.photos,
                    repository.meta,
                    async () => {
                      const old = await repository.states.get("current");
                      if (old)
                        await repository.meta.put({
                          id: `recovery-${Date.now()}`,
                          value: JSON.stringify(old),
                        });
                      await repository.photos.bulkPut(records);
                      await repository.states.put({
                        id: "current",
                        value: C.stateForStorage(imported.state),
                      });
                    },
                  ),
                );
                location.reload();
              } catch (error) {
                setFailure((error as Error).message);
              }
            }}
          />
        </label>
      </main>
    );
  if (!state)
    return (
      <main className="loading">
        <Backpack />
        <p>記録を読み込んでいます…</p>
      </main>
    );
  const openContents = (bagId: string, event?: Occurrence) =>
    setScreen({ kind: "contents", bagId, event });
  return (
    <>
      <a className="skip-link" href="#main">
        本文へ移動
      </a>
      <header className="app-header">
        <a className="brand" href="#home" onClick={() => go("home")}>
          <span>
            <Backpack size={24} />
          </span>
          PackCalendar
        </a>
        <nav aria-label="メインナビゲーション">
          {tabs.map(({ id, label, Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={view === id ? "page" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={20} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <span className="header-status">
          <span className="status-dot online" />
          端末に保存
        </span>
      </header>
      {state.settings.sample && (
        <div className="sample-banner">
          <span>サンプルデータを表示中</span>
          <button
            className="text-button"
            onClick={() => {
              if (confirm("サンプルを消して、自分のデータで始めますか？"))
                void commit(
                  (s) => {
                    const revision = s.revision;
                    Object.assign(s, C.emptyState(), { revision });
                    s.settings.onboarded = true;
                  },
                  "空の状態で始めました",
                  { undo: true },
                );
            }}
          >
            自分のデータで始める
          </button>
        </div>
      )}
      {update && (
        <div className="update-banner">
          新しい版を利用できます。
          <button
            className="text-button"
            onClick={() => {
              window.dispatchEvent(new Event("packcalendar-update"));
              update.postMessage({ type: "SKIP_WAITING" });
            }}
          >
            更新する
          </button>
        </div>
      )}
      <main id="main" className="app-main">
        {!state.settings.onboarded ? (
          <section className="welcome panel">
            <span className="welcome-mark">
              <Backpack size={42} />
            </span>
            <h1>
              予定が決まれば、
              <br />
              準備もひと目で。
            </h1>
            <p>
              バッグと持ち物を登録して、
              <br />
              今回、移す必要のある物だけを確認。
            </p>
            <div className="welcome-example">
              <span>明日 9:00 · 大学</span>
              <strong>
                ミニバッグから 財布・鍵 <ArrowIcon />
              </strong>
              <span>いつものリュックへ</span>
            </div>
            <button
              className="button primary"
              onClick={() =>
                void commit((s) => {
                  const revision = s.revision;
                  Object.assign(s, C.sampleState(), { revision });
                }, "サンプルを用意しました")
              }
            >
              サンプルで体験する
            </button>
            <button
              className="button secondary"
              onClick={() =>
                void commit((s) => {
                  s.settings.onboarded = true;
                  s.settings.autoCursor = new Date().toISOString();
                }, "最初のバッグを登録しましょう")
              }
            >
              空の状態で始める
            </button>
            <small>アカウント不要。記録はこの端末に保存します。</small>
          </section>
        ) : view === "home" ? (
          <Home
            state={state}
            commit={commit}
            onNew={(day) => setScreen({ kind: "event", day })}
            onEvent={(event) => setScreen({ kind: "detail", event })}
            onContents={openContents}
          />
        ) : view === "items" ? (
          <Inventory
            state={state}
            repo={repository}
            commit={commit}
            onQuick={() => setScreen({ kind: "quick" })}
            onBag={(b) => openContents(b.id)}
            onEditBag={(bag) =>
              setScreen({ kind: "quick", bag, bagMode: true })
            }
            onItem={(item) => setScreen({ kind: "quick", item })}
          />
        ) : (
          <Settings
            state={state}
            repo={repository}
            commit={commit}
            syncStatus={syncStatus}
            offlineReady={offline}
            onMessage={announce}
          />
        )}
      </main>
      {screen?.kind === "event" && (
        <EventEditor
          state={state}
          source={screen.source}
          day={screen.day}
          commit={commit}
          onClose={() => setScreen(null)}
        />
      )}
      {screen?.kind === "quick" && (
        <QuickEditor
          state={state}
          repo={repository}
          commit={commit}
          item={screen.item}
          bag={screen.bag}
          bagMode={screen.bagMode}
          initialBagId={screen.bagId}
          onClose={() => setScreen(null)}
          onBagCreated={(id) => openContents(id)}
        />
      )}
      {screen?.kind === "contents" && (
        <BagContents
          state={state}
          repo={repository}
          commit={commit}
          initialBag={screen.bagId}
          event={screen.event}
          onClose={() => setScreen(null)}
          onQuick={(bagId) => setScreen({ kind: "quick", bagId })}
        />
      )}
      {screen?.kind === "detail" && (
        <Modal title={screen.event.title} onClose={() => setScreen(null)}>
          <div className="form-body event-detail">
            <p>
              {dayLabel(screen.event.startAt)} ·{" "}
              {screen.event.allDay ? "終日" : screen.event.startAt.slice(11)}
              {screen.event.endAt
                ? ` 〜 ${screen.event.allDay ? dayLabel(C.addDays(screen.event.endAt, -1)) : screen.event.endAt.slice(0, 10) !== screen.event.startAt.slice(0, 10) ? `${dayLabel(screen.event.endAt)} ${screen.event.endAt.slice(11)}` : screen.event.endAt.slice(11)}`
                : ""}
            </p>
            <BagBadge bag={C.bagById(state, screen.event.plan.bagId)} />
            {screen.event.categoryId && (
              <span className="chip">
                {
                  C.active(state.categories).find(
                    (c) => c.id === screen.event.categoryId,
                  )?.name
                }
              </span>
            )}
            {screen.event.plan.bagId && (
              <>
                <h3>今回の必要セット</h3>
                <div className="chips">
                  {C.requiredItems(state, screen.event.plan).map((item) => (
                    <span className="chip" key={item.id}>
                      {item.name}
                      <small>{C.locationName(state, item.location)}</small>
                    </span>
                  ))}
                </div>
                <button
                  className="button primary"
                  onClick={() =>
                    openContents(screen.event.plan.bagId!, screen.event)
                  }
                >
                  バッグの中身・準備を見る
                </button>
              </>
            )}
            {screen.event.plan.temporaryItems.length > 0 && (
              <>
                <h3>今回だけ</h3>
                <p>{screen.event.plan.temporaryItems.join("・")}</p>
              </>
            )}
            {screen.event.memo && <p className="memo">{screen.event.memo}</p>}
            {screen.event.isRule && (
              <p>
                曜日ごとのバッグ割当です。この日にバッグ付きの予定を入れると置き換わります。
              </p>
            )}
          </div>
          <footer className="modal-footer">
            <button
              className="button secondary"
              onClick={() => setScreen(null)}
            >
              閉じる
            </button>
            <button
              className="button primary"
              onClick={() =>
                screen.event.isRule
                  ? go("settings")
                  : setScreen({
                      kind: "event",
                      source: screen.event,
                      day: screen.event.startAt.slice(0, 10),
                    })
              }
            >
              {screen.event.isRule ? "曜日ルールを編集" : "編集する"}
            </button>
          </footer>
        </Modal>
      )}
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          {undo && (
            <button
              onClick={() => {
                if (current.current?.revision !== undo.revision) {
                  announce("後の変更があるため、元には戻せません。");
                  return;
                }
                void commit((s) => {
                  const revision = s.revision;
                  Object.assign(s, undo.state, { revision });
                }, "元に戻しました");
              }}
            >
              <Undo2 size={16} />
              元に戻す
            </button>
          )}
          <button
            aria-label="メッセージを閉じる"
            onClick={() => setMessage("")}
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
function ArrowIcon() {
  return <Check size={17} />;
}
