import { useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { moduleRegistry } from "../../patch/registry";
import { EngineContext } from "../EngineContext";
import { peakOf } from "./level";
import { SampleHistory, sidesDiffer, triggerLookback, triggerStart, tracePoints, type ScopeTrace } from "./scopeTrace";

const READOUT_INTERVAL_MS = 150;
/** Seconds of signal kept beyond the longest window, so even the longest one has room to trigger. */
const TRIGGER_MARGIN_SECONDS = 1;
const SIDES = ["left", "right"] as const;
/** Each side of a trace is read and kept apart, by the side and the id of the trace. */
const sideKey = (id: string, side: (typeof SIDES)[number]) => `${side}:${id}`;
/** How long the screen stays split in two lanes after the sides of a signal last differed, so it does not flicker. */
const STEREO_HOLD_MS = 1000;
const formatLevel = (value: number) => (value >= 10 ? value.toFixed(1) : value.toFixed(2));

const maxTime = () => {
  const time = moduleRegistry.scope.params.find(({ id }) => id === "time");
  return time?.kind === "number" ? time.max : 5;
};

interface ScopeDisplayProps {
  nodeId: string;
  time: number;
  range: number;
  traces: ScopeTrace[];
  /** The trace the others are lined up against, kept in the patch; empty until one is chosen. */
  trigger: string;
  onTrigger: (trace: string) => void;
}

interface TraceState {
  analyser: AnalyserNode;
  buffer: Float32Array<ArrayBuffer>;
  history: SampleHistory;
  visible: Float32Array;
  peak: number;
}

export function ScopeDisplay({ nodeId, time, range, traces, trigger: chosen, onTrigger }: ScopeDisplayProps) {
  const engine = useContext(EngineContext);
  const canvas = useRef<HTMLCanvasElement>(null);
  const peakReadouts = useRef(new Map<string, HTMLElement>());
  const trigger = traces.some(({ id }) => id === chosen) ? chosen : (traces[0]?.id ?? null);
  const settings = useRef({ time, range, traces, trigger });
  const [stereo, setStereo] = useState(false);

  useEffect(() => {
    settings.current = { time, range, traces, trigger };
  }, [time, range, traces, trigger]);

  useEffect(() => {
    const element = canvas.current;
    const context = engine && element?.getContext("2d");
    if (!engine || !element || !context) {
      return;
    }

    let frame = 0;
    let lastTime: number | undefined;
    let lastReadout = -Infinity;
    let lastStereo = -Infinity;
    let split = false;
    const states = new Map<string, TraceState>();

    /** Reads the new samples of each side of every trace. */
    const readAll = () => {
      const live = new Set(settings.current.traces.flatMap(({ id }) => SIDES.map((side) => sideKey(id, side))));
      for (const id of states.keys()) {
        if (!live.has(id)) {
          states.delete(id);
        }
      }
      let fresh: number | undefined;
      let currentTime: number | undefined;
      const sides = settings.current.traces.flatMap(({ id }) => {
        const probe = engine.getProbe(nodeId, id);
        if (!probe) {
          SIDES.forEach((side) => states.delete(sideKey(id, side)));
          return [];
        }
        return SIDES.map((side) => ({ key: sideKey(id, side), analyser: probe[side] }));
      });
      for (const { key, analyser } of sides) {
        let state = states.get(key);
        const isNew = state?.analyser !== analyser;
        if (!state || isNew) {
          state = {
            analyser,
            buffer: new Float32Array(analyser.fftSize),
            history: new SampleHistory(
              Math.ceil((maxTime() + TRIGGER_MARGIN_SECONDS) * analyser.context.sampleRate),
            ),
            visible: new Float32Array(0),
            peak: 0,
          };
          states.set(key, state);
        }
        currentTime ??= analyser.context.currentTime;
        fresh ??=
          lastTime === undefined
            ? analyser.fftSize
            : Math.round((currentTime - lastTime) * analyser.context.sampleRate);
        analyser.getFloatTimeDomainData(state.buffer);
        const count = isNew ? state.buffer.length : Math.min(state.buffer.length, Math.max(0, fresh));
        state.history.push(state.buffer.subarray(state.buffer.length - count));
      }
      lastTime = currentTime ?? lastTime;
    };

    /** The samples each trace shows, all starting at the same instant: the trigger of the reference. */
    const visibleSamples = () => {
      const first = states.values().next().value;
      if (!first) {
        return new Map<string, Float32Array>();
      }
      const { sampleRate } = first.analyser.context;
      const length = Math.max(2, Math.round(settings.current.time * sampleRate));
      const lookback = triggerLookback(length, first.history.capacity, sampleRate);
      const reference = states.get(sideKey(settings.current.trigger ?? "", "left")) ?? first;
      const shown = new Map<string, Float32Array>();
      // The analyser holds the newest samples untouched; only longer searches need the history.
      const searched = length + lookback;
      if (searched <= first.buffer.length) {
        const start = triggerStart(reference.buffer, length, lookback);
        states.forEach((state, id) => shown.set(id, state.buffer.subarray(start, start + length)));
        return shown;
      }
      states.forEach((state) => {
        if (state.visible.length !== searched) {
          state.visible = new Float32Array(searched);
        }
        state.history.latest(state.visible);
      });
      const start = triggerStart(reference.visible, length, lookback);
      states.forEach((state, id) => shown.set(id, state.visible.subarray(start, start + length)));
      return shown;
    };

    const showPeaks = (shown: Map<string, Float32Array>, now: number) => {
      shown.forEach((samples, id) => {
        const state = states.get(id)!;
        state.peak = Math.max(state.peak, peakOf(samples));
      });
      if (now - lastReadout < READOUT_INTERVAL_MS) {
        return;
      }
      lastReadout = now;
      peakReadouts.current.forEach((readout, id) => {
        const peak = Math.max(...SIDES.map((side) => states.get(sideKey(id, side))?.peak ?? 0));
        readout.textContent = formatLevel(peak);
        readout.classList.toggle("scope-peak-over", peak > settings.current.range);
      });
      states.forEach((state) => (state.peak = 0));
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const width = element.clientWidth;
      const height = element.clientHeight;
      const ratio = globalThis.devicePixelRatio || 1;
      if (element.width !== Math.round(width * ratio) || element.height !== Math.round(height * ratio)) {
        element.width = Math.round(width * ratio);
        element.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      readAll();
      const shown = visibleSamples();
      showPeaks(shown, now);

      const { traces: current, trigger: triggerId, range: currentRange } = settings.current;
      const differ = current.some(({ id }) => {
        const [left, right] = SIDES.map((side) => shown.get(sideKey(id, side)));
        return left !== undefined && right !== undefined && sidesDiffer(left, right);
      });
      if (differ) {
        lastStereo = now;
      }
      if (split !== now - lastStereo < STEREO_HOLD_MS) {
        split = !split;
        setStereo(split);
      }
      // The left side on top and the right one under it while split; the left alone, whole, while not.
      const laneHeight = split ? height / 2 : height;
      const lanes = split ? SIDES.map((side, index) => ({ side, top: index * laneHeight })) : [{ side: SIDES[0], top: 0 }];

      const style = getComputedStyle(element);
      context.lineWidth = 1;
      context.strokeStyle = style.getPropertyValue("--border");
      context.beginPath();
      for (const { top } of lanes) {
        context.moveTo(0, top + laneHeight / 2);
        context.lineTo(width, top + laneHeight / 2);
      }
      context.stroke();
      if (split) {
        context.strokeStyle = style.getPropertyValue("--muted");
        context.beginPath();
        context.moveTo(0, laneHeight);
        context.lineTo(width, laneHeight);
        context.stroke();
      }

      // The reference trace goes last, so it is drawn on top of the others.
      const order = [...current].sort((a, b) => Number(a.id === triggerId) - Number(b.id === triggerId));
      context.lineWidth = 1.5;
      context.lineJoin = "round";
      for (const { id, color } of order) {
        context.strokeStyle = style.getPropertyValue(color);
        for (const { side, top } of lanes) {
          const samples = shown.get(sideKey(id, side));
          if (!samples) {
            continue;
          }
          context.beginPath();
          tracePoints(samples, width, laneHeight, currentRange).forEach(({ x, y }, point) =>
            point === 0 ? context.moveTo(x, top + y) : context.lineTo(x, top + y),
          );
          context.stroke();
        }
      }
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [engine, nodeId]);

  const limit = formatLevel(range);
  return (
    <div className="scope">
      <div className="scope-screen">
        <canvas ref={canvas} className="scope-display" role="img" aria-label="Waveform" />
        {stereo ? (
          <>
            <span className="scope-label scope-label-top" title={`The left side, from −${limit} to +${limit}`}>
              L ±{limit}
            </span>
            <span className="scope-label scope-lane-right" title={`The right side, from −${limit} to +${limit}`}>
              R ±{limit}
            </span>
          </>
        ) : (
          <>
            <span className="scope-label scope-label-top">+{limit}</span>
            <span className="scope-label scope-label-bottom">−{limit}</span>
          </>
        )}
      </div>
      {traces.length === 0 ? (
        <p className="scope-empty">Connect signals to see them</p>
      ) : (
        <ul className="scope-legend" aria-label="Traces">
          {traces.map(({ id, label, color }) => (
            <li key={id}>
              <button
                type="button"
                className="scope-trace nodrag"
                aria-pressed={id === trigger}
                title={id === trigger ? "The trace stays still on this signal" : "Keep the trace still on this signal"}
                style={{ "--trace-color": `var(${color})` } as CSSProperties}
                onClick={() => onTrigger(id)}
              >
                <span className="scope-trace-swatch" />
                <span className="scope-trace-label">{label}</span>
                <output
                  ref={(readout) => {
                    if (readout) {
                      peakReadouts.current.set(id, readout);
                    } else {
                      peakReadouts.current.delete(id);
                    }
                  }}
                  className="scope-trace-peak"
                  aria-label={`${label} peak`}
                >
                  0.00
                </output>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
