import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fromSliderPosition, limitToRange, toSliderPosition, type ValueRange } from "./scale";

/** Increments across the whole range of a log value, where the step alone would be far too fine. */
const LOG_INCREMENTS = 200;
/** Increments moved at once with Shift or the page keys. */
const BIG_MOVE = 10;
/** How much finer dragging and scrolling get while Alt (Option on a Mac) is held. */
const FINE = 10;
/** While dragging, values closer than this to a snap point, as a fraction of the range, snap to it. */
const SNAP_DISTANCE = 0.02;

export const incrementsOf = (range: ValueRange) =>
  range.scale === "log" ? LOG_INCREMENTS : Math.round((range.max - range.min) / range.step);

/**
 * Moves a value by a number of increments along its range, so a log value moves as much at the
 * bottom of its range as at the top. Always moves at least one step, or a small log value could
 * round back to itself and never change.
 */
function moveBy(value: number, count: number, range: ValueRange): number {
  const moved = fromSliderPosition(toSliderPosition(value, range) + count / incrementsOf(range), range);
  return moved !== value || count === 0 ? moved : limitToRange(value + Math.sign(count) * range.step, range);
}

interface ValueTypingOptions {
  value: number;
  range: ValueRange;
  onChange: (value: number) => void;
  /** Reads a typed value; `undefined` keeps the current one. By default, a plain number. */
  parse?: (text: string) => number | undefined;
}

const parseNumber = (text: string) => {
  const typed = Number(text);
  return text.trim() !== "" && Number.isFinite(typed) ? typed : undefined;
};

/**
 * Typing a value in a text field: `startTyping` shows the field, which the component draws while
 * `draft` is not null, spreading `inputProps` on it. Enter or leaving the field saves, Escape
 * cancels, and the saved value is kept inside the range and on its step.
 */
export function useValueTyping({ value, range, onChange, parse = parseNumber }: ValueTypingOptions) {
  const [draft, setDraft] = useState<string | null>(null);
  // Finishing moves the focus, which blurs the field before it goes away: that blur must not save
  // a second time, nor save what Escape cancelled.
  const typing = useRef(false);

  const startTyping = () => {
    typing.current = true;
    setDraft(String(value));
  };

  const finishTyping = (save: boolean) => {
    if (!typing.current) {
      return;
    }
    typing.current = false;
    const typed = save && draft !== null ? parse(draft) : undefined;
    if (typed !== undefined) {
      onChange(limitToRange(typed, range));
    }
    setDraft(null);
  };

  const inputProps = {
    value: draft ?? "",
    autoFocus: true,
    onFocus: (event: { target: HTMLInputElement }) => event.target.select(),
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        finishTyping(true);
      } else if (event.key === "Escape") {
        finishTyping(false);
      }
    },
    onBlur: () => finishTyping(true),
  };

  return { draft, setDraft, startTyping, inputProps };
}

interface ValueControlOptions extends ValueTypingOptions {
  /** Pixels of vertical drag for one increment. */
  dragPixels?: number;
  /** Values that a drag snaps to when it gets close, like the default or 0. */
  snaps?: number[];
  /** Called instead of `onChange` for a typed value, which may need to be told apart. */
  onTyped?: (value: number) => void;
  /** Called when a drag takes hold of the value, and when it lets go. */
  onGrab?: () => void;
  onRelease?: () => void;
}

/**
 * The behaviour of a value shown like the display of a hardware synth: drag it up or down, scroll
 * it, use the arrow keys, or double-click it (or press Enter) to type a value. Holding Alt makes
 * dragging and scrolling finer, and stops a drag from snapping. It leaves the look
 * to the component, which spreads `displayProps` on the value and `inputProps` on the text field
 * shown while `draft` is not null.
 */
export function useValueControl({ dragPixels = 3, snaps = [], onTyped, onGrab, onRelease, ...options }: ValueControlOptions) {
  const { value, range, onChange } = options;
  const { draft, setDraft, startTyping, inputProps } = useValueTyping({ ...options, onChange: onTyped ?? onChange });
  const display = useRef<HTMLDivElement>(null);
  // A drag measures from where it started, or from where Alt was last pressed or released, so
  // switching to fine adjustment halfway never makes the value jump.
  const drag = useRef<{ y: number; position: number; fine: boolean; value: number } | null>(null);
  const latest = useRef({ value, range, onChange });
  const showingValue = draft === null;

  useEffect(() => {
    latest.current = { value, range, onChange };
  }, [value, range, onChange]);

  // Scrolling must not also scroll or zoom what is behind, so the listener cannot be passive.
  useEffect(() => {
    const element = display.current;
    if (!element) {
      return;
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { value: current, range: currentRange, onChange: change } = latest.current;
      const increments = event.altKey ? 1 / FINE : 1;
      change(moveBy(current, event.deltaY < 0 ? increments : -increments, currentRange));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [showingValue]);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const increments = event.shiftKey ? BIG_MOVE : 1;
    const changes: Record<string, () => number> = {
      ArrowUp: () => moveBy(value, increments, range),
      ArrowRight: () => moveBy(value, increments, range),
      ArrowDown: () => moveBy(value, -increments, range),
      ArrowLeft: () => moveBy(value, -increments, range),
      PageUp: () => moveBy(value, BIG_MOVE, range),
      PageDown: () => moveBy(value, -BIG_MOVE, range),
      Home: () => range.min,
      End: () => range.max,
    };
    if (event.key in changes) {
      event.preventDefault();
      onChange(changes[event.key]());
    } else if (event.key === "Enter") {
      event.preventDefault();
      startTyping();
    }
  };

  const endDrag = () => {
    if (drag.current) {
      onRelease?.();
    }
    drag.current = null;
  };

  const displayProps = {
    ref: display,
    role: "spinbutton",
    tabIndex: 0,
    "aria-valuenow": value,
    "aria-valuemin": range.min,
    "aria-valuemax": range.max,
    onKeyDown,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { y: event.clientY, position: toSliderPosition(value, range), fine: event.altKey, value };
      onGrab?.();
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (!drag.current) {
        return;
      }
      const fine = event.altKey;
      if (fine !== drag.current.fine) {
        const { value: reached } = drag.current;
        drag.current = { y: event.clientY, position: toSliderPosition(reached, range), fine, value: reached };
      }
      const pixels = dragPixels * incrementsOf(range) * (fine ? FINE : 1);
      const position = drag.current.position + (drag.current.y - event.clientY) / pixels;
      const snap = fine ? undefined : snaps.find((point) => Math.abs(toSliderPosition(point, range) - position) < SNAP_DISTANCE);
      const next = snap ?? fromSliderPosition(position, range);
      if (next !== drag.current.value) {
        drag.current.value = next;
        onChange(next);
      }
    },
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onDoubleClick: startTyping,
  };

  return { draft, setDraft, displayProps, inputProps };
}
