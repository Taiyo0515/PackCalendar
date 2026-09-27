import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Backpack, Settings as Gear } from "lucide-react";
import { validate } from "../core/model";
import type { State } from "../core/model";
import { advance } from "../core/prep";
import { notices, widgetData } from "../core/schedule";
import { ConflictError, Store, photoBlob } from "../platform/store";
import type { Photo } from "../platform/store";
import { backupDaily, isNative, syncAppearance, syncNotices, syncWidget } from "../platform";
import { Toast, photoURL, useMedia } from "./kit";
import type { ToastState } from "./kit";
import { CalendarScreen } from "./Calendar";
import { DaySheet } from "./DaySheet";
import { EventView } from "./EventView";
import { EventEditor } from "./EventEditor";
import { Things } from "./Things";
import { BagView } from "./BagView";
import { ItemEditor } from "./ItemEditor";
import { BagEditor } from "./BagEditor";
import { SettingsScreen } from "./Settings";

export type Screen =
  | { type: "day"; day: string }
  | { type: "event"; key: string }
  | { type: "edit"; key: string | null; day: string }
  | { type: "bag"; bagId: string; unitKey?: string }
  | { type: "item"; itemId: string | null }
  | { type: "bagEdit"; bagId: string | null };
type Tab = "cal" | "things" | "settings";

interface Ctx {
  state: State;
  now: Date;
  photos: Record<string, string>;
  wide: boolean;
  store: Store;
  commit: (change: (s: State) => void, opts?: { toast?: string; undo?: boolean; photos?: Photo[] }) => boolean;
  replaceAll: (s: State, photos: Photo[]) => Promise<void>;
  open: (s: Screen) => void;
  close: (n?: number) => void;
  closeAll: () => void;
  say: (text: string) => void;
}
const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

const store = new Store(new URL("./", location.href).pathname);

export default function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("cal");
  const [stack, setStack] = useState<Screen[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const wide = useMedia("(min-width: 900px)");
  const current = useRef<State | null>(null);
  const savedRev = useRef(0);
  const queue = useRef(Promise.resolve());
  const pending = useRef(0);

  const say = useCallback((text: string, undo?: () => void) => setToast({ text, undo, id: Date.now() }), []);

  const adopt = useCallback((s: State) => {
    current.current = s;
    savedRev.current = s.revision;
    setState(s);
  }, []);

  // Load, then follow changes made in other tabs.
  useEffect(() => {
    let stop = () => {};
    (async () => {
      try {
        const s = await store.load();
        const urls: Record<string, string> = {};
        for (const p of await store.photos.toArray()) urls[p.id] = photoURL(p.id, photoBlob(p))!;
        setPhotos(urls);
        const next = structuredClone(s);
        const moved = advance(next);
        adopt(moved ? await store.save(next) : s);
        stop = store.watch((external) => {
          if (!pending.current && external.revision > savedRev.current) adopt(external);
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => stop();
  }, [adopt]);

  const persist = useCallback(
    (next: State, newPhotos: Photo[] = []) => {
      pending.current++;
      queue.current = queue.current.then(async () => {
        try {
          const saved = await store.save({ ...next, revision: savedRev.current }, newPhotos);
          savedRev.current = saved.revision;
          if (current.current === next) current.current = { ...next, revision: saved.revision };
        } catch (e) {
          const fresh = await store.load();
          adopt(fresh);
          say(e instanceof ConflictError ? "別の画面で更新されたため、最新の内容を表示しました" : "保存できませんでした");
        } finally {
          pending.current--;
        }
      });
      return queue.current;
    },
    [adopt, say],
  );

  const commit = useCallback<Ctx["commit"]>(
    (change, opts = {}) => {
      const before = current.current;
      if (!before) return false;
      const next = structuredClone(before);
      try {
        change(next);
        validate(next);
      } catch (e) {
        say(e instanceof Error ? e.message : "保存できませんでした");
        return false;
      }
      current.current = next;
      setState(next);
      if (opts.photos?.length) {
        setPhotos((old) => {
          const copy = { ...old };
          for (const p of opts.photos!) copy[p.id] = photoURL(p.id, photoBlob(p))!;
          return copy;
        });
      }
      void persist(next, opts.photos);
      if (opts.toast)
        say(
          opts.toast,
          opts.undo
            ? () => {
                const restored = { ...before, revision: current.current!.revision };
                current.current = restored;
                setState(restored);
                void persist(restored);
              }
            : undefined,
        );
      return true;
    },
    [persist, say],
  );

  const replaceAll = useCallback(
    async (s: State, list: Photo[]) => {
      await queue.current;
      const saved = await store.replace(s, list);
      const urls: Record<string, string> = {};
      for (const p of list) urls[p.id] = photoURL(p.id, photoBlob(p))!;
      setPhotos(urls);
      adopt(saved);
    },
    [adopt],
  );

  // Clock: refresh the view and record passed preparations.
  useEffect(() => {
    const tick = () => {
      const t = new Date();
      setNow(t);
      const s = current.current;
      if (!s) return;
      const probe = structuredClone(s);
      if (advance(probe, t) > 0) commit((x) => void advance(x, t));
    };
    const id = setInterval(tick, 60000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [commit]);

  // Appearance.
  const theme = state?.settings.theme ?? "system";
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    void syncAppearance(theme);
  }, [theme]);

  // Notifications, widget and backup follow the saved state.
  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => {
      const at = new Date();
      syncNotices(store, notices(state, at)).catch((e) => say(e instanceof Error ? e.message : String(e)));
      if (isNative) {
        void syncWidget(JSON.stringify(widgetData(state, at)));
        void backupDaily(store, () => store.exportJSON(state)).catch(() => undefined);
      }
    }, 800);
    return () => clearTimeout(t);
  }, [state, say]);

  // Escape closes the top sheet wherever the focus is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      setStack((x) => (x.length ? x.slice(0, -1) : x));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  // Notification taps land on #home.
  useEffect(() => {
    const onHash = () => {
      if (location.hash === "#home") {
        setTab("cal");
        setStack([]);
        history.replaceState(null, "", location.pathname);
      }
    };
    onHash();
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const ctx = useMemo<Ctx | null>(
    () =>
      state && {
        state,
        now,
        photos,
        wide,
        store,
        commit,
        replaceAll,
        open: (s) => setStack((x) => [...x, s]),
        close: (n = 1) => setStack((x) => x.slice(0, -n)),
        closeAll: () => setStack([]),
        say: (text) => say(text),
      },
    [state, now, photos, wide, commit, replaceAll, say],
  );

  if (error)
    return (
      <div className="app">
        <p className="error" style={{ padding: 24 }}>
          {error}
        </p>
      </div>
    );
  if (!ctx) return <div className="app" />;

  const tabs: [Tab, string, typeof CalendarDays][] = [
    ["cal", "カレンダー", CalendarDays],
    ["things", "持ち物", Backpack],
    ["settings", "設定", Gear],
  ];
  return (
    <AppCtx.Provider value={ctx}>
      <div className="app">
        <main className="main">
          {tab === "cal" && <CalendarScreen />}
          {tab === "things" && <Things />}
          {tab === "settings" && <SettingsScreen />}
        </main>
        <nav className="tabs" aria-label="タブ">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              className="tab"
              aria-current={tab === id ? "page" : undefined}
              onClick={() => {
                setTab(id);
                setStack([]);
              }}
            >
              <Icon size={24} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </nav>
        {stack.map((s, i) => (
          <ScreenView key={i} screen={s} />
        ))}
        <Toast toast={toast} onDone={() => setToast(null)} />
      </div>
    </AppCtx.Provider>
  );
}

function ScreenView({ screen }: { screen: Screen }) {
  switch (screen.type) {
    case "day":
      return <DaySheet day={screen.day} />;
    case "event":
      return <EventView occKey={screen.key} />;
    case "edit":
      return <EventEditor occKey={screen.key} day={screen.day} />;
    case "bag":
      return <BagView bagId={screen.bagId} unitKey={screen.unitKey} />;
    case "item":
      return <ItemEditor itemId={screen.itemId} />;
    case "bagEdit":
      return <BagEditor bagId={screen.bagId} />;
  }
}
