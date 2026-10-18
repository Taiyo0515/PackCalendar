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
  const gesture = useRef<{ y: number; active: boolean } | null>(null);
  const offsets = useRef({ peek: 0, full: 0 });
  const state = useRef({ phase: "peek" as "peek" | "full", leaving: false });

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const focusable = ref.current?.querySelector<HTMLElement>("[autofocus]") ?? ref.current;
    focusable?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);

  // Measure the peek height once (DaySheet content is static while mounted) and the full height.
  useEffect(() => {
    if (!props.expandable) return;
    const el = ref.current;
    if (!el) return;
    offsets.current.peek = el.getBoundingClientRect().height;
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;height:calc(env(safe-area-inset-top,0px))";
    document.body.appendChild(probe);
    offsets.current.full = Math.round(window.innerHeight - probe.getBoundingClientRect().height - 12);
    probe.remove();
  }, [props.expandable]);

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
    if (!props.expandable) return;
    const el = ref.current;
    if (!el || moving || state.current.leaving) return;
    const target = e.target as HTMLElement;
    const grip = !!target.closest(".grip");
    const head = !!target.closest(".sheet-head") && !target.closest("button,input,textarea");
    if (!grip && !head) return;
    gesture.current = { y: e.touches[0].clientY, active: true };
    setDragging(true); // freeze height/transform transitions while tracking the finger
  };
  const onMove = (e: React.TouchEvent) => {
    const g = gesture.current;
    if (!g?.active) return;
    let dy = e.touches[0].clientY - g.y;
    if (dy < 0 && state.current.phase === "peek") dy /= 3; // rubber band while stretching upward
    setDrag(dy);
  };
  const onUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.active) return;
    const dy = drag;
    if (state.current.phase === "peek" && dy < -70) return settle("full");
    if (state.current.phase === "peek" && dy > 70) return leave();
    if (state.current.phase === "full" && dy > 90) return settle("peek");
    return settle(state.current.phase); // snap back where it was
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
