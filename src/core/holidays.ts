import { addDays, pad, weekday } from "./date";

// Japanese national holidays computed locally (2000–2099).
const cache = new Map<number, Map<string, string>>();
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
/** Day of month for the n-th Monday. */
function nthMonday(y: number, m: number, n: number) {
  const first = new Date(y, m - 1, 1, 12).getDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
}
const vernal = (y: number) =>
  Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
const autumnal = (y: number) =>
  Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));

function build(y: number) {
  const base = new Map<string, string>();
  const add = (m: number, d: number, name: string) => base.set(key(y, m, d), name);
  if (y < 2000 || y > 2099) return base;
  add(1, 1, "元日");
  add(1, nthMonday(y, 1, 2), "成人の日");
  add(2, 11, "建国記念の日");
  if (y >= 2020) add(2, 23, "天皇誕生日");
  add(3, vernal(y), "春分の日");
  add(4, 29, y >= 2007 ? "昭和の日" : "みどりの日");
  add(5, 3, "憲法記念日");
  if (y >= 2007) add(5, 4, "みどりの日");
  add(5, 5, "こどもの日");
  if (y === 2020) add(7, 23, "海の日");
  else if (y === 2021) add(7, 22, "海の日");
  else if (y >= 2003) add(7, nthMonday(y, 7, 3), "海の日");
  else add(7, 20, "海の日");
  if (y === 2020) add(8, 10, "山の日");
  else if (y === 2021) add(8, 8, "山の日");
  else if (y >= 2016) add(8, 11, "山の日");
  if (y >= 2003) add(9, nthMonday(y, 9, 3), "敬老の日");
  else add(9, 15, "敬老の日");
  add(9, autumnal(y), "秋分の日");
  if (y === 2020) add(7, 24, "スポーツの日");
  else if (y === 2021) add(7, 23, "スポーツの日");
  else add(10, nthMonday(y, 10, 2), y >= 2020 ? "スポーツの日" : "体育の日");
  add(11, 3, "文化の日");
  add(11, 23, "勤労感謝の日");
  if (y <= 2018) add(12, 23, "天皇誕生日");
  if (y === 2019) {
    add(5, 1, "即位の日");
    add(10, 22, "即位礼正殿の儀");
  }
  const result = new Map(base);
  // 国民の休日: a weekday sandwiched between two holidays.
  for (const day of [...base.keys()]) {
    const next = addDays(day, 2);
    const between = addDays(day, 1);
    if (base.has(next) && !base.has(between) && weekday(between) !== 0)
      result.set(between, "国民の休日");
  }
  // 振替休日: a Sunday holiday moves to the next non-holiday day.
  for (const day of [...base.keys()].sort()) {
    if (weekday(day) !== 0) continue;
    let substitute = addDays(day, 1);
    while (result.has(substitute)) substitute = addDays(substitute, 1);
    if (substitute.startsWith(String(y))) result.set(substitute, "振替休日");
  }
  return result;
}
export function holidaysOf(year: number) {
  let map = cache.get(year);
  if (!map) cache.set(year, (map = build(year)));
  return map;
}
export const holidayName = (day: string) =>
  holidaysOf(Number(day.slice(0, 4))).get(day) ?? null;
