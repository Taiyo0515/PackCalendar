import { useEffect, useRef, useState } from "react";
import { emptyState } from "../core/model";
import type { Settings, Theme } from "../core/model";
import { isNative } from "../platform";
import { parseBackup } from "../platform/store";
import { useApp } from "./App";
import { Segment, Switch } from "./kit";

const THEMES: [Theme, string][] = [
  ["system", "自動"],
  ["light", "ライト"],
  ["dark", "ダーク"],
];

export function SettingsScreen() {
  const { state, store, commit, replaceAll, say } = useApp();
  const st = state.settings;
  const set = (change: (s: Settings) => void) => commit((s) => change(s.settings));
  const [connected, setConnected] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wipe, setWipe] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [widget, setWidget] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative) return;
    const t = setTimeout(async () => setWidget(await (await import("../platform/native")).widgetProblem()), 1500);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (isNative) return setConnected(true);
    void import("../platform/push").then(async (p) => setConnected(await p.pushConnected(store)));
  }, [store]);

  const toggleRemind = async (on: boolean) => {
    if (!on) {
      set((s) => void (s.remind.on = false));
      if (!isNative) {
        await (await import("../platform/push")).disconnectPush(store);
        setConnected(false);
      }
      return;
    }
    if (isNative) {
      const ok = await (await import("../platform/native")).notifyPermission(true);
      if (!ok) return say("通知が許可されていません");
    } else if (!connected) {
      return set((s) => void (s.remind.on = true));
    }
    set((s) => void (s.remind.on = true));
  };

  const connect = async () => {
    setBusy(true);
    try {
      await (await import("../platform/push")).connectPush(store, code.trim());
      setConnected(true);
      setCode("");
      commit((s) => void (s.settings.remind.on = true), { toast: "通知を接続しました" });
    } catch (e) {
      say(e instanceof Error ? e.message : "接続できませんでした");
    } finally {
      setBusy(false);
    }
  };

  const clock = (key: "evening" | "morning", label: string) => {
    const value = st.remind[key];
    return (
      <div className="row">
        <span className="main-text">{label}</span>
        {value !== null && (
          <input
            type="time"
            className="pill num"
            aria-label={`${label}の時刻`}
            value={value}
            onChange={(e) => e.target.value && set((s) => void (s.remind[key] = e.target.value))}
          />
        )}
        <Switch
          on={value !== null}
          label={label}
          onChange={(v) => set((s) => void (s.remind[key] = v ? (key === "evening" ? "21:00" : "07:00") : null))}
        />
      </div>
    );
  };

  const exportData = async () => {
    const json = await store.exportJSON(state);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    a.download = `PackCalendar-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  return (
    <>
      <header className="head">
        <h1 className="title">設定</h1>
      </header>
      <div className="scroll">
        <div className="page">
          <div className="section" style={{ marginTop: 4 }}>
            外観
          </div>
          <div className="group plain">
            <div className="row">
              <span className="main-text">アプリ</span>
              <Segment label="アプリの外観" value={st.theme} options={THEMES} onChange={(v) => set((s) => void (s.theme = v))} />
            </div>
            {isNative && (
              <div className="row">
                <span className="main-text">ウィジェット</span>
                <Segment
                  label="ウィジェットの外観"
                  value={st.widgetTheme}
                  options={THEMES}
                  onChange={(v) => set((s) => void (s.widgetTheme = v))}
                />
              </div>
            )}
          </div>
          {widget && <p className="error">{widget}</p>}

          <div className="section">カレンダー</div>
          <div className="group plain">
            <div className="row">
              <span className="main-text">週の始まり</span>
              <Segment
                label="週の始まり"
                value={st.weekStart}
                options={[
                  [0, "日曜"],
                  [1, "月曜"],
                ]}
                onChange={(v) => set((s) => void (s.weekStart = v))}
              />
            </div>
            <div className="row">
              <span className="main-text">祝日</span>
              <Switch label="祝日" on={st.holidays} onChange={(v) => set((s) => void (s.holidays = v))} />
            </div>
          </div>

          <div className="section">準備</div>
          <div className="group plain">
            <div className="row">
              <span className="main-text">予定の時刻に準備済みにする</span>
              <Switch
                label="予定の時刻に準備済みにする"
                on={st.auto}
                onChange={(v) =>
                  commit((s) => {
                    s.settings.auto = v;
                    s.cursor = new Date().toISOString();
                  })
                }
              />
            </div>
          </div>

          <div className="section">通知</div>
          <div className="group plain">
            <div className="row">
              <span className="main-text">通知</span>
              <Switch label="通知" on={st.remind.on} onChange={(v) => void toggleRemind(v)} />
            </div>
            {st.remind.on && connected === false && (
              <div className="row">
                <input
                  className="code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="招待コード"
                  aria-label="招待コード"
                  autoComplete="off"
                />
                <button className="text-btn" disabled={!code.trim() || busy} onClick={() => void connect()}>
                  接続
                </button>
              </div>
            )}
            {st.remind.on && connected && (
              <>
                {clock("evening", "前日")}
                {clock("morning", "当日")}
              </>
            )}
          </div>

          <div className="section">データ</div>
          <div className="group plain">
            <button className="row" onClick={() => void exportData()}>
              <span className="main-text">書き出す</span>
            </button>
            <button className="row" onClick={() => fileRef.current?.click()}>
              <span className="main-text">読み込む</span>
            </button>
            <button
              className="row"
              style={{ color: "var(--red)" }}
              onClick={async () => {
                if (!wipe) return setWipe(true);
                setWipe(false);
                await replaceAll(emptyState(), []);
                say("すべて削除しました");
              }}
              onBlur={() => setWipe(false)}
            >
              <span className="main-text">{wipe ? "もう一度押すと削除します" : "すべて削除"}</span>
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              try {
                const { state: next, photos } = await parseBackup(await file.text());
                if (!confirm(`予定${next.events.length}件・バッグ${next.bags.length}件・持ち物${next.items.length}件で置き換えます`)) return;
                await replaceAll(next, photos);
                say("読み込みました");
              } catch (err) {
                say(err instanceof Error ? err.message : "読み込めませんでした");
              }
            }}
          />
          <p className="version num">PackCalendar {__APP_VERSION__}</p>
        </div>
      </div>
    </>
  );
}
