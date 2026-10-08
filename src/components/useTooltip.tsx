import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Position } from "../patch/types";

const GAP = 6;
const MARGIN = 8;
const HOVER_DELAY = 400;

/**
 * A tooltip under a button: it opens once the pointer rests on the button a moment, or while the
 * button has the focus, until Escape. A pinnable one stays open after a click, until another click
 * or a click anywhere else.
 */
export function useTooltip(text: ReactNode, { pinnable = false } = {}) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [place, setPlace] = useState<Position>({ x: 0, y: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const id = useId();
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);

  const cancel = () => clearTimeout(pending.current);

  const close = () => {
    cancel();
    setOpen(false);
    setPinned(false);
  };

  useEffect(() => cancel, []);

  useLayoutEffect(() => {
    if (!open || !trigger.current || !tip.current) {
      return;
    }
    const button = trigger.current.getBoundingClientRect();
    const { width } = tip.current.getBoundingClientRect();
    setPlace({ x: Math.max(MARGIN, Math.min(button.left, window.innerWidth - width - MARGIN)), y: button.bottom + GAP });
  }, [open]);

  useEffect(() => {
    if (!pinned) {
      return;
    }
    const outside = (event: Event) => {
      if (!trigger.current?.contains(event.target as Node)) {
        close();
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [pinned]);

  const triggerProps = {
    ref: trigger,
    "aria-describedby": open ? id : undefined,
    onPointerEnter: () => {
      cancel();
      pending.current = setTimeout(() => setOpen(true), HOVER_DELAY);
    },
    onPointerLeave: () => {
      cancel();
      setOpen(pinned);
    },
    onFocus: () => setOpen(true),
    onBlur: close,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) {
        event.stopPropagation();
        close();
      }
    },
  };

  const toggle = () => {
    cancel();
    if (pinnable) {
      setOpen(!pinned);
      setPinned(!pinned);
    }
  };

  const tooltip =
    open &&
    createPortal(
      <div ref={tip} id={id} className="help-tip" role="tooltip" style={{ left: place.x, top: place.y }}>
        {text}
      </div>,
      document.body,
    );

  return { open, triggerProps, toggle, tooltip };
}
