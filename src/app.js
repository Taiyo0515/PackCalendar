import * as C from "./core.js";
import { Repository } from "./storage.js";
import {
  esc,
  icon,
  button,
  iconButton,
  option,
  bagOptions,
  locOptions,
  locationSelect,
  shortDate,
  timeRange,
  badge,
  itemVisual,
  bagArt,
  eventRow,
  itemDetail,
  empty,
} from "./ui.js";

const app = document.querySelector("#app");
const editor = document.querySelector("#editor");
const confirmation = document.querySelector("#confirmation");
const namespace = new URL("../", import.meta.url).pathname;
let repo, state, failure;
try {
  repo = new Repository(window.localStorage, namespace);
  state = repo.load();
} catch (e) {
  failure = e;
}
let view = ["home", "calendar", "bags", "items", "settings"].includes(
  location.hash.slice(1),
)
  ? location.hash.slice(1)
  : "home";
let selectedDate = C.dateKey(new Date()),
  month = selectedDate.slice(0, 7),
  selectedPrep = null,
  search = "",
  offlineReady = false,
  installPrompt = null,
  toastTimer,
  undo = null,
  editorContext = null;
const views = {
  home: ["今日の準備", "次のお出かけを、もっと身軽に。"],
  calendar: ["カレンダー", "予定が決まれば、持ち物も決まる。"],
  bags: ["バッグ", "いつもの持ち物を、基本セットに。"],
  items: ["持ち物", "移し忘れたくない物だけ、ここに。"],
  settings: ["設定", "あなたの端末で、あなたのペースで。"],
};
const act = (label, action, cls = "", attrs = "") =>
  button(label, action, cls, attrs);
function upsert(list, value) {
  const index = list.findIndex((x) => x.id === value.id);
  if (index < 0) list.push(value);
  else list[index] = value;
}
function toast(message, canUndo = false) {
  clearTimeout(toastTimer);
  const t = document.querySelector("#toast");
  t.innerHTML = `<span>${esc(message)}</span>${canUndo ? act("元に戻す", "undo", "toast-undo") : ""}`;
  t.classList.add("visible");
  toastTimer = setTimeout(
    () => t.classList.remove("visible"),
    canUndo ? 12000 : 5000,
  );
}
function commit(
  change,
  message,
  { keepDialog = false, allowUndo = false } = {},
) {
  try {
    const before = structuredClone(state),
      next = structuredClone(state);
    change(next);
    state = repo.save(next);
    undo = allowUndo ? { before, revision: state.revision } : null;
    if (!keepDialog) closeEditor();
    render();
    if (message) toast(message, allowUndo);
    return true;
  } catch (e) {
    showError(e.message);
    return false;
  }
}
function showError(message) {
  const error = editor.open ? editor.querySelector(".form-error") : null;
  if (error) {
    error.textContent = message;
    error.hidden = false;
    error.scrollIntoView({ block: "nearest" });
  } else toast(message);
}
function closeEditor() {
  editor.close();
  editorContext = null;
}
function resolveEvent(key) {
  const [baseId, date] = (key ?? "").split("@");
  const base = state.events.find((e) => e.id === baseId);
  return base && date ? C.occurrence(state, base, date) : null;
}
function getPrep() {
  return resolveEvent(selectedPrep) ?? C.upcoming(state)[0] ?? null;
}
function render() {
  const sameView = app.dataset.view === view;
  const openIndexes = [...app.querySelectorAll("details")].flatMap((d, i) =>
    d.open ? [i] : [],
  );
  const focusedLocation = document.activeElement?.dataset.location;
  renderScreen();
  app.dataset.view = view;
  const picker = app.querySelector(".month-picker");
  if (picker?.type === "text") {
    picker.classList.add("month-fallback");
    picker.placeholder = "YYYY-MM";
    picker.setAttribute("inputmode", "numeric");
  }
  if (sameView) {
    const details = [...app.querySelectorAll("details")];
    for (const index of openIndexes)
      if (details[index]) details[index].open = true;
    if (focusedLocation)
      [...app.querySelectorAll("[data-location]")]
        .find((e) => e.dataset.location === focusedLocation)
        ?.focus({ preventScroll: true });
  }
}
function renderScreen() {
  if (failure) {
    renderRecovery();
    return;
  }
  const [title, subtitle] = views[view];
  document.title = `${title} · PackCalendar`;
  app.innerHTML = `<a class="skip-link" href="#main">本文へ移動</a><aside class="sidebar"><a class="brand" href="#home"><span class="brand-icon">${icon("bag")}</span><span>Pack<span class="brand-light">Calendar</span></span></a><div class="sidebar-body"><p class="nav-caption">MY EVERYDAY</p><nav aria-label="メインナビゲーション">${Object.entries(
    views,
  )
    .map(
      ([k, [label]]) =>
        `<a href="#${k}" ${view === k ? 'aria-current="page"' : ""}>${icon({ home: "home", calendar: "calendar", bags: "bag", items: "item", settings: "settings" }[k])}<span>${label}</span>${view === k ? "<i></i>" : ""}</a>`,
    )
    .join(
      "",
    )}</nav></div><div class="sidebar-note">${icon("leaf")}<p>持ち物を考える時間を、<br>楽しむ時間に。</p></div><div class="local-mark"><span class="status-dot"></span>この端末に保存</div></aside><div class="workspace"><header class="topbar"><span class="breadcrumb">MY EVERYDAY <span>/</span> ${title}</span><span class="top-date">${icon("calendar")}${shortDate(C.dateKey(new Date()))}</span></header><main id="main" tabindex="-1"><div class="page-heading"><div><p class="eyebrow">${{ home: "READY, SET, GO.", calendar: "MAKE ROOM FOR YOUR DAY.", bags: "YOUR EVERYDAY COMPANIONS.", items: "LITTLE THINGS, BIG DIFFERENCE.", settings: "MAKE YOURSELF AT HOME." }[view]}</p><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${view === "home" || view === "calendar" ? act(icon("plus") + "予定を追加", "new-event", "primary") : view === "bags" ? act(icon("plus") + "バッグを追加", "new-bag", "primary") : view === "items" ? act(icon("plus") + "持ち物を追加", "new-item", "primary") : ""}</div>${state.settings.sample ? `<div class="sample-banner"><span>${icon("leaf")}サンプルで体験中です。自由に編集して試せます。</span>${act("自分のデータで始める", "clear-sample", "text-btn")}</div>` : ""}${!state.settings.onboarded ? welcome() : { home: homeView, calendar: calendarView, bags: bagsView, items: itemsView, settings: settingsView }[view]()}</main><footer class="page-footer"><span>PackCalendar</span><span>必要な準備だけ、ひと目で。</span></footer></div>`;
}
function welcome() {
  return `<section class="welcome panel"><div><p class="eyebrow">HELLO, PACKCALENDAR.</p><h2>明日の持ち物、<br>もう迷わない。</h2><p>予定で使うバッグを選ぶだけ。<br>財布や鍵など、今回移す物だけをお知らせします。</p><div class="button-row">${act("サンプルで体験する " + icon("arrow"), "sample", "primary")}${act("空の状態で始める", "start-empty", "secondary")}</div><small>登録不要。データはこのブラウザに保存されます。</small></div><div class="welcome-art sage">${bagArt({ name: "バッグ" }, true)}<span class="floating-note">${icon("check")}準備するのは、変わった物だけ。</span></div></section><div class="steps"><div><span>01</span><h3>バッグを登録</h3><p>いつもの持ち物を基本セットに。</p></div><div><span>02</span><h3>予定とつなげる</h3><p>予定に使うバッグを選択。</p></div><div><span>03</span><h3>移す物だけ準備</h3><p>準備できたら、ひと押しで完了。</p></div></div>`;
}
function prepDetails(e) {
  const b = C.bagById(state, e.bagId),
    required = C.requiredItems(state, e);
  return `<details class="prep-details"><summary>今回の必要セット・記録上の位置 <span>${required.length}点 ${icon("right")}</span></summary><p class="hint">位置が違っていたら、ここで修正できます。毎回の確認は不要です。</p>${required.map((i) => itemDetail(state, i)).join("") || '<p class="hint">必要セットは空です。</p>'}<div class="base-set"><span>バッグの基本セット</span><p>${b.itemIds.map((id) => esc(state.items.find((i) => i.id === id)?.name)).join(" / ") || "まだ設定されていません"}</p></div></details>`;
}
function homeView() {
  const e = getPrep(),
    next = C.upcoming(state, new Date(), 3);
  if (!e)
    return `<div class="home-layout"><section class="panel">${empty("次のお出かけを登録しよう", "バッグを指定した予定を追加すると、必要な準備がここに表示されます。", act(icon("plus") + "予定を追加", "new-event", "primary"))}${!state.bags.length ? `<div class="start-guide">まずは普段使うバッグから。${act("バッグを登録", "new-bag", "secondary")}</div>` : ""}</section><aside class="panel quiet-card">${icon("leaf")}<h3>全部、確認しなくて大丈夫。</h3><p>すでにバッグにある物は、そのままで。変わる物だけを準備しましょう。</p></aside></div>`;
  const b = C.bagById(state, e.bagId);
  if (!b) {
    selectedPrep = null;
    return homeView();
  }
  const actions = C.preparation(state, e);
  return `<div class="home-layout"><div class="prep-column"><section class="next-hero ${b.color}"><div class="hero-copy"><p class="eyebrow">${selectedPrep ? "選択した予定の準備" : "NEXT UP · 次のお出かけ"}</p><div class="hero-date">${shortDate(e.startAt)} <span>${timeRange(e)}</span></div><button class="heading-button" data-action="event-detail" data-key="${e.key}"><h2>${esc(e.title)}</h2>${icon("right")}</button><div class="hero-bag">${icon("bag")}<span>${esc(b.name)}</span></div><div class="hero-count">${actions.length ? `<strong>${actions.length}</strong><span>点を準備すれば、出発できます。</span>` : `${icon("check")}<span>記録上、準備はできています。</span>`}</div></div><div class="hero-art">${bagArt(b, true)}</div></section><section class="panel action-panel"><div class="section-heading"><h2>${actions.length ? "今回やること" : "準備できています"}</h2>${actions.length ? badge(`あと${actions.length}点`) : badge("READY")}</div>${selectedPrep ? `<p class="hint">現在の記録位置との差分です。${act("次の予定に戻る", "next-prep", "text-btn")}</p>` : ""}${actions.length ? `<p class="hint">すでにバッグにある物は、表示していません。</p><div class="action-list">${actions.map((a) => `<div class="action-row">${itemVisual(a.item)}<div class="grow"><strong>${esc(a.item.name)}</strong><p>${a.kind === "find" ? "場所を確認して" : a.kind === "move" ? esc(a.from) + ` ${icon("arrow")} ` : esc(a.from) + "から "}<b>${esc(a.to)}</b>${a.kind === "move" ? "へ移す" : "に入れる"}</p></div>${act(icon("check") + (a.kind === "move" ? "移動した" : "入れた"), "complete-item", "complete-btn", `data-id="${a.item.id}"`)}</div>`).join("")}</div><div class="complete-all">${act(icon("check") + "すべて準備できた", "complete-all", "primary")}</div>` : `<div class="ready-state"><span>${icon("check")}</span><h3>あとは、出かけるだけ。</h3><p>今回、移す必要がある持ち物はありません。</p></div>`}${prepDetails(e)}</section></div><aside class="home-aside"><section class="panel schedule-panel"><div class="section-heading"><h2>これからの予定</h2><a class="text-link" href="#calendar">カレンダー ${icon("right")}</a></div><p class="hint">バッグを使う予定ごとに、準備できます。</p>${next.map((n) => `<div class="upcoming-item"><p class="day-label">${shortDate(n.startAt)}</p>${eventRow(state, n, n.key === e.key)}${act(n.key === e.key ? "表示中" : "この予定を準備", "select-prep", "text-btn", `data-key="${n.key}" ${n.key === e.key ? "disabled" : ""}`)}</div>`).join("") || '<p class="hint">これからの予定はありません。</p>'}</section><section class="notification-preview"><div class="notification-label">${icon("bell")}通知プレビュー<span>サンプル表示</span></div><p>${actions.length ? `${esc(b.name)}を使います。${actions.map((a) => esc(a.item.name)).join("・")}を${actions.some((a) => a.kind === "find") ? "場所を確認して準備" : "準備"}してください。` : "必要な準備がないため、通知はありません。"}</p><small>自動通知の代わりに、ここで内容を確認できます。</small></section><div class="gentle-note">${icon("leaf")}<p>記録と実際の位置が違っても大丈夫。<br>気づいたときに、さっと直せます。</p></div></aside></div>`;
}
function calendarView() {
  const first = C.dateAt(`${month}-01`),
    offset = (first.getDay() - state.settings.weekStart + 7) % 7,
    start = C.addDays(`${month}-01`, -offset),
    end = C.addDays(start, 42);
  const events = C.occurrencesBetween(state, start, end);
  const dayEvents = C.occurrencesBetween(
    state,
    selectedDate,
    C.addDays(selectedDate, 1),
  );
  const weekdays =
    state.settings.weekStart === 1
      ? ["月", "火", "水", "木", "金", "土", "日"]
      : ["日", "月", "火", "水", "木", "金", "土"];
  return `<div class="calendar-layout"><section class="panel calendar-panel"><div class="calendar-toolbar"><h2>${Number(month.slice(0, 4))}<span>年</span> ${Number(month.slice(5))}<span>月</span></h2><div class="button-row">${act("今日", "today", "secondary small")}${iconButton("left", "前の月", "prev-month")}${iconButton("right", "次の月", "next-month")}<input type="month" class="month-picker" aria-label="表示する月" value="${month}" min="1900-01" max="2200-12"></div></div><div class="calendar-weekdays">${weekdays.map((w) => `<span class="${w === "日" ? "sunday" : w === "土" ? "saturday" : ""}">${w}</span>`).join("")}</div><div class="calendar-grid">${Array.from(
    { length: 42 },
    (_, i) => {
      const date = C.addDays(start, i),
        list = events.filter(
          (e) =>
            e.startAt < `${C.addDays(date, 1)}T00:00` &&
            e.endAt > `${date}T00:00`,
        );
      return `<button class="calendar-day ${date.slice(0, 7) !== month ? "outside" : ""} ${date === selectedDate ? "selected" : ""} ${date === C.dateKey(new Date()) ? "today" : ""}" data-action="select-day" data-date="${date}" aria-label="${shortDate(date)}、${list.length}件の予定" aria-pressed="${date === selectedDate}"><span class="day-number">${Number(date.slice(8))}</span><span class="day-events">${list
        .slice(0, 3)
        .map(
          (e) =>
            `<span class="calendar-event ${C.bagById(state, e.bagId)?.color ?? "blue"}">${esc(e.title)}</span>`,
        )
        .join(
          "",
        )}${list.length > 3 ? `<small>+${list.length - 3}件</small>` : ""}</span><span class="mobile-dots">${list
        .slice(0, 3)
        .map(
          (e) =>
            `<i class="${C.bagById(state, e.bagId)?.color ?? "blue"}"></i>`,
        )
        .join("")}</span></button>`;
    },
  ).join(
    "",
  )}</div></section><aside class="panel day-panel"><div class="section-heading"><h2>${shortDate(selectedDate)}</h2>${iconButton("plus", "選択日に予定を追加", "new-event")}</div><p class="hint">${dayEvents.length}件の予定</p>${dayEvents.map((e) => eventRow(state, e)).join("") || empty("予定のない日", "余白も、大切な予定のひとつ。")}${act(icon("plus") + "この日に予定を追加", "new-event", "secondary full")}</aside></div>`;
}
function bagsView() {
  return `${
    state.bags.length
      ? `<div class="bag-grid">${state.bags
          .map((b) => {
            const current = state.items.filter(
              (i) => i.location.type === "bag" && i.location.bagId === b.id,
            );
            return `<article class="panel bag-card"><div class="bag-cover ${b.color}">${bagArt(b)}<span class="bag-cover-label">EVERYDAY BAG</span>${iconButton("edit", `${b.name}を編集`, "edit-bag", `data-id="${b.id}"`)}</div><div class="bag-card-body"><div class="section-heading"><h2>${esc(b.name)}</h2>${iconButton("copy", `${b.name}を複製`, "copy-bag", `data-id="${b.id}"`)}</div><p class="hint bag-memo">${esc(b.memo) || "あなたの、いつものバッグ。"}</p><div class="set-label"><span>基本セット</span><b>${b.itemIds.length}点</b></div><div class="item-chips">${
              b.itemIds
                .map((id) => {
                  const i = state.items.find((i) => i.id === id);
                  return `<span>${icon(i.icon)}${esc(i.name)}</span>`;
                })
                .join("") ||
              '<p class="hint">編集から持ち物を選びましょう。</p>'
            }</div><details class="bag-current"><summary>記録上、このバッグにある物 <b>${current.length}点</b></summary>${current.map((i) => itemDetail(state, i)).join("") || '<p class="hint">このバッグにある記録はありません。</p>'}</details></div></article>`;
          })
          .join(
            "",
          )}<button class="add-bag-card" data-action="new-bag">${icon("plus")}<strong>新しいバッグを追加</strong><span>次のお出かけのおともに。</span></button></div>`
      : `<section class="panel">${empty("いつものバッグから、始めよう", "名前をつけて、移し忘れやすい持ち物を選ぶだけ。", act(icon("plus") + "バッグを追加", "new-bag", "primary"))}</section>`
  }<p class="bottom-hint">${icon("leaf")}基本セットは「いつも必要な物」。記録上の中身とは別に設定できます。</p>`;
}
function itemsView() {
  const items = state.items.filter((i) =>
    i.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  return `<section class="panel items-panel"><div class="items-toolbar"><div><h2>登録した持ち物 <span class="count">${state.items.length}</span></h2><p class="hint">位置は最後に確認した記録です。いつでも変更できます。</p></div><label class="search-field">${icon("search")}<input id="item-search" type="search" placeholder="持ち物を検索" aria-label="持ち物を検索" value="${esc(search)}"></label></div><div class="items-table"><div class="items-table-head"><span>持ち物</span><span>使うバッグの基本セット</span><span>記録上の位置</span><span></span></div>${
    items
      .map(
        (i) =>
          `<div class="item-table-row"><button class="item-name" data-action="edit-item" data-id="${i.id}">${itemVisual(i)}<span><strong>${esc(i.name)}</strong><small>${esc(i.memo)}</small></span></button><div class="item-bags">${
            state.bags
              .filter((b) => b.itemIds.includes(i.id))
              .map((b) => badge(b.name, b.color))
              .join("") || '<span class="hint">未設定</span>'
          }</div><div>${locationSelect(state, i)}</div>${iconButton("edit", `${i.name}を編集`, "edit-item", `data-id="${i.id}"`)}</div>`,
      )
      .join("") ||
    empty(
      search ? "見つかりませんでした" : "移し忘れたくない物を、いくつか。",
      search
        ? "別の名前で検索してみてください。"
        : "財布、鍵、イヤホンなど。すべての持ち物を登録する必要はありません。",
      search ? "" : act("持ち物を追加", "new-item", "primary"),
    )
  }</div></section>`;
}
function settingsView() {
  return `<div class="settings-grid"><section class="panel settings-card"><h2>${icon("download")}バックアップと復元</h2><p>予定・バッグ・持ち物・写真・設定を、1つのファイルに保存します。別の端末への引っ越しにも使えます。</p><div class="button-row">${act(icon("download") + "書き出す", "export", "primary")}<label class="btn secondary">${icon("upload")}読み込む<input class="visually-hidden" type="file" accept="application/json,.json" id="import-file"></label></div><p class="hint">読み込みは現在のデータを置き換えます。確認画面で件数を確認できます。</p></section><section class="panel settings-card"><h2>${icon("leaf")}この端末への保存</h2><p>データは、このブラウザだけに保存されます。ほかの端末やブラウザには自動同期されません。</p><div class="storage-info"><span class="status-dot"></span>端末内に保存済み<span>${Math.ceil(new Blob([JSON.stringify(state)]).size / 1024)} KB</span></div><p class="hint">ブラウザのデータ削除やプライベートブラウズで記録が失われることがあります。ときどき書き出しておくと安心です。</p>${act("保存の保持をリクエスト", "persist", "secondary small")}</section><section class="panel settings-card"><h2>${icon("calendar")}カレンダーの表示</h2><label class="field">週の始まり<select id="week-start">${option("1", "月曜日", String(state.settings.weekStart))}${option("0", "日曜日", String(state.settings.weekStart))}</select></label></section><section class="panel settings-card"><div class="section-heading"><h2>${icon("tag")}共通タグ</h2>${act(icon("plus") + "追加", "new-tag", "secondary small")}</div><p class="hint">タグを選ぶと、おすすめのバッグが自動で選ばれます。</p>${state.tags.map((t) => `<div class="tag-row">${badge(t.name, t.color)}<span class="grow hint">${esc(C.bagById(state, t.defaultBagId)?.name ?? "バッグ指定なし")}</span>${iconButton("edit", `${t.name}タグを編集`, "edit-tag", `data-id="${t.id}"`)}</div>`).join("") || '<p class="hint">「大学」「プライベート」などのタグを作れます。</p>'}</section><section class="panel settings-card"><h2>${icon("phone")}アプリとして使う</h2><p>${offlineReady ? "オフライン起動の準備ができています。" : window.isSecureContext ? "オフライン起動の準備を確認中です。" : "この接続ではオフライン起動を利用できません。HTTPSまたはPCのlocalhostで開いてください。"}</p>${installPrompt ? act("この端末にインストール", "install", "primary") : ""}<p class="hint">Android：ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」。<br>iPhone / iPad：Safariの共有メニューから「ホーム画面に追加」。<br>PC：対応ブラウザのアドレスバーにあるインストール操作を使えます。</p></section><section class="panel settings-card"><h2>${icon("bell")}通知について</h2><p>準備画面で、行動が必要な物だけを通知プレビューとして表示します。</p><p class="hint">アプリを閉じた状態での自動通知・時刻指定通知はありません。</p></section><section class="panel settings-card danger-zone"><h2>データをリセット</h2><p class="hint">写真を含むすべての記録を削除し、最初から始めます。</p>${act("すべてのデータを削除", "reset", "danger secondary")}</section></div>`;
}

function openDialog(title, body, context) {
  editorContext = context;
  editor.innerHTML = `<div class="dialog-heading"><h2 id="dialog-title">${esc(title)}</h2>${iconButton("close", "閉じる", "close-editor")}</div>${body}`;
  if (!editor.open) editor.showModal();
  editor.scrollTop = 0;
}
function formShell(content, isEdit = false) {
  return `<form id="edit-form"><div class="dialog-body">${content}<p class="form-error" role="alert" hidden></p></div><div class="dialog-footer">${isEdit ? act(icon("trash") + "削除", "delete-current", "danger text-btn") : ""}<span class="grow"></span>${act("キャンセル", "close-editor", "secondary")}<button class="btn primary" type="submit">保存する</button></div></form>`;
}
const nameField = (label, value, placeholder) =>
  `<label class="field">${label} <span class="required">必須</span><input name="name" value="${esc(value)}" placeholder="${esc(placeholder)}" required maxlength="200" autocomplete="off"></label>`;
const memoField = (value) =>
  `<label class="field">メモ <span class="optional">任意</span><textarea name="memo" rows="3" maxlength="10000" placeholder="覚えておきたいことがあれば。">${esc(value)}</textarea></label>`;
const colorField = (value) =>
  `<fieldset class="field"><legend>カラー</legend><div class="color-options">${C.COLORS.map((c, i) => `<label class="color-choice ${c}"><input type="radio" name="color" value="${c}" ${value === c ? "checked" : ""} aria-label="${["セージ", "サンド", "ブルー", "ローズ", "プラム"][i]}"><span>${icon("check")}</span></label>`).join("")}</div></fieldset>`;
function photoField(value) {
  return `<div class="photo-field"><div id="photo-preview">${value ? `<img src="${esc(value)}" alt="登録する写真">` : icon("photo")}</div><div><label class="btn secondary small">${icon("photo")}写真を撮る・選ぶ<input type="file" accept="image/*" id="photo-input" class="visually-hidden"></label>${act("写真を外す", "remove-photo", "text-btn small")}<p class="hint">写真はこの端末だけに保存。名前は自分で確認して入力します。</p></div></div>`;
}
function bagForm(bagId, copy = false) {
  const original = state.bags.find((b) => b.id === bagId);
  const b = original
    ? { ...original, name: original.name + (copy ? " のコピー" : "") }
    : {
        id: C.id(),
        name: "",
        memo: "",
        color: "sage",
        image: null,
        itemIds: [],
      };
  const editing = !!original && !copy;
  openDialog(
    copy ? "バッグを複製" : editing ? "バッグを編集" : "バッグを追加",
    formShell(
      `${nameField("バッグの名前", b.name, "例：いつものリュック")}${photoField(b.image)}${colorField(b.color)}<fieldset class="field"><legend>基本セット</legend><p class="hint">このバッグで、いつも必要な物を選んでください。位置は変更されません。</p>${state.bags.length ? `<select id="reuse-set" aria-label="別のバッグの基本セットを流用">${option("", "ほかのバッグの基本セットを使う", "")}${state.bags.map((x) => option(x.id, x.name, "")).join("")}</select>` : ""}<div class="check-grid" id="bag-item-choices">${state.items.map((i) => itemCheckbox(i, b.itemIds.includes(i.id))).join("")}</div><div class="inline-add"><input id="quick-item-name" placeholder="新しい持ち物の名前" maxlength="200" aria-label="その場で追加する持ち物の名前">${act(icon("plus") + "追加", "quick-item", "secondary")}</div><div class="quick-suggestions">${[
        "財布",
        "鍵",
        "スマートフォン",
        "イヤホン",
      ]
        .filter((name) => !state.items.some((i) => i.name === name))
        .map((name) =>
          act(
            "+ " + esc(name),
            "suggest-item",
            "chip-button",
            `data-name="${esc(name)}"`,
          ),
        )
        .join(
          "",
        )}</div><p class="hint">ここで追加した持ち物はすぐに保存されます。</p></fieldset>${memoField(b.memo)}`,
      editing,
    ),
    { type: "bag", id: editing ? bagId : b.id, editing, image: b.image, copy },
  );
  if (copy) editorContext.id = C.id();
}
function itemCheckbox(item, checked) {
  return `<label class="check-chip"><input type="checkbox" name="itemIds" value="${item.id}" ${checked ? "checked" : ""}>${icon(item.icon)}<span>${esc(item.name)}</span></label>`;
}
function itemForm(itemId) {
  const i = state.items.find((i) => i.id === itemId) ?? {
    id: C.id(),
    name: "",
    memo: "",
    icon: "item",
    image: null,
    location: { type: "unknown", bagId: null },
  };
  openDialog(
    itemId ? "持ち物を編集" : "持ち物を追加",
    formShell(
      `${nameField("持ち物の名前", i.name, "例：財布")}${photoField(i.image)}<fieldset class="field"><legend>アイコン</legend><div class="icon-options">${C.ICONS.filter(
        (k) => k !== "bag",
      )
        .map(
          (k, n) =>
            `<label><input type="radio" name="icon" value="${k}" ${k === i.icon ? "checked" : ""} aria-label="${["財布", "鍵", "PC", "スマートフォン", "本", "イヤホン", "ボトル", "その他"][n]}"><span>${icon(k)}</span></label>`,
        )
        .join(
          "",
        )}</div></fieldset><label class="field">記録上の位置<select name="location">${locOptions(state, i.location)}</select></label><p class="hint">わからない場合は「不明」のままで大丈夫です。</p>${memoField(i.memo)}`,
      !!itemId,
    ),
    { type: "item", id: i.id, editing: !!itemId, image: i.image },
  );
}
function tagForm(tagId) {
  const t = state.tags.find((t) => t.id === tagId) ?? {
    id: C.id(),
    name: "",
    defaultBagId: null,
    color: "sage",
  };
  openDialog(
    tagId ? "タグを編集" : "タグを追加",
    formShell(
      `${nameField("タグの名前", t.name, "例：大学")}<label class="field">デフォルトバッグ<select name="defaultBagId">${bagOptions(state, t.defaultBagId)}</select></label><p class="hint">予定にこのタグをつけると、バッグが自動で選ばれます。予定ごとに変更できます。</p>${colorField(t.color)}`,
      !!tagId,
    ),
    { type: "tag", id: t.id, editing: !!tagId },
  );
}
function eventForm(key = null, scope = "one") {
  const instance = resolveEvent(key);
  const base = instance
    ? state.events.find((e) => e.id === instance.baseId)
    : null;
  const date = view === "calendar" ? selectedDate : C.dateKey(new Date());
  const e = instance
    ? scope === "all"
      ? base
      : instance
    : {
        id: C.id(),
        title: "",
        startAt: `${date}T09:00`,
        endAt: `${date}T10:00`,
        bagId: null,
        tagIds: [],
        memo: "",
        recurrence: "none",
        until: null,
        addedItemIds: [],
        removedItemIds: [],
      };
  const repeating = base && base.recurrence !== "none";
  const content = `${repeating ? `<label class="field scope-field">変更する範囲<select id="edit-scope">${option("one", "この回だけ", scope)}${option("all", "繰り返し全体", scope)}</select><small>範囲を切り替えると、その範囲の保存済み内容を表示します。</small></label>` : ""}<label class="field">予定名 <span class="required">必須</span><input name="title" required maxlength="200" value="${esc(e.title)}" placeholder="例：大学で作業"></label><div class="form-columns"><label class="field">開始日時<input type="datetime-local" name="startAt" value="${e.startAt}" required min="1900-01-01T00:00" max="2200-12-31T23:59"></label><label class="field">終了日時<input type="datetime-local" name="endAt" value="${e.endAt}" required min="1900-01-01T00:00" max="2200-12-31T23:59"></label></div><fieldset class="field"><legend>タグ <span class="optional">任意</span></legend><div class="check-grid" id="event-tags">${state.tags.map((t) => `<label class="check-chip"><input type="checkbox" name="tagIds" value="${t.id}" ${e.tagIds.includes(t.id) ? "checked" : ""}>${badge(t.name, t.color)}</label>`).join("")}</div><div class="inline-add"><input id="quick-tag-name" placeholder="新しいタグ" maxlength="200" aria-label="新しいタグの名前">${act(icon("plus") + "追加", "quick-tag", "secondary")}</div></fieldset><label class="field">使用バッグ <span class="optional">任意</span><select name="bagId" id="event-bag">${bagOptions(state, e.bagId)}</select></label><p class="hint">オンライン会議など、バッグを使わない予定も登録できます。</p>${
    !repeating || scope === "all"
      ? `<div class="form-columns"><label class="field">繰り返し<select name="recurrence" id="event-recurrence">${[
          ["none", "繰り返さない"],
          ["daily", "毎日"],
          ["weekly", "毎週"],
          ["monthly", "毎月"],
        ]
          .map(([v, l]) => option(v, l, e.recurrence))
          .join(
            "",
          )}</select></label><label class="field">繰り返しの終了日 <span class="optional">任意</span><input type="date" name="until" min="${e.startAt.slice(0, 10)}" max="2200-12-31" value="${e.until ?? ""}" ${e.recurrence === "none" ? "disabled" : ""}></label></div><p class="hint">毎月は同じ日付に繰り返します。31日など、日付がない月はスキップします。</p>`
      : ""
  }<details class="event-items" ${e.addedItemIds.length || e.removedItemIds.length ? "open" : ""}><summary>この予定の持ち物を調整 <span>追加・除外 ${icon("right")}</span></summary><p class="hint">基本セットは変えず、この予定${repeating && scope === "one" ? "のこの回" : ""}だけ変更できます。</p><div id="event-item-choices">${eventItemChoices(e)}</div></details>${memoField(e.memo)}`;
  openDialog(key ? "予定を編集" : "予定を追加", formShell(content, !!key), {
    type: "event",
    id: base?.id ?? e.id,
    key,
    scope,
    editing: !!key,
    instance,
    base,
  });
}
function eventItemChoices(e) {
  const base = C.bagById(state, e.bagId)?.itemIds ?? [];
  return (
    state.items
      .map(
        (i) =>
          `<div class="event-item-row">${itemVisual(i)}<span class="grow">${esc(i.name)}<small>${base.includes(i.id) ? "基本セットに含まれます" : "基本セットに含まれません"}</small></span><select name="adjust-${i.id}" aria-label="${esc(i.name)}の予定での扱い">${option("default", "基本セットどおり", e.addedItemIds.includes(i.id) ? "add" : e.removedItemIds.includes(i.id) ? "remove" : "default")}${option("add", "追加する", e.addedItemIds.includes(i.id) ? "add" : "")}${option("remove", "除外する", e.removedItemIds.includes(i.id) ? "remove" : "")}</select></div>`,
      )
      .join("") ||
    '<p class="hint">バッグや持ち物を登録すると、ここで選べます。</p>'
  );
}
function eventDetail(key) {
  const e = resolveEvent(key);
  if (!e) return;
  const b = C.bagById(state, e.bagId);
  openDialog(
    e.title,
    `<div class="dialog-body event-detail"><p class="detail-date">${icon("calendar")}${shortDate(e.startAt)} <span>${timeRange(e)}</span></p><div class="item-chips">${e.tagIds
      .map((id) => {
        const t = state.tags.find((t) => t.id === id);
        return badge(t.name, t.color);
      })
      .join(
        "",
      )}${e.recurrence !== "none" ? badge({ daily: "毎日", weekly: "毎週", monthly: "毎月" }[e.recurrence], "blue") : ""}${e.isOverride ? badge("この回の変更あり", "rose") : ""}</div>${b ? `<div class="detail-bag ${b.color}">${icon("bag")}<div><small>使用バッグ</small><strong>${esc(b.name)}</strong></div>${act("この予定を準備 " + icon("arrow"), "select-prep", "primary small", `data-key="${key}"`)}</div>${prepDetails(e)}` : '<p class="hint">バッグの指定はありません。準備計算の対象外です。</p>'}${e.memo ? `<div class="memo-display"><h3>メモ</h3><p>${esc(e.memo)}</p></div>` : ""}<p class="form-error" role="alert" hidden></p></div><div class="dialog-footer">${act(icon("edit") + "予定を編集", "edit-event", "primary", `data-key="${key}"`)}</div>`,
    { type: "detail", key },
  );
}
function confirmAction(title, message, label = "実行する") {
  confirmation.innerHTML = `<div class="dialog-heading"><h2 id="confirm-title">${esc(title)}</h2></div><div class="dialog-body"><p class="confirm-message">${esc(message)}</p></div><form method="dialog" class="dialog-footer"><button class="btn secondary" value="cancel" autofocus>キャンセル</button><button class="btn primary" value="ok">${esc(label)}</button></form>`;
  confirmation.returnValue = "";
  confirmation.showModal();
  return new Promise((resolve) =>
    confirmation.addEventListener(
      "close",
      () => resolve(confirmation.returnValue === "ok"),
      { once: true },
    ),
  );
}
async function submitForm(event) {
  event.preventDefault();
  const f = event.target,
    data = new FormData(f),
    ctx = editorContext;
  if (!ctx) return;
  const name = String(data.get("name") ?? "").trim(),
    memo = String(data.get("memo") ?? "").trim();
  if (ctx.type !== "event" && !name) {
    showError("名前を入力してください。");
    return;
  }
  if (ctx.type === "bag") {
    const b = {
      id: ctx.id,
      name,
      memo,
      color: data.get("color"),
      image: ctx.image,
      itemIds: data.getAll("itemIds"),
    };
    commit((s) => {
      upsert(s.bags, b);
      s.settings.onboarded = true;
    }, "バッグを保存しました");
  } else if (ctx.type === "item") {
    const value = data.get("location"),
      type = ["home", "other", "unknown"].includes(value) ? value : "bag";
    const old = state.items.find((i) => i.id === ctx.id);
    const i = {
      id: ctx.id,
      name,
      memo,
      icon: data.get("icon"),
      image: ctx.image,
      location: {
        type,
        bagId: type === "bag" ? value : null,
        updatedAt:
          old &&
          ((type === "bag" && old.location.bagId === value) ||
            (type !== "bag" && old.location.type === type))
            ? old.location.updatedAt
            : new Date().toISOString(),
      },
    };
    commit((s) => {
      upsert(s.items, i);
      s.settings.onboarded = true;
    }, "持ち物を保存しました");
  } else if (ctx.type === "tag") {
    if (state.tags.some((t) => t.id !== ctx.id && t.name === name)) {
      showError("同じ名前のタグがすでにあります。");
      return;
    }
    const tag = {
      id: ctx.id,
      name,
      color: data.get("color"),
      defaultBagId: data.get("defaultBagId") || null,
    };
    commit((s) => upsert(s.tags, tag), "タグを保存しました");
  } else if (ctx.type === "event") {
    const title = String(data.get("title")).trim(),
      startAt = data.get("startAt"),
      endAt = data.get("endAt");
    if (!title) {
      showError("予定名を入力してください。");
      return;
    }
    if (endAt <= startAt) {
      showError("終了日時は開始日時より後にしてください。");
      return;
    }
    const addedItemIds = [],
      removedItemIds = [];
    for (const i of state.items) {
      const value = data.get(`adjust-${i.id}`);
      if (value === "add") addedItemIds.push(i.id);
      if (value === "remove") removedItemIds.push(i.id);
    }
    const changes = {
      title,
      startAt,
      endAt,
      bagId: data.get("bagId") || null,
      tagIds: data.getAll("tagIds"),
      memo,
      addedItemIds,
      removedItemIds,
    };
    if (ctx.base?.recurrence !== "none" && ctx.base && ctx.scope === "one") {
      commit(
        (s) =>
          C.saveOccurrence(s, ctx.id, ctx.instance.occurrenceDate, changes),
        "この回の予定を保存しました",
      );
    } else {
      const recurrence = data.get("recurrence"),
        until = recurrence === "none" ? null : data.get("until") || null;
      if (until && until < startAt.slice(0, 10)) {
        showError("繰り返しの終了日は開始日以降にしてください。");
        return;
      }
      const e = {
        id: ctx.id,
        ...changes,
        recurrence,
        recurrenceId:
          recurrence === "none" ? null : (ctx.base?.recurrenceId ?? C.id()),
        until,
      };
      const invalid = state.overrides.filter(
        (o) =>
          o.eventId === ctx.id &&
          (recurrence === "none" || !C.isOccurrence(e, o.date)),
      );
      if (
        invalid.length &&
        !(await confirmAction(
          "繰り返しの範囲が変わります",
          `新しい繰り返しに含まれなくなる ${invalid.length} 件の特定回の変更・削除記録を取り除いて保存します。`,
          "変更して保存",
        ))
      )
        return;
      commit((s) => {
        upsert(s.events, e);
        s.overrides = s.overrides.filter(
          (o) => !invalid.some((x) => x.id === o.id),
        );
        s.settings.onboarded = true;
      }, "予定を保存しました");
    }
  }
}
async function deleteCurrent() {
  const ctx = editorContext;
  if (!ctx?.editing) return;
  if (ctx.type === "event") {
    const one = ctx.base.recurrence !== "none" && ctx.scope === "one";
    if (
      await confirmAction(
        one ? "この回の予定を削除" : "予定を削除",
        one
          ? "この回だけ削除します。ほかの繰り返し予定は残ります。"
          : ctx.base.recurrence !== "none"
            ? "繰り返し全体と、特定回の変更をすべて削除します。"
            : "この予定を削除します。",
        "削除する",
      )
    )
      commit(
        (s) => C.removeEvent(s, ctx.id, ctx.instance.occurrenceDate, ctx.scope),
        "予定を削除しました",
        { allowUndo: true },
      );
  } else if (ctx.type === "bag") {
    const events = state.events.filter((e) => e.bagId === ctx.id).length,
      items = state.items.filter((i) => i.location.bagId === ctx.id).length;
    if (
      await confirmAction(
        "バッグを削除",
        `このバッグの基本セットを削除します。参照する ${events} 件の予定（繰り返しを含む）・特定回の変更・タグのバッグ指定を解除し、このバッグにある ${items} 点の位置を「不明」にします。予定と持ち物自体は残ります。`,
        "削除する",
      )
    )
      commit((s) => C.removeBag(s, ctx.id), "バッグを削除しました", {
        allowUndo: true,
      });
  } else if (ctx.type === "item") {
    if (
      await confirmAction(
        "持ち物を削除",
        "すべてのバッグの基本セットと、予定の追加・除外からこの持ち物を取り除きます。",
        "削除する",
      )
    )
      commit((s) => C.removeItem(s, ctx.id), "持ち物を削除しました", {
        allowUndo: true,
      });
  } else if (ctx.type === "tag") {
    if (
      await confirmAction(
        "タグを削除",
        "予定からこのタグを外します。予定と使用バッグは残ります。",
        "削除する",
      )
    )
      commit((s) => C.removeTag(s, ctx.id), "タグを削除しました", {
        allowUndo: true,
      });
  }
}
function download(text, filename) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function exportData() {
  download(repo.export(state), `PackCalendar-${C.dateKey(new Date())}.json`);
  toast("バックアップを書き出しました");
}
async function importData(file) {
  if (!file) return;
  try {
    if (file.size > 12000000)
      throw new Error("ファイルが大きすぎます（上限12MB）。");
    const incoming = repo.import(await file.text());
    const summary = `バッグ ${incoming.bags.length} 件・持ち物 ${incoming.items.length} 件・予定 ${incoming.events.length} 件・特定回の変更 ${incoming.overrides.length} 件・タグ ${incoming.tags.length} 件を復元します。現在のデータはすべて置き換わります。`;
    if (
      !(await confirmAction("バックアップから復元", summary, "置き換えて復元"))
    )
      return;
    const old = state;
    state = repo.save({
      ...incoming,
      revision: state?.revision ?? incoming.revision,
    });
    failure = null;
    selectedPrep = null;
    undo = old ? { before: old, revision: state.revision } : null;
    closeEditor();
    render();
    toast("バックアップを復元しました", !!undo);
  } catch (e) {
    showError(e.message);
  }
}
async function updatePhoto(file) {
  if (!file) return;
  const ctx = editorContext;
  try {
    if (file.size > 25000000)
      throw new Error("25MB以下の写真を選んでください。");
    const url = URL.createObjectURL(file);
    const img = new Image();
    try {
      img.src = url;
      await img.decode();
      const ratio = Math.min(
          1,
          480 / Math.max(img.naturalWidth, img.naturalHeight),
        ),
        canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * ratio));
      const paint = canvas.getContext("2d");
      paint.fillStyle = "#fff";
      paint.fillRect(0, 0, canvas.width, canvas.height);
      paint.drawImage(img, 0, 0, canvas.width, canvas.height);
      let result = canvas.toDataURL("image/jpeg", 0.76);
      if (result.length > 220000) result = canvas.toDataURL("image/jpeg", 0.45);
      if (result.length > 220000)
        throw new Error(
          "写真を小さくできませんでした。別の写真を選んでください。",
        );
      if (editorContext !== ctx) return;
      ctx.image = result;
      editor.querySelector("#photo-preview").innerHTML =
        `<img src="${result}" alt="登録する写真">`;
      toast("写真を選びました。名前を確認して保存してください。");
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    showError(
      e.message === "The source image cannot be decoded."
        ? "この画像形式を読み込めません。JPEG・PNGなどの写真を選んでください。"
        : e.message,
    );
  }
}
function refreshEventItems() {
  const f = editor.querySelector("form"),
    added = [],
    removed = [];
  for (const i of state.items) {
    const value = f.elements.namedItem(`adjust-${i.id}`)?.value;
    if (value === "add") added.push(i.id);
    if (value === "remove") removed.push(i.id);
  }
  editor.querySelector("#event-item-choices").innerHTML = eventItemChoices({
    bagId: f.elements.bagId.value,
    addedItemIds: added,
    removedItemIds: removed,
  });
}
function quickItem(suggested) {
  const input = editor.querySelector("#quick-item-name"),
    name = (suggested ?? input.value).trim();
  if (!name) return;
  let item = state.items.find((i) => i.name === name);
  if (!item) {
    item = {
      id: C.id(),
      name,
      memo: "",
      image: null,
      icon:
        {
          財布: "wallet",
          鍵: "key",
          スマートフォン: "phone",
          イヤホン: "headphones",
        }[name] ?? "item",
      location: {
        type: "unknown",
        bagId: null,
        updatedAt: new Date().toISOString(),
      },
    };
    if (
      !commit((s) => s.items.push(item), "持ち物を追加しました", {
        keepDialog: true,
      })
    )
      return;
    editor
      .querySelector("#bag-item-choices")
      .insertAdjacentHTML("beforeend", itemCheckbox(item, true));
  } else {
    const checkbox = editor.querySelector(
      `input[name="itemIds"][value="${item.id}"]`,
    );
    if (checkbox) checkbox.checked = true;
  }
  input.value = "";
}
function quickTag() {
  const input = editor.querySelector("#quick-tag-name"),
    name = input.value.trim();
  if (!name) return;
  let t = state.tags.find((t) => t.name === name);
  if (!t) {
    t = {
      id: C.id(),
      name,
      defaultBagId: editor.querySelector("#event-bag").value || null,
      color: "sage",
    };
    if (
      !commit((s) => s.tags.push(t), "タグを追加しました", { keepDialog: true })
    )
      return;
    editor
      .querySelector("#event-tags")
      .insertAdjacentHTML(
        "beforeend",
        `<label class="check-chip"><input type="checkbox" name="tagIds" value="${t.id}" checked>${badge(t.name, t.color)}</label>`,
      );
  } else
    editor.querySelector(`input[name="tagIds"][value="${t.id}"]`).checked =
      true;
  if (t.defaultBagId) {
    editor.querySelector("#event-bag").value = t.defaultBagId;
    refreshEventItems();
  }
  input.value = "";
}
function shiftMonth(delta) {
  const d = C.dateAt(`${month}-01`);
  d.setMonth(d.getMonth() + delta);
  if (d.getFullYear() < 1900 || d.getFullYear() > 2200) return;
  month = C.dateKey(d).slice(0, 7);
  selectedDate = `${month}-01`;
  render();
}
async function resetData(sample = false) {
  if (
    !(await confirmAction(
      sample ? "自分のデータで始める" : "すべてのデータを削除",
      "現在の予定・バッグ・持ち物・タグ・写真をすべて削除します。必要なデータは、設定から先に書き出してください。",
      "削除して始める",
    ))
  )
    return;
  const next = C.emptyState();
  next.settings.onboarded = true;
  try {
    state = repo.save(next);
    failure = null;
    undo = null;
    selectedPrep = null;
    closeEditor();
    render();
    toast("空の状態から始めます");
  } catch (e) {
    showError(e.message);
  }
}
document.addEventListener("click", async (event) => {
  if (event.target.closest(".skip-link")) {
    event.preventDefault();
    document.querySelector("#main")?.focus();
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target || target.disabled) return;
  const action = target.dataset.action,
    id = target.dataset.id,
    key = target.dataset.key;
  try {
    switch (action) {
      case "close-editor":
        closeEditor();
        break;
      case "sample":
        state = repo.save(C.sampleState());
        render();
        break;
      case "start-empty":
        commit(
          (s) => (s.settings.onboarded = true),
          "まずはバッグや持ち物を登録しましょう",
        );
        break;
      case "clear-sample":
        await resetData(true);
        break;
      case "new-bag":
        bagForm();
        break;
      case "edit-bag":
        bagForm(id);
        break;
      case "copy-bag":
        bagForm(id, true);
        break;
      case "new-item":
        itemForm();
        break;
      case "edit-item":
        itemForm(id);
        break;
      case "new-tag":
        tagForm();
        break;
      case "edit-tag":
        tagForm(id);
        break;
      case "new-event":
        eventForm();
        break;
      case "edit-event":
        eventForm(key);
        break;
      case "event-detail":
        eventDetail(key);
        break;
      case "select-prep":
        selectedPrep = key;
        closeEditor();
        view = "home";
        location.hash = "home";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
        break;
      case "next-prep":
        selectedPrep = null;
        render();
        break;
      case "complete-item": {
        const e = getPrep();
        if (e)
          commit(
            (s) => C.completePreparation(s, e, [id]),
            "記録上の位置を更新しました",
            { allowUndo: true },
          );
        break;
      }
      case "complete-all": {
        const e = getPrep();
        if (e)
          commit(
            (s) =>
              C.completePreparation(
                s,
                e,
                C.preparation(s, e).map((a) => a.item.id),
              ),
            "すべて準備できました",
            { allowUndo: true },
          );
        break;
      }
      case "undo":
        if (undo && undo.revision === state.revision) {
          const prior = undo.before;
          state = repo.save({ ...prior, revision: state.revision });
          undo = null;
          render();
          toast("操作を元に戻しました");
        }
        break;
      case "prev-month":
        shiftMonth(-1);
        break;
      case "next-month":
        shiftMonth(1);
        break;
      case "today":
        selectedDate = C.dateKey(new Date());
        month = selectedDate.slice(0, 7);
        render();
        break;
      case "select-day":
        selectedDate = target.dataset.date;
        month = selectedDate.slice(0, 7);
        render();
        break;
      case "quick-item":
        quickItem();
        break;
      case "suggest-item":
        quickItem(target.dataset.name);
        break;
      case "quick-tag":
        quickTag();
        break;
      case "remove-photo":
        editorContext.image = null;
        editor.querySelector("#photo-preview").innerHTML = icon("photo");
        break;
      case "delete-current":
        await deleteCurrent();
        break;
      case "export":
        exportData();
        break;
      case "reset":
        await resetData();
        break;
      case "persist":
        toast(
          (await navigator.storage?.persist?.())
            ? "保存の保持が許可されました。"
            : "このブラウザでは保持の許可が得られませんでした。バックアップをご利用ください。",
        );
        break;
      case "install":
        if (installPrompt) {
          await installPrompt.prompt();
          installPrompt = null;
          render();
        }
        break;
      case "reload":
        location.reload();
        break;
      case "rescue-raw":
        download(repo?.raw ?? "", "PackCalendar-recovery-raw.json");
        break;
    }
  } catch (e) {
    showError(e.message);
  }
});
document.addEventListener("submit", (event) => {
  if (event.target.id === "edit-form") submitForm(event);
});
document.addEventListener("change", async (event) => {
  const target = event.target;
  if (target.dataset.location) {
    const type = ["home", "other", "unknown"].includes(target.value)
        ? target.value
        : "bag",
      ctx = editorContext;
    commit(
      (s) =>
        C.setLocation(
          s,
          [target.dataset.location],
          type,
          type === "bag" ? target.value : null,
        ),
      "記録上の位置を更新しました",
      { keepDialog: true, allowUndo: true },
    );
    if (ctx?.type === "detail") eventDetail(ctx.key);
  }
  if (target.id === "week-start")
    commit(
      (s) => (s.settings.weekStart = Number(target.value)),
      "表示設定を保存しました",
    );
  if (target.classList.contains("month-picker")) {
    if (/^(19\d{2}|20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(target.value)) {
      month = target.value;
      selectedDate = `${month}-01`;
      render();
    } else {
      target.value = month;
      toast("年月は1900-01から2200-12の範囲で入力してください。");
    }
  }
  if (target.id === "import-file") {
    await importData(target.files[0]);
    target.value = "";
  }
  if (target.id === "photo-input") await updatePhoto(target.files[0]);
  if (target.id === "edit-scope") eventForm(editorContext.key, target.value);
  if (target.id === "reuse-set") {
    const b = C.bagById(state, target.value);
    if (b)
      for (const box of editor.querySelectorAll('[name="itemIds"]'))
        box.checked = b.itemIds.includes(box.value);
  }
  if (target.name === "tagIds" && target.checked) {
    const t = state.tags.find((t) => t.id === target.value);
    if (t?.defaultBagId) {
      editor.querySelector("#event-bag").value = t.defaultBagId;
      refreshEventItems();
    }
  }
  if (target.id === "event-bag") refreshEventItems();
  if (target.id === "event-recurrence")
    editor.querySelector('[name="until"]').disabled = target.value === "none";
});
document.addEventListener("input", (event) => {
  if (event.target.id === "item-search") {
    const input = event.target,
      position = input.selectionStart;
    search = input.value;
    render();
    const next = document.querySelector("#item-search");
    next.focus();
    try {
      next.setSelectionRange(position, position);
    } catch {}
  }
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    ["quick-item-name", "quick-tag-name"].includes(event.target.id)
  ) {
    event.preventDefault();
    event.target.id === "quick-item-name" ? quickItem() : quickTag();
  }
});
window.addEventListener("hashchange", () => {
  const next = location.hash.slice(1);
  view = views[next] ? next : "home";
  closeEditor();
  render();
  window.scrollTo(0, 0);
});
window.addEventListener("storage", (event) => {
  if (repo && (event.key === repo.key || event.key === null)) {
    try {
      state = repo.load();
      failure = null;
      undo = null;
      closeEditor();
      render();
      toast(
        "別のタブでの変更を反映しました。編集中の内容があった場合は入力し直してください。",
      );
    } catch (e) {
      failure = e;
      render();
    }
  }
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  if (view === "settings") render();
});
function renderRecovery() {
  app.innerHTML = `<main class="recovery panel"><h1>保存データを確認できませんでした</h1><p>${esc(failure.message)}</p><p>保存済みデータを上書きせずに停止しています。再読み込みするか、バックアップから復元できます。</p><div class="button-row">${act("再読み込み", "reload", "primary")}${repo?.raw ? act("元データを救出", "rescue-raw", "secondary") : ""}${repo ? `<label class="btn secondary">バックアップを読み込む<input id="import-file" type="file" class="visually-hidden" accept=".json"></label>${act("データをリセット", "reset", "danger secondary")}` : ""}</div></main>`;
}
render();
if ("serviceWorker" in navigator && window.isSecureContext) {
  navigator.serviceWorker
    .register(new URL("../sw.js", import.meta.url), { scope: namespace })
    .then(async (registration) => {
      await navigator.serviceWorker.ready;
      offlineReady = true;
      if (view === "settings") render();
      if (registration.waiting)
        toast(
          "新しい版があります。すべてのPackCalendarタブを閉じて開き直すと更新されます。",
        );
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            toast(
              "新しい版の準備ができました。すべてのタブを閉じて開き直すと更新されます。",
            );
        });
      });
    })
    .catch(() => {
      offlineReady = false;
      toast(
        "オフライン起動の準備ができませんでした。接続中の利用と端末内保存は続けられます。",
      );
    });
}
setInterval(() => {
  if (!editor.open && !confirmation.open && view === "home" && !failure)
    render();
}, 60000);
