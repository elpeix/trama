import { useContext, useEffect, useRef } from "react";
import { EngineContext } from "../EngineContext";
import { fallingLevel, formatDecibels, METER_FLOOR_DB, meterPosition, StereoPeaks, toDecibels } from "./level";

const CLIP_HOLD_MS = 1500;
const READOUT_INTERVAL_MS = 150;

interface MeterDisplayProps {
  nodeId: string;
  label?: string;
}

export function MeterDisplay({ nodeId, label = "Output level" }: MeterDisplayProps) {
  const engine = useContext(EngineContext);
  const track = useRef<HTMLDivElement>(null);
  const covers = useRef<(HTMLDivElement | null)[]>([]);
  const readout = useRef<HTMLOutputElement>(null);
  const clip = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!engine || !track.current || !readout.current || !clip.current) {
      return;
    }
    const [trackElement, readoutElement, clipElement] = [track.current, readout.current, clip.current];

    let frame = 0;
    const peaks = new StereoPeaks();
    const levels = [0, 0];
    let lastFrame = performance.now();
    let lastReadout = -Infinity;
    let lastClip = -Infinity;

    const update = (now: number) => {
      frame = requestAnimationFrame(update);
      const sides = peaks.read(engine.getAnalyser(nodeId));
      sides.forEach((peak, side) => {
        levels[side] = fallingLevel(levels[side], peak, (now - lastFrame) / 1000);
        const cover = covers.current[side];
        if (cover) {
          cover.style.transform = `scaleX(${1 - meterPosition(levels[side])})`;
        }
      });
      lastFrame = now;
      if (Math.max(...sides) > 1) {
        lastClip = now;
      }
      const level = Math.max(...levels);

      const clipping = now - lastClip < CLIP_HOLD_MS;
      clipElement.classList.toggle("meter-clip-on", clipping);
      clipElement.dataset.on = String(clipping);
      if (now - lastReadout >= READOUT_INTERVAL_MS) {
        readoutElement.textContent = formatDecibels(level);
        trackElement.setAttribute("aria-valuenow", String(Math.max(METER_FLOOR_DB, Math.min(0, toDecibels(level)))));
        trackElement.setAttribute("aria-valuetext", formatDecibels(level));
        lastReadout = now;
      }
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine, nodeId]);

  return (
    <div className="meter">
      <div
        ref={track}
        className="meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={METER_FLOOR_DB}
        aria-valuemax={0}
        aria-valuenow={METER_FLOOR_DB}
      >
        {(["left", "right"] as const).map((side, index) => (
          <div
            key={side}
            ref={(cover) => {
              covers.current[index] = cover;
            }}
            className="meter-cover"
            data-side={side}
          />
        ))}
      </div>
      <output ref={readout} className="meter-readout" aria-label="Peak level">
        −∞ dB
      </output>
      <span ref={clip} className="meter-clip" data-on="false" title="The output went above 0 dBFS and distorts">
        CLIP
      </span>
    </div>
  );
}
