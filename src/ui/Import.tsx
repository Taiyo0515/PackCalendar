// Import sheets for TimeTree (private API), Google Calendar (secret iCal) and the device calendar.
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Dto, Prepared } from "../core/import";
import { mergeImportsSync, prepareImports } from "../core/import";
import { useApp } from "./App";
import { Segment, Sheet } from "./kit";

const META = "import";
interface ImportMeta {
  invitation: string;
  cookie: string;
  calendar: string;
}

export function ImportSheet({ kind, onClose }: { kind: "timetree" | "google" | "device"; onClose: () => void }) {
  const { store, commit, say } = useApp();
  const [meta, setMeta] = useState<ImportMeta>({ invitation: "", cookie: "", calendar: "" });
  const [calendars, setCalendars] = useState<{ id: string; name: string }[]>([]);
  const [dto, setDto] = useState<Dto[] | null>(null);
  const [busy, setBusy] = useState(false);

  const title = kind === "timetree" ? "TimeTree から取り込む" : kind === "google" ? "Google カレンダーから取り込む" : "端末のカレンダーから取り込む";

  // Remember the invitation code and the TimeTree cookie for the next import.
  useEffect(() => {
    if (kind === "device") return;
    void store.getMeta<ImportMeta>(META).then((m) => m && setMeta({ ...{ invitation: "", cookie: "", calendar: "" }, ...m }));
  }, [store, kind]);

  const keep = (patch: Partial<ImportMeta>) => {
    const next = { ...meta, ...patch };
    setMeta(next);
    void store.setMeta(META, next);
  };

  const read = async () => {
    if (kind === "device") {
      setBusy(true);
      try {
        const { readDeviceCalendar } = await import("../platform/native");
        const now = new Date();
        const events = await readDeviceCalendar(new Date(now.getTime() - 366 * 86400000), new Date(now.getTime() + 730 * 86400000));
        if (!events.length) return say("取り込める予定が見つかりませんでした");
        setDto(events);
      } catch (e) {
        say(e instanceof Error ? e.message : "読めませんでした");
      } finally {
        setBusy(false);
      }
      return;
    }
    const invitation = meta.invitation.trim();
    if (!invitation) return say("取り込みコードを入力してください");
    setBusy(true);
    try {
      const r = await import("../platform/remote");
      if (kind === "timetree") {
        // The cookie must look like a session; the user copies it from their browser.
        if (!meta.cookie.includes("_session_id")) return say("Cookie（_session_id）を貼り付けてください");
        const list = await r.timeTreeCalendars(meta.cookie.trim(), invitation);
        if (!list.length) return say("カレンダーが見つかりません");
        setCalendars(list);
        keep({ calendar: meta.calendar || list[0].id });
        say(`${list.length}件のカレンダーが見つかりました`);
      } else {
        const events = await r.fetchGoogle(meta.cookie, invitation);
        if (!events.length) throw new Error("予定が見つかりませんでした");
        setDto(googleToDtos(events));
      }
    } catch (e) {
      say(e instanceof Error ? e.message : "取り込めませんでした");
    } finally {
      setBusy(false);
    }
  };

  const readEvents = async () => {
    if (kind !== "timetree") return;
    setBusy(true);
    try {
      const r = await import("../platform/remote");
      const events = await r.timeTreeEvents(meta.cookie.trim(), meta.calendar, meta.invitation.trim());
      if (!events.length) throw new Error("予定が見つかりませんでした");
      setDto(events);
    } catch (e) {
      say(e instanceof Error ? e.message : "取り込めませんでした");
    } finally {
      setBusy(false);
    }
  };

  const runImport = () => {
    const list = dto!;
    setBusy(true);
    void prepareImports(list).then((prepared: Prepared[]) => {
      let done: [number, number] = [0, 0];
      const ok = commit((s) => {
        done = mergeImportsSync(s, prepared);
      });
      if (ok) say(`取り込みました（新規${done[0]}・更新${done[1]}）`);
      onClose();
    });
  };

  return (
    <Sheet onClose={onClose} label={title}>
      <div className="sheet-head">
        <button className="icon-btn" aria-label="閉じる" onClick={onClose}>
          <X size={26} />
        </button>
        <span style={{ flex: 1 }} />
        {dto && (
          <button className="save-btn" disabled={busy} onClick={runImport}>
            取り込む
          </button>
        )}
      </div>
      <div className="sheet-body">
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>{title}</h2>
        {kind === "timetree" && (
          <>
            <input
              className="name-input"
              style={{ marginBottom: 8 }}
              value={meta.invitation}
              onChange={(e) => setMeta({ ...meta, invitation: e.target.value })}
              placeholder="取り込みコード（通知と同じ）"
              aria-label="取り込みコード"
              autoComplete="off"
            />
            <textarea
              className="name-input"
              style={{ height: 72, marginBottom: 8, resize: "none" }}
              value={meta.cookie}
              onChange={(e) => setMeta({ ...meta, cookie: e.target.value })}
              placeholder="TimeTree の Cookie（_session_id=…）"
              aria-label="TimeTreeのCookie"
            />
            <div className="buttons">
              <button className="secondary" disabled={busy || !meta.cookie.trim()} onClick={() => void read()}>
                カレンダーを読む
              </button>
            </div>
            {calendars.length > 0 && (
              <>
                <div className="section">どのカレンダー</div>
                <Segment
                  label="カレンダー"
                  value={meta.calendar || calendars[0].id}
                  options={calendars.map((c) => [c.id, c.name] as [string, string])}
                  onChange={(v) => keep({ calendar: v })}
                />
                <div className="buttons">
                  <button className="secondary" disabled={busy || !meta.calendar} onClick={() => void readEvents()}>
                    予定を読む
                  </button>
                </div>
              </>
            )}
            <p className="hint">
              TimeTree をブラウザで開き、開発者ツール（Application → Cookies）から `_session_id` の値を `_session_id=…` の形で貼り付けます。取り込んだ予定は「通常」に入り、バッグの設定は上書きしません。
            </p>
          </>
        )}
        {kind === "google" && (
          <>
            <input
              className="name-input"
              style={{ marginBottom: 8 }}
              value={meta.invitation}
              onChange={(e) => setMeta({ ...meta, invitation: e.target.value })}
              placeholder="取り込みコード（通知と同じ）"
              aria-label="取り込みコード"
              autoComplete="off"
            />
            <input
              className="name-input"
              style={{ marginBottom: 8 }}
              value={meta.cookie}
              onChange={(e) => setMeta({ ...meta, cookie: e.target.value })}
              placeholder="https://calendar.google.com/calendar/ical/…/private-…/basic.ics"
              aria-label="秘密のiCalアドレス"
              autoComplete="off"
            />
            <div className="buttons">
              <button className="secondary" disabled={busy || !meta.cookie.trim()} onClick={() => void read()}>
                予定を読む
              </button>
            </div>
            <p className="hint">
              Google カレンダーの設定 →「秘密の iCal 形式で同期」→ 秘密の iCal アドレスをコピーして貼り付けます。取り込んだ予定は「通常」に入ります。
            </p>
          </>
        )}
        {kind === "device" && (
          <>
            <div className="buttons">
              <button className="secondary" disabled={busy} onClick={() => void read()}>
                予定を読む
              </button>
            </div>
            <p className="hint">
              この端末のカレンダー（過去1年と先2年）を読み取り、「通常」に入れます。繰り返しは少し形が変わることがあります。取り込んだバッグの設定は上書きしません。
            </p>
          </>
        )}
        {dto && (
          <p style={{ marginTop: 12 }}>
            {dto.length}件の予定が見つかりました。取り込む前に確認してください。
          </p>
        )}
      </div>
    </Sheet>
  );
}

function googleToDtos(events: import("../core/ics").IcsEvent[]): Dto[] {
  return events.map((e) => ({
    uid: e.uid,
    title: e.title,
    start: e.start,
    end: e.end,
    allDay: e.allDay,
    memo: e.memo,
    repeat: e.repeat,
    gone: e.gone,
    edits: e.edits,
  }));
}
