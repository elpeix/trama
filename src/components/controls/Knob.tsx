import { useEffect, useId, useRef } from "react";
import { toSliderPosition, type ValueRange } from "./scale";
import { incrementsOf, useValueControl } from "./useValueControl";

const SIZE = 30;
const CENTER = SIZE / 2;
/** The value is lit on a ring round the knob, like the LED ring of an encoder. */
const ARC_RADIUS = 11.5;
/** The modulation goes round the edge of the ring, outside the arc of its value. */
const MODULATION_RADIUS = 13.7;
/** The knob itself: a ridged skirt, and a domed cap on it with the pointer painted on. */
const SKIRT_RADIUS = 9;
const CAP_RADIUS = 7;
/** Closer than this to the value, a modulation is not drawn: a cable at 0 or a signal at rest. */
const MODULATION_MIN = 0.002;
/** The knob turns 270°, from 135° left of the top to 135° right of it. */
const SWEEP = 270;

const angleAt = (position: number) => ((position * SWEEP - SWEEP / 2) * Math.PI) / 180;

const pointAt = (position: number, radius: number) => {
  const angle = angleAt(position);
  return { x: CENTER + radius * Math.sin(angle), y: CENTER - radius * Math.cos(angle) };
};

function arc(from: number, to: number, radius = ARC_RADIUS) {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const a = pointAt(start, radius);
  const b = pointAt(end, radius);
  const large = (end - start) * SWEEP > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${radius} ${radius} 0 ${large} 1 ${b.x} ${b.y}`;
}

interface KnobProps {
  /** Where the value is, from 0 to 1 along the range. */
  position: number;
  /** Where the lit arc starts: 0 for most values, the middle for values that go below zero. */
  origin: number;
  /** Where the value is taken by its modulation right now, read on every frame. */
  modulated?: () => number | undefined;
}

/**
 * A knob like those of a hardware synth: a ridged skirt and a domed cap, lit from above, that
 * cast a shadow on the panel. Its value is lit in green on a ring round it, and a modulated value
 * also shows, in orange round the edge, how far the modulation takes it.
 */
export function Knob({ position, origin, modulated }: KnobProps) {
  const tip = pointAt(position, CAP_RADIUS - 0.5);
  const base = pointAt(position, 2.5);
  // Gradients are found by id, so each knob needs ids of its own.
  const id = useId();
  const [skirtFill, capFill] = [`${id}-skirt`, `${id}-cap`];
  const modulationArc = useRef<SVGPathElement>(null);
  const modulationDot = useRef<SVGCircleElement>(null);
  const latest = useRef({ position, modulated });
  const modulating = modulated !== undefined;

  useEffect(() => {
    latest.current = { position, modulated };
  }, [position, modulated]);

  // Drawn outside React, on every frame, like the other displays that follow the sound.
  useEffect(() => {
    const [path, dot] = [modulationArc.current, modulationDot.current];
    if (!modulating || !path || !dot) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      const { position: from, modulated: read } = latest.current;
      const to = read?.();
      const showing = to !== undefined && Math.abs(to - from) >= MODULATION_MIN;
      path.style.display = dot.style.display = showing ? "" : "none";
      if (showing) {
        const end = pointAt(to, MODULATION_RADIUS);
        path.setAttribute("d", arc(from, to, MODULATION_RADIUS));
        dot.setAttribute("cx", String(end.x));
        dot.setAttribute("cy", String(end.y));
      }
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [modulating]);

  return (
    <svg className="knob-face" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      <defs>
        <linearGradient id={skirtFill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="knob-skirt-top" />
          <stop offset="1" className="knob-skirt-bottom" />
        </linearGradient>
        <radialGradient id={capFill} cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" className="knob-cap-light" />
          <stop offset="0.6" className="knob-cap-mid" />
          <stop offset="1" className="knob-cap-dark" />
        </radialGradient>
      </defs>
      <circle className="knob-body" cx={CENTER} cy={CENTER} r={CENTER - 0.5} />
      <path className="knob-track" d={arc(0, 1)} />
      {position !== origin && <path className="knob-arc" d={arc(origin, position)} />}
      <circle className="knob-skirt" cx={CENTER} cy={CENTER} r={SKIRT_RADIUS} fill={`url(#${skirtFill})`} />
      <circle className="knob-grip" cx={CENTER} cy={CENTER} r={(SKIRT_RADIUS + CAP_RADIUS) / 2} />
      <circle className="knob-cap" cx={CENTER} cy={CENTER} r={CAP_RADIUS} fill={`url(#${capFill})`} />
      <line className="knob-pointer" x1={base.x} y1={base.y} x2={tip.x} y2={tip.y} />
      {modulating && (
        <>
          <path ref={modulationArc} className="knob-modulation" style={{ display: "none" }} />
          <circle ref={modulationDot} className="knob-modulation-dot" r={1.75} style={{ display: "none" }} />
        </>
      )}
    </svg>
  );
}

/** Pixels of vertical drag across the whole range of a knob, whatever the range. */
const KNOB_TRAVEL = 160;

interface KnobControlProps {
  label: string;
  value: number;
  range: ValueRange;
  /** Changes of a drag or the keys merge into one undo step; a typed value asks not to. */
  onChange: (value: number, options?: { merge?: boolean }) => void;
  format: (value: number) => string;
  parse: (text: string) => number | undefined;
  /** Values a drag snaps to, besides 0 for a range that goes below zero. */
  snaps?: number[];
  /** Another value that sets this one, which then cannot be changed. */
  locked?: { value: number; label: string };
  /** The value its modulation takes it to right now, read on every frame; undefined when none. */
  modulated?: () => number | undefined;
  /** Called when a drag takes hold of the knob, and when it lets go. */
  onGrab?: () => void;
  onRelease?: () => void;
}

/**
 * A knob and its value, side by side: drag the knob up or down, scroll it or use the keys, Alt
 * for fine steps, and double-click it, its value or press Enter to type a value. Values that go
 * below zero light the knob from the middle and snap to 0.
 */
export function KnobControl({
  label,
  value,
  range,
  onChange,
  format,
  parse,
  snaps = [],
  locked,
  modulated,
  onGrab,
  onRelease,
}: KnobControlProps) {
  const bipolar = range.scale === "linear" && range.min < 0 && range.max > 0;
  const { draft, setDraft, displayProps, inputProps } = useValueControl({
    value,
    range,
    onChange,
    // Each typed value is its own undo step, even when typed quickly after another change.
    onTyped: (typed) => onChange(typed, { merge: false }),
    parse,
    dragPixels: KNOB_TRAVEL / incrementsOf(range),
    snaps: bipolar ? [...snaps, 0] : snaps,
    onGrab,
    onRelease,
  });
  const numeric = locked?.value ?? value;
  const text = locked?.label ?? format(numeric);
  const { ref: knob, onDoubleClick: startTyping, ...knobProps } = displayProps;

  return (
    <>
      <div
        className="knob nodrag nopan nowheel"
        aria-label={label}
        aria-valuetext={text}
        title={locked ? undefined : "Drag up or down or scroll, Alt for fine steps; double-click to type"}
        {...(locked
          ? { role: "slider", "aria-disabled": true, "aria-valuenow": numeric, "aria-valuemin": range.min, "aria-valuemax": range.max }
          : { ...knobProps, ref: knob, role: "slider", onDoubleClick: startTyping })}
      >
        <Knob
          position={toSliderPosition(numeric, range)}
          origin={bipolar ? toSliderPosition(0, range) : 0}
          modulated={
            modulated &&
            (() => {
              const reached = modulated();
              return reached === undefined ? undefined : toSliderPosition(reached, range);
            })
          }
        />
      </div>
      {draft === null ? (
        // Not a place to pan from, so double-clicking it types instead of zooming the editor.
        <output
          className="knob-value nodrag nopan"
          title={locked ? undefined : "Double-click to type a value"}
          onDoubleClick={locked ? undefined : startTyping}
        >
          {text}
        </output>
      ) : (
        <input
          {...inputProps}
          className="knob-input nodrag nopan"
          aria-label={label}
          // The field takes the width of the value it replaces: at its default size of 20
          // characters it would widen the node.
          size={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            inputProps.onKeyDown(event);
            // Back to the knob, to keep adjusting from the keyboard.
            if (event.key === "Enter" || event.key === "Escape") {
              knob.current?.focus();
            }
          }}
        />
      )}
    </>
  );
}
