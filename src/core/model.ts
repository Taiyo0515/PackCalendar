import { z } from "zod";
import { isValidDay, isValidStamp } from "./date";

export const BAG_COLORS = {
  green: "#1E9E6A",
  blue: "#2F6FDF",
  orange: "#D9730D",
  purple: "#7E57C2",
  pink: "#D6457F",
  teal: "#0F8F8C",
  brown: "#8A6A4A",
} as const;
export type BagColor = keyof typeof BAG_COLORS;
export const NEUTRAL = "#8E8E93";
export const HOME = "home";
export const WORN = "worn";

/** Calendars an event can belong to. */
export const CALENDARS = ["main", "fixed"] as const;
export type CalendarId = (typeof CALENDARS)[number];
/** The fixed calendar holds standing commitments such as university classes. */
export const CALENDAR_NAMES: Record<CalendarId, string> = {
  main: "通常",
  fixed: "固定の用事",
};

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const name = z.string().trim().min(1).max(200);
const day = z.string().refine(isValidDay);
const time = z.string().refine(isValidStamp);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const ids = z.array(id).max(5000);
const theme = z.enum(["system", "light", "dark"]);
const calendarId = z.enum(CALENDARS);

export const bagSchema = z.object({
  id,
  name,
  color: z.enum(Object.keys(BAG_COLORS) as [BagColor, ...BagColor[]]),
  itemIds: ids,
});
export const itemSchema = z.object({
  id,
  name,
  photoId: id.nullable(),
  at: id.nullable(),
  atTime: z.string().refine((s) => Number.isFinite(Date.parse(s))),
  /** "Put it back home once the day's use is over." */
  return: z.boolean().default(false),
});
export const planSchema = z.object({
  bagId: id.nullable(),
  add: ids,
  remove: ids,
  extra: z.array(name).max(50),
});
export const repeatSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly"]),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  until: day.nullable(),
});
/**
 * Special per-event notification offset chosen in the editor, added to the event's start.
 * Timed events: negative = before the start (-60 = one hour before, -1440 = the day before).
 * All-day events: offset from the start day 00:00 (480 = that morning 8:00, -240 = 20:00 the day before).
 */
const alertOffset = z.number().int().min(-1440).max(20160).nullable();
export const eventSchema = z.object({
  id,
  title: name,
  start: time,
  end: time.nullable(),
  allDay: z.boolean(),
  memo: z.string().max(10000),
  calendar: calendarId.default("main"),
  plan: planSchema,
  repeat: repeatSchema.nullable(),
  alert: alertOffset.default(null),
});
export const patchSchema = z
  .object({
    title: name,
    start: time,
    end: time.nullable(),
    allDay: z.boolean(),
    memo: z.string().max(10000),
    calendar: calendarId,
    plan: planSchema.partial(),
    alert: alertOffset,
  })
  .partial();
export const exceptionSchema = z.object({
  deleted: z.boolean(),
  patch: patchSchema,
});
export const settingsSchema = z.object({
  weekStart: z.union([z.literal(0), z.literal(1)]),
  holidays: z.boolean(),
  auto: z.boolean(),
  theme,
  widgetTheme: theme,
  hidden: z.array(calendarId).max(CALENDARS.length).default(["fixed"]),
  remind: z.object({
    on: z.boolean(),
    evening: clock.nullable(),
    morning: clock.nullable(),
  }),
});
export const stateSchema = z.object({
  version: z.literal(3),
  revision: z.number().int().nonnegative(),
  bags: z.array(bagSchema).max(500),
  items: z.array(itemSchema).max(5000),
  events: z.array(eventSchema).max(20000),
  exceptions: z.record(z.string().max(200), exceptionSchema),
  settings: settingsSchema,
  cursor: z.string().refine((s) => Number.isFinite(Date.parse(s))),
});

export type Bag = z.infer<typeof bagSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Repeat = z.infer<typeof repeatSchema>;
export type Event = z.infer<typeof eventSchema>;
export type Patch = z.infer<typeof patchSchema>;
export type Exception = z.infer<typeof exceptionSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Theme = Settings["theme"];
export type State = z.infer<typeof stateSchema>;
/** One day of an event after repetition and exceptions are applied. */
export type Occurrence = Event & { key: string; baseId: string; date: string };

/** Whether the calendar's events belong in the calendar views (month, day list, widget). */
export const showsCalendar = (s: State, calendar: CalendarId) => !s.settings.hidden.includes(calendar);

export const newId = () => crypto.randomUUID();
export const emptyPlan = (): Plan => ({
  bagId: null,
  add: [],
  remove: [],
  extra: [],
});
export function emptyState(now = new Date()): State {
  return {
    version: 3,
    revision: 0,
    bags: [],
    items: [],
    events: [],
    exceptions: {},
    settings: {
      weekStart: 0,
      holidays: true,
      auto: true,
      theme: "system",
      widgetTheme: "system",
      hidden: ["fixed"],
      remind: { on: false, evening: "21:00", morning: "07:00" },
    },
    cursor: now.toISOString(),
  };
}

/** Structural and referential validation. Throws a readable error. */
export function validate(input: unknown): State {
  const parsed = stateSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`データを読み込めません（${issue?.path.join(".")}）`);
  }
  const s = parsed.data;
  const fail = (what: string): never => {
    throw new Error(`データを読み込めません（${what}）`);
  };
  const unique = (list: { id: string }[], what: string) => {
    if (new Set(list.map((x) => x.id)).size !== list.length) fail(what);
  };
  unique(s.bags, "バッグ");
  unique(s.items, "持ち物");
  unique(s.events, "予定");
  const bagIds = new Set(s.bags.map((b) => b.id));
  const itemIds = new Set(s.items.map((i) => i.id));
  for (const b of s.bags)
    if (b.itemIds.some((i) => !itemIds.has(i))) fail("基本セット");
  for (const i of s.items)
    if (i.at !== null && i.at !== HOME && i.at !== WORN && !bagIds.has(i.at))
      fail("位置");
  const checkPlan = (p: Partial<Plan>) => {
    if (p.bagId && !bagIds.has(p.bagId)) fail("予定のバッグ");
    if ([...(p.add ?? []), ...(p.remove ?? [])].some((i) => !itemIds.has(i)))
      fail("予定の持ち物");
  };
  for (const e of s.events) {
    checkPlan(e.plan);
    if (e.end && e.end <= e.start) fail("予定の時刻");
  }
  for (const [k, x] of Object.entries(s.exceptions)) {
    if (!s.events.some((e) => k.startsWith(`${e.id}@`))) fail("予定の変更");
    if (x.patch.plan) checkPlan(x.patch.plan);
  }
  return s;
}
