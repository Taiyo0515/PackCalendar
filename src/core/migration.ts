import { validateState as validateLegacy } from "../legacy/core.js";
import {
  dateAt,
  emptyState,
  emptyPlan,
  entityStamp,
  id,
  validateState,
} from "./domain";
import type { Event, EventChanges, Item, State } from "./model";
import { fromDataURL } from "../platform/photos";
import type { PhotoRecord } from "../platform/photos";
interface LegacyEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  bagId: string | null;
  tagIds: string[];
  memo: string;
  recurrence: Event["recurrence"];
  until: string | null;
  addedItemIds: string[];
  removedItemIds: string[];
}
export interface LegacyState {
  revision: number;
  bags: {
    id: string;
    name: string;
    memo: string;
    color: State["containers"][number]["color"];
    image: string | null;
    itemIds: string[];
  }[];
  items: {
    id: string;
    name: string;
    memo: string;
    icon: Item["icon"];
    image: string | null;
    location: {
      type: "home" | "other" | "unknown" | "bag";
      bagId: string | null;
      updatedAt: string;
    };
  }[];
  events: LegacyEvent[];
  overrides: {
    id: string;
    eventId: string;
    date: string;
    deleted: boolean;
    changes: Partial<LegacyEvent>;
  }[];
  tags: { id: string; name: string; defaultBagId: string | null }[];
  settings: { weekStart: 0 | 1; onboarded: boolean; sample: boolean };
}
export async function migrateLegacy(
  input: unknown,
  convert: (blob: Blob) => Promise<Blob>,
  now = new Date(),
): Promise<{ state: State; photos: PhotoRecord[] }> {
  const legacy = validateLegacy(input) as LegacyState;
  const s = emptyState(now),
    photos: PhotoRecord[] = [];
  const imageId = async (data: string | null) => {
    if (!data) return null;
    const photo = { id: id(), blob: await convert(fromDataURL(data)) };
    photos.push(photo);
    return photo.id;
  };
  s.revision = legacy.revision;
  s.settings = { ...s.settings, ...legacy.settings };
  for (const { image, ...bag } of legacy.bags)
    s.containers.push({
      ...bag,
      kind: "bag",
      imageId: await imageId(image),
      ...entityStamp(now),
    });
  if (legacy.items.some((i) => i.location.type === "other"))
    s.containers.push({
      id: "legacy-other",
      kind: "place",
      name: "その他（旧版）",
      memo: "場所の名前は設定から変更できます。",
      color: "sand",
      imageId: null,
      itemIds: [],
      ...entityStamp(now),
    });
  for (const { image, location, ...item } of legacy.items)
    s.items.push({
      ...item,
      imageId: await imageId(image),
      location: {
        containerId:
          location.type === "bag"
            ? location.bagId
            : location.type === "home"
              ? "home"
              : location.type === "other"
                ? "legacy-other"
                : null,
        updatedAt: location.updatedAt,
        moveId: null,
      },
      ...entityStamp(now),
    });
  s.categories = legacy.tags.map(({ id, name, defaultBagId }) => ({
    id,
    name,
    defaultBagId,
    ...entityStamp(now),
  }));
  const fields = (e: Partial<LegacyEvent>, full: boolean): EventChanges => {
    const result: EventChanges = {};
    for (const k of ["title", "startAt", "endAt", "memo"] as const)
      if (k in e) Object.assign(result, { [k]: e[k] });
    if (e.tagIds) result.categoryId = e.tagIds[0] ?? null;
    if (e.tagIds && e.tagIds.length > 1)
      result.memo =
        `${e.memo ?? ""}\n旧版の複数タグ：${e.tagIds.map((id) => legacy.tags.find((t) => t.id === id)?.name ?? "").join("・")}`.trim();
    const plan: EventChanges["plan"] = full ? emptyPlan() : {};
    for (const k of ["bagId", "addedItemIds", "removedItemIds"] as const)
      if (k in e) Object.assign(plan, { [k]: e[k] });
    if (Object.keys(plan).length) result.plan = plan;
    if (full) result.allDay = false;
    return result;
  };
  s.events = legacy.events.map(
    (e) =>
      ({
        ...fields(e, true),
        id: e.id,
        recurrence: e.recurrence,
        weekdays: [dateAt(e.startAt).getDay()],
        until: e.until,
        createdAt: now.toISOString(),
        ...entityStamp(now),
      }) as Event,
  );
  s.overrides = legacy.overrides.map((o) => ({
    ...o,
    changes: fields(o.changes, false),
    ...entityStamp(now),
  }));
  return { state: validateState(s), photos };
}
