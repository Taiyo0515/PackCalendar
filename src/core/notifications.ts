import {
  addDays,
  advanceAutomatic,
  bagById,
  dateKey,
  groupUnits,
  groupedLines,
  occurrencesBetween,
  moveItems,
  unitActions,
} from "./domain";
import type { State } from "./model";
export interface ScheduledNotification {
  id: string;
  at: string;
  title: string;
  body: string;
  url: string;
}
export interface NotificationScheduler {
  sync(schedule: ScheduledNotification[]): Promise<void>;
  disable(): Promise<void>;
}
export function shortText(value: string, maxBytes: number) {
  const encoder = new TextEncoder();
  if (encoder.encode(value).length <= maxBytes) return value;
  let result = "",
    bytes = 0;
  for (const char of value) {
    bytes += encoder.encode(char).length;
    if (bytes > maxBytes - 36) break;
    result += char;
  }
  return result + "…詳細はアプリで";
}
export function buildSchedule(
  input: State,
  now = new Date(),
): ScheduledNotification[] {
  if (!input.settings.reminders.enabled) return [];
  const s = structuredClone(input);
  advanceAutomatic(s, now);
  const until = new Date(now.getTime() + 14 * 86400000);
  const events = occurrencesBetween(
    s,
    dateKey(now),
    addDays(dateKey(until), 1),
  ).filter((e) => new Date(e.startAt) > now && new Date(e.startAt) <= until);
  const result: ScheduledNotification[] = [];
  for (const unit of groupUnits(s, events)) {
    const lines = groupedLines(s, unit),
      day = unit.event.startAt.slice(0, 10),
      bag = bagById(s, unit.event.plan.bagId)!;
    if (lines.length) {
      const body = `${bag.name}へ。${lines.map((l) => `${l.label}：${l.names.join("・")}`).join("。")}${s.settings.autoComplete ? `。${unit.event.startAt.slice(11)}を過ぎると準備済みとして記録します。` : ""}`;
      const times: [string, string | null][] = [
        [
          "evening",
          s.settings.reminders.evening
            ? `${addDays(day, -1)}T${s.settings.reminders.evening}`
            : null,
        ],
        [
          "morning",
          s.settings.reminders.morning
            ? `${day}T${s.settings.reminders.morning}`
            : null,
        ],
      ];
      for (const [kind, stamp] of times)
        if (stamp && new Date(stamp) > now && stamp < unit.event.startAt)
          result.push({
            id: `${unit.event.key}:${kind}`,
            at: new Date(stamp).toISOString(),
            title: shortText(
              `${kind === "evening" ? "明日" : "今日"}の準備 · ${unit.event.title}`,
              240,
            ),
            body: shortText(body, 2400),
            url: "#home",
          });
    }
    if (s.settings.autoComplete)
      moveItems(
        s,
        unitActions(s, unit).map((a) => a.item.id),
        unit.event.plan.bagId,
        { source: "auto", at: new Date(unit.event.startAt), event: unit.event },
      );
  }
  return result.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 60);
}
