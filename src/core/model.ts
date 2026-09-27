import { z } from "zod";

export const COLORS = ["sage", "sand", "blue", "rose", "plum"] as const;
export const ICONS = [
  "bag",
  "wallet",
  "key",
  "laptop",
  "phone",
  "book",
  "headphones",
  "bottle",
  "item",
] as const;
export const id = () => crypto.randomUUID();
export const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d: Date) =>
  `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const dateAt = (s: string) => new Date(`${s.slice(0, 10)}T12:00:00`);
export function addDays(s: string, n: number) {
  const d = dateAt(s);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export const dayDiff = (a: string, b: string) =>
  (Date.parse(`${b.slice(0, 10)}T00:00:00Z`) -
    Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) /
  86400000;
const key = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/)
  .max(100);
const title = z.string().trim().min(1).max(200);
// New input is limited to 10,000 chars by the UI; old tag annotations may be longer.
const memo = z.string().max(2100000);
export const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) => s >= "1900-01-01" && s <= "2200-12-31" && dateKey(dateAt(s)) === s,
    "日付が正しくありません",
  );
const wallTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/)
  .refine(
    (s) => daySchema.safeParse(s.slice(0, 10)).success,
    "日時が正しくありません",
  );
// Domain recurrence follows the local calendar. Persistence records its offset too.
export const timeSchema = z
  .union([
    wallTime,
    z
      .string()
      .regex(
        /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d[+-](0\d|1[0-4]):[0-5]\d$/,
      )
      .refine(
        (s) =>
          wallTime.safeParse(s.slice(0, 16)).success &&
          Number.isFinite(Date.parse(s)),
      ),
  ])
  .transform((s) => s.slice(0, 16));
const instant = z.iso.datetime({ offset: true });
const entity = { updatedAt: instant, deletedAt: instant.nullable() };
export const entityStamp = (now = new Date()) => ({
  updatedAt: now.toISOString(),
  deletedAt: null,
});
const ids = z
  .array(key)
  .max(10000)
  .refine((a) => new Set(a).size === a.length, "IDが重複しています");
const weekdays = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .refine((a) => new Set(a).size === a.length);
export const locationSchema = z
  .object({
    containerId: key.nullable(),
    updatedAt: instant,
    moveId: key.nullable(),
  })
  .strict();
export const containerSchema = z
  .object({
    id: key,
    kind: z.enum(["bag", "place", "worn"]),
    name: title,
    memo,
    color: z.enum(COLORS),
    imageId: key.nullable(),
    itemIds: ids,
    ...entity,
  })
  .strict();
export const itemSchema = z
  .object({
    id: key,
    name: title,
    memo,
    icon: z.enum(ICONS),
    imageId: key.nullable(),
    location: locationSchema,
    ...entity,
  })
  .strict();
export const categorySchema = z
  .object({ id: key, name: title, defaultBagId: key.nullable(), ...entity })
  .strict();
export const packPlanSchema = z
  .object({
    bagId: key.nullable(),
    addedItemIds: ids,
    removedItemIds: ids,
    temporaryItems: z.array(title).max(100),
  })
  .strict();
const editable = {
  title,
  startAt: timeSchema,
  endAt: timeSchema.nullable(),
  allDay: z.boolean(),
  categoryId: key.nullable(),
  memo,
  plan: packPlanSchema,
};
export const eventSchema = z
  .object({
    id: key,
    ...editable,
    recurrence: z.enum(["none", "daily", "weekly", "monthly"]),
    weekdays,
    until: daySchema.nullable(),
    createdAt: instant,
    ...entity,
  })
  .strict();
export const changesSchema = z
  .object({ ...editable, plan: packPlanSchema.partial() })
  .partial()
  .strict();
export const overrideSchema = z
  .object({
    id: key,
    eventId: key,
    date: daySchema,
    deleted: z.boolean(),
    changes: changesSchema,
    ...entity,
  })
  .strict();
export const ruleSchema = z
  .object({
    id: key,
    name: title,
    bagId: key,
    weekdays,
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    enabled: z.boolean(),
    from: daySchema,
    ...entity,
  })
  .strict();
export const moveSchema = z
  .object({
    id: key,
    itemId: key,
    itemName: title,
    from: locationSchema,
    to: locationSchema,
    at: instant,
    source: z.enum(["prep", "manual", "auto", "forgot", "undo", "initial"]),
    eventKey: z.string().max(240).nullable(),
    eventTitle: z.string().max(200).nullable(),
    undone: z.boolean(),
    ...entity,
  })
  .strict();
export const settingsSchema = z
  .object({
    weekStart: z.union([z.literal(0), z.literal(1)]),
    onboarded: z.boolean(),
    sample: z.boolean(),
    autoComplete: z.boolean(),
    autoCursor: instant,
    reminders: z
      .object({
        enabled: z.boolean(),
        evening: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable(),
        morning: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable(),
      })
      .strict(),
  })
  .strict();
export const stateSchema = z
  .object({
    version: z.literal(2),
    revision: z.number().int().nonnegative(),
    containers: z.array(containerSchema).max(10000),
    items: z.array(itemSchema).max(10000),
    events: z.array(eventSchema).max(10000),
    overrides: z.array(overrideSchema).max(10000),
    categories: z.array(categorySchema).max(10000),
    rules: z.array(ruleSchema).max(100),
    moves: z.array(moveSchema).max(10000),
    processed: z.array(z.string().max(240)).max(50000),
    settings: settingsSchema,
    metrics: z
      .array(
        z
          .object({
            id: key,
            at: instant,
            kind: z.literal("display"),
            unitKey: z.string().max(240),
            actionCount: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .max(10000),
  })
  .strict();
export type Location = z.infer<typeof locationSchema>;
export type Container = z.infer<typeof containerSchema>;
export type Bag = Container;
export type PackPlan = z.infer<typeof packPlanSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Event = z.infer<typeof eventSchema>;
export type Override = z.infer<typeof overrideSchema>;
export type State = z.infer<typeof stateSchema>;
export function stateForStorage(state: State): State {
  const saved = structuredClone(state);
  const offset = (value: string) => {
    const minutes = -new Date(value).getTimezoneOffset();
    return `${value}${minutes >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
  };
  for (const event of [
    ...saved.events,
    ...saved.overrides.map((o) => o.changes),
  ]) {
    if (event.startAt) event.startAt = offset(event.startAt);
    if (event.endAt) event.endAt = offset(event.endAt);
  }
  return saved;
}
export type Move = z.infer<typeof moveSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type EventChanges = z.infer<typeof changesSchema>;
export type Occurrence = Event & {
  baseId: string;
  occurrenceDate: string;
  key: string;
  isOverride: boolean;
  isRule?: boolean;
};
export const homeLocation = (now = new Date()): Location => ({
  containerId: "home",
  updatedAt: now.toISOString(),
  moveId: null,
});
export const emptyPlan = (): PackPlan => ({
  bagId: null,
  addedItemIds: [],
  removedItemIds: [],
  temporaryItems: [],
});
export function emptyState(now = new Date()): State {
  return {
    version: 2,
    revision: 0,
    containers: [
      {
        id: "home",
        kind: "place",
        name: "自宅",
        memo: "",
        color: "sage",
        imageId: null,
        itemIds: [],
        ...entityStamp(now),
      },
      {
        id: "worn",
        kind: "worn",
        name: "身につける",
        memo: "",
        color: "blue",
        imageId: null,
        itemIds: [],
        ...entityStamp(now),
      },
    ],
    items: [],
    events: [],
    overrides: [],
    categories: [],
    rules: [],
    moves: [],
    processed: [],
    metrics: [],
    settings: {
      weekStart: 1,
      onboarded: false,
      sample: false,
      autoComplete: true,
      autoCursor: now.toISOString(),
      reminders: { enabled: false, evening: "21:00", morning: "07:00" },
    },
  };
}
export function newEvent(day: string, now = new Date()): Event {
  return {
    id: id(),
    title: "",
    startAt: `${day}T09:00`,
    endAt: null,
    allDay: false,
    plan: emptyPlan(),
    categoryId: null,
    memo: "",
    recurrence: "none",
    weekdays: [dateAt(day).getDay()],
    until: null,
    createdAt: now.toISOString(),
    ...entityStamp(now),
  };
}
export function guessIcon(name: string): Item["icon"] {
  const pairs: [RegExp, Item["icon"]][] = [
    [/財布|サイフ/, "wallet"],
    [/鍵|カギ|キー/, "key"],
    [/PC|パソコン|ノートPC/i, "laptop"],
    [/スマホ|携帯|バッテリ/, "phone"],
    [/本|手帳|ノート/, "book"],
    [/イヤホン|ヘッドホン/, "headphones"],
    [/水筒|ボトル/, "bottle"],
  ];
  return pairs.find(([re]) => re.test(name))?.[1] ?? "item";
}
