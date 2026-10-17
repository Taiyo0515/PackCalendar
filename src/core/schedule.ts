import { addDays, dayKey, hm, monthGrid, relativeDay, stamp, toTime } from "./date";
import { visibleOnDay } from "./calendar";
import { holidayName } from "./holidays";
import { BAG_COLORS, NEUTRAL } from "./model";
import type { State } from "./model";
import { applyMove, bagOf, linesOf, unitMoves, unitsBetween } from "./prep";
import type { Line, Unit } from "./prep";

export interface Forecast {
  unit: Unit;
  lines: Line[];
}

/** Walks upcoming preparations, assuming each is completed at its start and return-type items go home at the day's end. */
export function forecast(input: State, now: Date, days = 14): Forecast[] {
  const s = structuredClone(input);
  const until = new Date(now.getTime() + days * 86400000);
  const nowStamp = stamp(now),
    toStamp = stamp(until);
  // Include past units so that an ongoing take-home item's return counts into later predictions.
  const moves = unitMoves(unitsBetween(s, new Date(now.getTime() - 30 * 86400000), until));
  const out: Forecast[] = [];
  for (const e of moves) {
    // Only the future is simulated: live positions already reflect everything before now.
    if (e.t <= nowStamp || e.t >= toStamp) continue;
    if (e.start && e.unit.start > nowStamp) out.push({ unit: e.unit, lines: linesOf(s, e.unit) });
    if (s.settings.auto) applyMove(s, e, true);
  }
  return out;
}

export const joinLines = (lines: Line[]) =>
  lines.map((l) => `${l.label} ${l.names.join("・")}`).join("／");

export interface Notice {
  id: string;
  at: string;
  title: string;
  body: string;
  url: "#home";
}

function clip(text: string, max: number) {
  return [...text].length <= max ? text : `${[...text].slice(0, max - 1).join("")}…`;
}

export function notices(s: State, now = new Date()): Notice[] {
  const r = s.settings.remind;
  if (!r.on) return [];
  const out: Notice[] = [];
  for (const { unit, lines } of forecast(s, now)) {
    const moves = lines.filter((l) => l.kind !== "extra" || l.names.length);
    if (!moves.length) continue;
    const day = unit.start.slice(0, 10);
    const bag = bagOf(s, unit.bagId)!;
    const body = clip(`${bag.name}｜${joinLines(lines)}`, 400);
    const slots: [string, string, string | null][] = [
      ["evening", "明日", r.evening ? `${addDays(day, -1)}T${r.evening}` : null],
      ["morning", "今日", r.morning ? `${day}T${r.morning}` : null],
    ];
    for (const [kind, when, at] of slots) {
      if (!at || at >= unit.start || toTime(at) <= now) continue;
      out.push({
        id: `${unit.key}:${kind}`,
        at: toTime(at).toISOString(),
        title: clip(`${when} ${unit.start.endsWith("T00:00") ? "" : hm(unit.start) + " "}${unit.title}`, 80),
        body,
        url: "#home",
      });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at)).slice(0, 60);
}

export interface WidgetData {
  v: 1;
  theme: State["settings"]["widgetTheme"];
  weekStart: 0 | 1;
  generatedAt: string;
  units: { start: string; title: string; bag: string; color: string; lines: { label: string; names: string }[] }[];
  days: Record<string, { t: string; c: string }[]>;
  holidays: Record<string, string>;
}

export function widgetData(s: State, now = new Date()): WidgetData {
  const units = forecast(s, now).map(({ unit, lines }) => {
    const bag = bagOf(s, unit.bagId)!;
    return {
      start: unit.start,
      title: unit.title,
      bag: bag.name,
      color: BAG_COLORS[bag.color],
      lines: lines.map((l) => ({ label: l.label, names: l.names.join("・") })),
    };
  });
  const days: WidgetData["days"] = {};
  const holidays: WidgetData["holidays"] = {};
  const month = dayKey(now).slice(0, 7);
  const cover = new Set<string>();
  for (let m = 0; m < 3; m++) {
    const d = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1 + m, 1, 12);
    for (const day of monthGrid(dayKey(d).slice(0, 7), s.settings.weekStart)) cover.add(day);
  }
  for (const day of [...cover].sort()) {
    const list = visibleOnDay(s, day).map((o) => ({
      t: o.title,
      c: o.plan.bagId && bagOf(s, o.plan.bagId) ? BAG_COLORS[bagOf(s, o.plan.bagId)!.color] : NEUTRAL,
    }));
    if (list.length) days[day] = list.slice(0, 6);
    const h = s.settings.holidays ? holidayName(day) : null;
    if (h) holidays[day] = h;
  }
  return {
    v: 1,
    theme: s.settings.widgetTheme,
    weekStart: s.settings.weekStart,
    generatedAt: now.toISOString(),
    units: units.slice(0, 30),
    days,
    holidays,
  };
}

/** "明日 9:00" style label for the prep card. */
export const whenLabel = (start: string, now: Date) =>
  `${relativeDay(start.slice(0, 10), now)} ${start.endsWith("T00:00") ? "" : hm(start)}`.trim();
