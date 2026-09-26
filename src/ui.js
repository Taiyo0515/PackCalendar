import { bagById, locationName, dateAt, dateKey, COLORS } from "./core.js";
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  bag: "M8 7V5a4 4 0 0 1 8 0v2M5 7h14l1 14H4L5 7Zm3 5h8m-8 4h5",
  home: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8",
  calendar:
    "M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Zm2-2v5m10-5v5M3 10h18M7 14h2m6 0h2m-10 3h2",
  item: "m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5M7 5.8l9 5",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-5h4l1 3 3 1 3 3v4l-3 3-3 1-1 3h-4l-1-3-3-1-3-3v-4l3-3 3-1 1-3Z",
  check: "m5 12 4 4L19 6",
  plus: "M12 5v14M5 12h14",
  right: "m9 5 7 7-7 7",
  left: "m15 5-7 7 7 7",
  close: "m6 6 12 12M6 18 18 6",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  upload: "M12 16V4m-5 5 5-5 5 5M4 17v4h16v-4",
  clock: "M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  bell: "M5 16h14l-2-3V9a5 5 0 0 0-10 0v4l-2 3Zm5 4h4",
  wallet: "M4 6V4h14v3M3 7h18v14H3V7Zm12 5h6v5h-6v-5",
  key: "M14 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm-4 8-7 7m0-4 3 3m1-7 3 3",
  laptop: "M5 3h14v13H5V3ZM2 20h20l-3-4H5l-3 4Z",
  phone: "M7 2h10v20H7V2Zm4 17h2",
  book: "M4 3h7l1 2 1-2h7v17h-7l-1 1-1-1H4V3Zm8 2v16",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 12h3v8H3v-8h1Zm16 0h1v8h-4v-8h3Z",
  bottle: "M9 2h6v4l3 4v12H6V10l3-4V2Zm-3 11h12",
  edit: "m4 16 12-12 4 4L8 20H4v-4Zm10-10 4 4",
  copy: "M8 8h13v13H8V8ZM4 16H2V2h14v2",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  leaf: "M5 20C1 6 9 2 21 3c-1 12-6 18-16 17Zm0 0L16 8",
  search: "M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  photo: "M3 6h5l2-3h4l2 3h5v15H3V6Zm13 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z",
  tag: "M3 3h9l9 9-9 9-9-9V3Zm5 4v1",
  refresh: "M4 8a8 8 0 1 1 0 8M4 3v5h5",
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.item}"/></svg>`;
export const button = (label, action, classes = "", attrs = "") =>
  `<button type="button" class="btn ${classes}" data-action="${action}" ${attrs}>${label}</button>`;
export const iconButton = (name, label, action, attrs = "") =>
  button(
    icon(name),
    action,
    "icon-btn",
    `aria-label="${esc(label)}" title="${esc(label)}" ${attrs}`,
  );
export const option = (value, label, selected) =>
  `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(label)}</option>`;
export const bagOptions = (s, selected) =>
  option("", "バッグを指定しない", selected ?? "") +
  s.bags.map((b) => option(b.id, b.name, selected)).join("");
export const locValue = (l) => (l.type === "bag" ? l.bagId : l.type);
export const locOptions = (s, l) =>
  ["home", "other", "unknown"]
    .map((v) =>
      option(
        v,
        { home: "自宅", other: "その他", unknown: "不明" }[v],
        locValue(l),
      ),
    )
    .join("") + s.bags.map((b) => option(b.id, b.name, locValue(l))).join("");
export const locationSelect = (s, item) =>
  `<select class="location-select" data-location="${item.id}" aria-label="${esc(item.name)}の記録上の位置">${locOptions(s, item.location)}</select>`;
export const shortDate = (date) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(dateAt(date));
export function relativeDate(date) {
  const today = dateKey(new Date());
  return date.slice(0, 10) === today ? "今日" : shortDate(date);
}
export const timeRange = (e) =>
  `${e.startAt.slice(11)} – ${e.endAt.slice(0, 10) !== e.startAt.slice(0, 10) ? shortDate(e.endAt) + " " : ""}${e.endAt.slice(11)}`;
export const badge = (text, color = "sage") =>
  `<span class="badge ${COLORS.includes(color) ? color : "sage"}">${esc(text)}</span>`;
export const itemVisual = (item) =>
  item.image
    ? `<img class="item-photo" src="${esc(item.image)}" alt="">`
    : `<span class="item-symbol">${icon(item.icon)}</span>`;
export function bagArt(bag, large = false) {
  if (bag.image)
    return `<img class="bag-photo ${large ? "large" : ""}" src="${esc(bag.image)}" alt="${esc(bag.name)}">`;
  return `<svg class="bag-art ${large ? "large" : ""}" viewBox="0 0 240 200" aria-hidden="true"><ellipse cx="120" cy="178" rx="67" ry="9" fill="currentColor" opacity=".1"/><g transform="rotate(-7 120 100)"><path d="M91 45V31q29-25 58 0v14" fill="none" stroke="currentColor" stroke-width="9"/><path d="M76 51q44-22 88 0l13 114q-55 18-113 0Z" fill="currentColor" opacity=".85"/><path d="M76 53q44 21 88 0v38q-43 17-87 0Z" fill="currentColor"/><path d="M82 111q37-8 77 0v40q-38 10-77 0Z" fill="#fff" opacity=".23"/><path d="M86 121h67" fill="none" stroke="#fff" stroke-width="3" opacity=".55"/><path d="M103 73h33" stroke="#f4e7c6" stroke-width="5" stroke-linecap="round"/><rect x="111" y="81" width="17" height="18" rx="4" fill="#eed9a9"/><path d="M166 76q21 41 15 72M72 76q-21 41-15 72" fill="none" stroke="currentColor" stroke-width="8"/></g></svg>`;
}
export function eventRow(s, e, active = false) {
  const b = bagById(s, e.bagId);
  return `<button type="button" class="event-row ${active ? "selected" : ""}" data-action="event-detail" data-key="${esc(e.key)}"><span class="event-time">${e.startAt.slice(11)}<small>${e.endAt.slice(11)}</small></span><span class="event-bar ${b?.color ?? "blue"}"></span><span class="event-copy"><strong>${esc(e.title)}</strong><span>${b ? icon("bag") + esc(b.name) : "バッグ指定なし"}${e.recurrence !== "none" ? " · 繰り返し" : ""}${e.isOverride ? " · 変更あり" : ""}</span></span>${icon("right")}</button>`;
}
export function itemDetail(s, item) {
  return `<div class="detail-item">${itemVisual(item)}<span class="grow"><strong>${esc(item.name)}</strong><small title="${esc(item.location.updatedAt)}">記録上の位置</small></span>${locationSelect(s, item)}</div>`;
}
export const empty = (title, copy, action = "") =>
  `<div class="empty-state">${icon("leaf")}<h3>${esc(title)}</h3><p>${esc(copy)}</p>${action}</div>`;
