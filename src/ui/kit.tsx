import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BAG_COLORS } from "../core/model";
import type { Bag, Item } from "../core/model";
import { initial } from "../core/prep";

export function Sheet(props: {
  onClose: () => void;
  /** Full-screen sheet from the start (the event editor). */
  full?: boolean;
  nested?: boolean;
  /** Draggable sheet: slide up to fill the screen, slide down to collapse or close. */
  expandable?: boolean;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [drag, setDrag] = useState(0); // live translateY while dragging
  const [dragging, setDragging] = useState(false); // finger tracking: no CSS transition
  const [moving, setMoving] = useState(false); // snap/expand/leave in progress
  const [leaving, setLeaving] = useState(false);
  const gesture = useRef<{
    x: number;
    y: number;
    origin: "edge" | "body";
    /** Whether the sheet owns the finger (display tracking); claimed on first intent for body gestures. */
    claimed: boolean;
    /** Raw finger travel samples for fling detection: {ms, dy}. */
    hist: Array<{ t: number; dy: number }>;
  } | null>(null);
  const offsets = useRef({ peek: 0, full: 0 });
  const state = useRef({ phase: props.full ? ("full" as const) : ("peek" as const), leaving: false });
  /** Sheets that can also grow to full height (the day sheet); others just close. */
  const peekable = props.expandable === true;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const focusable = ref.current?.querySelector<HTMLElement>("[autofocus]") ?? ref.current;
    focusable?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);

  // Measure the peek height once (content is static while mounted) and the full height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    offsets.current.peek = el.getBoundingClientRect().height;
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:calc(env(safe-area-inset-top,0px))";
    document.body.appendChild(probe);
    offsets.current.full = Math.round(window.innerHeight - probe.getBoundingClientRect().height - 12);
    probe.remove();
  }, []);

  /** Glide to a phase while the CSS keeps the class-based height honest afterwards. */
  const settle = (next: "peek" | "full") => {
    const el = ref.current;
    if (!el || state.current.leaving) return;
    state.current.phase = next;
    setDragging(false);
    setExpanded(next === "full");
    setDrag(0);
    setMoving(true);
    el.style.height = `${Math.round(el.getBoundingClientRect().height)}px`;
    void el.offsetHeight;
    requestAnimationFrame(() => {
      el.style.height = `${Math.round(next === "full" ? offsets.current.full : offsets.current.peek)}px`;
      setTimeout(() => {
        if (!state.current.leaving) el.style.height = "";
        setMoving(false);
      }, 280);
    });
  };

  const leave = () => {
    if (state.current.leaving) return;
    state.current.leaving = true;
    setLeaving(true);
    setTimeout(() => props.onClose(), 240);
  };

  const onDown = (e: React.TouchEvent) => {
    const el = ref.current;
    if (!el || moving || state.current.leaving) return;
    const target = e.target as HTMLElement;
    const grip = !!target.closest(".grip");
    const head = !!target.closest(".sheet-head");
    const typing = !!target.closest("input,textarea");
    if (typing) return;
    // From the body itself, only when no scrolled content between here and the sheet owns the finger.
    let origin: "edge" | "body" | null = grip || head ? "edge" : "body";
    if (origin === "body") {
      let node: HTMLElement | null = target;
      while (node && node !== el) {
        if (node.scrollTop > 0) {
          return;
        }
        node = node.parentElement;
      }
    }
    // A body gesture is only a CANDIDATE: the display stays untouched, so the browser
    // can scroll (or a pager can take the finger) without interrupted scroll starts.
    gesture.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      origin,
      claimed: origin === "edge",
      hist: [{ t: performance.now(), dy: 0 }],
    };
    if (origin === "edge") setDragging(true);
  };
  const onMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g) return;
    const dx = e.touches[0].clientX - g.x;
    const raw = e.touches[0].clientY - g.y;
    g.hist.push({ t: performance.now(), dy: raw });
    if (g.hist.length > 32) g.hist.shift();
    if (g.origin === "body" && !g.claimed) {
      // Awaiting intent: sideways belongs to a pager, up to scrolling (or, on a peeked
      // day sheet, to expanding). Only a clear downward pull makes it a sheet drag NOW.
      if (Math.abs(dx) > Math.abs(raw)) {
        gesture.current = null;
        return;
      }
      if (raw <= 0) {
        if (peekable && state.current.phase === "peek" && raw < -8) {
          gesture.current = null;
          settle("full");
        }
        return;
      }
      if (raw < 8) return;
      g.claimed = true;
      const el = ref.current;
      if (el) el.dataset.dragged = "1"; // taps right after a real drag are ignored
      setDragging(true); // freeze transitions from here, when the sheet really owns the finger
    }
    if (g.claimed) {
      const dy = g.origin === "body" ? raw : raw < 0 ? raw / 3 : raw; // rubber band up from edge
      setDrag(dy);
    }
  };
  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    const dy = drag;
    const el = ref.current;
    if (g.origin === "body" && el?.dataset.dragged) setTimeout(() => delete el.dataset.dragged, 150);
    const p = state.current.phase;
    // End-of-gesture speed decides whether a small quick flick counts like a full pull.
    let flickUp = false;
    let flickDown = false;
    {
      const h = g.hist;
      const end = h[h.length - 1];
      const window = h.filter((s) => end.t - s.t <= 140);
      const first = window[0];
      const dt = end.t - first.t;
      if (dt >= 16) {
        const v = (end.dy - first.dy) / dt; // px/ms over the final stretch of the gesture
        flickUp = end.dy < -6 && v < -0.55;
        flickDown = end.dy > 6 && v > 0.55;
      }
    }
    if (p === "peek") {
      if (dy < -70 || flickUp) return settle(peekable ? "full" : "peek");
      if (dy > 70 || flickDown) return leave();
      return settle("peek");
    }
    if (peekable) {
      // The day sheet folds back to peek, it does not close from full.
      if (dy > 90 || flickDown) return settle("peek");
      return settle("full");
    }
    // Any other sheet: a decent pull from anywhere dismisses it.
    if (dy > 90 || flickDown) return leave();
    return settle("full");
  };

  return (
    <div
      className={`shade${leaving ? " leaving" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        ref={ref}
        className={`sheet${props.full || expanded ? " full" : ""}${dragging ? " dragging" : ""}${leaving ? " leaving" : ""}`}
        style={leaving ? undefined : dragging || moving ? { transform: `translateY(${drag}px)` } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={props.label}
        tabIndex={-1}
        onTouchStart={onDown}
        onTouchMove={onMove}
        onTouchEnd={onUp}
        onTouchCancel={onUp}
        onKeyDown={(e) => {
          // Nested sheets (inside a screen) close themselves; screens close via App.
          if (e.key === "Escape" && props.nested) {
            e.preventDefault();
            props.onClose();
          }
        }}
      >
        <div className="grip" />
        {props.children}
      </div>
    </div>
  );
}

export function Switch(props: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      className="switch"
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      onClick={() => props.onChange(!props.on)}
    />
  );
}

export function Segment<T extends string | number>(props: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segment" role="group" aria-label={props.label}>
      {props.options.map(([v, text]) => (
        <button key={String(v)} aria-pressed={props.value === v} onClick={() => props.onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export const bagColor = (b: Bag | null | undefined) => (b ? BAG_COLORS[b.color] : "var(--neutral)");

export function BagChip(props: { bag: Bag; on: boolean; onClick: () => void }) {
  return (
    <button className="chip" aria-pressed={props.on} onClick={props.onClick}>
      <span className="dot" style={{ background: bagColor(props.bag) }} />
      {props.bag.name}
    </button>
  );
}

const urls = new Map<string, string>();
export function photoURL(id: string, blob?: Blob) {
  if (blob) {
    const old = urls.get(id);
    if (old) URL.revokeObjectURL(old);
    urls.set(id, URL.createObjectURL(blob));
  }
  return urls.get(id);
}

export function Avatar(props: { item: Pick<Item, "name" | "photoId">; photos: Record<string, string> }) {
  const src = props.item.photoId ? props.photos[props.item.photoId] : undefined;
  return <span className="avatar">{src ? <img src={src} alt="" /> : initial(props.item.name)}</span>;
}

export interface ToastState {
  text: string;
  undo?: () => void;
  id: number;
}
export function Toast(props: { toast: ToastState | null; onDone: () => void }) {
  const { toast, onDone } = props;
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, toast.undo ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast, onDone]);
  if (!toast) return null;
  return (
    <div className="toast" role="status">
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          onClick={() => {
            toast.undo!();
            onDone();
          }}
        >
          元に戻す
        </button>
      )}
    </div>
  );
}

/** Tracks a media query. */
export function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setMatch(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}
