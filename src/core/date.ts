// Local wall-clock date helpers. Days are "YYYY-MM-DD", times are "YYYY-MM-DDTHH:mm".
export const pad = (n: number) => String(n).padStart(2, "0");
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const stamp = (d: Date) =>
  `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** Noon avoids DST edge cases when only the date matters. */
export const toDate = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00`);
export const toTime = (s: string) =>
  new Date(s.length === 10 ? `${s}T00:00:00` : `${s}:00`);
export function addDays(day: string, n: number) {
  const d = toDate(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}
export function addMinutes(s: string, n: number) {
  const d = toTime(s);
  d.setMinutes(d.getMinutes() + n);
  return stamp(d);
}
export const minutesBetween = (a: string, b: string) =>
  Math.round((toTime(b).getTime() - toTime(a).getTime()) / 60000);
export const daysBetween = (a: string, b: string) =>
  Math.round(
    (Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) -
      Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) /
      86400000,
  );
export const weekday = (day: string) => toDate(day).getDay();
export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
export const hm = (s: string) => `${Number(s.slice(11, 13))}:${s.slice(14, 16)}`;
export const monthKey = (day: string) => day.slice(0, 7);
export function addMonths(month: string, n: number) {
  const d = new Date(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
/** 42 days covering the month, starting on weekStart. */
export function monthGrid(month: string, weekStart: 0 | 1) {
  const first = `${month}-01`;
  const offset = (weekday(first) - weekStart + 7) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function jaDate(day: string, withYear = false) {
  const d = toDate(day);
  return `${withYear ? `${d.getFullYear()}年` : ""}${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`;
}
/** "今日" / "明日" / "9/30(水)" relative to now. */
export function relativeDay(day: string, now: Date) {
  const diff = daysBetween(dayKey(now), day);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  const d = toDate(day);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}
export const isValidDay = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && dayKey(toDate(s)) === s;
export const isValidStamp = (s: string) =>
  /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(s) &&
  isValidDay(s.slice(0, 10));
