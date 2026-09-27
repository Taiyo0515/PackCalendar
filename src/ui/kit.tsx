import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { BAG_COLORS } from "../core/model";
import type { Bag, Item } from "../core/model";
import { initial } from "../core/prep";

export function Sheet(props: {
  onClose: () => void;
  full?: boolean;
  nested?: boolean;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const focusable = ref.current?.querySelector<HTMLElement>("[autofocus]") ?? ref.current;
    focusable?.focus({ preventScroll: true });
    return () => prev?.focus?.({ preventScroll: true });
  }, []);
  return (
    <div
      className="shade"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        ref={ref}
        className={`sheet${props.full ? " full" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.label}
        tabIndex={-1}
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
