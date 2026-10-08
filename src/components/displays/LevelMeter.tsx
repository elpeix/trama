import { useEffect, useRef } from "react";
import type { StereoAnalyser } from "../../audio/modules/stereoAnalyser";
import { fallingLevel, meterPosition, StereoPeaks } from "./level";

interface LevelMeterProps {
  label: string;
  /** The analysers to read on every frame; undefined while there are none. */
  read: () => StereoAnalyser | undefined;
  /** Upright side by side, like the meters of a desk, or lying one over the other. */
  orientation?: "vertical" | "horizontal";
}

const SIDES = ["left", "right"] as const;

/** A meter of the peak of each side of a signal, falling back slowly. */
export function LevelMeter({ label, read, orientation = "vertical" }: LevelMeterProps) {
  const covers = useRef<(HTMLDivElement | null)[]>([]);
  const latest = useRef(read);
  const scale = orientation === "vertical" ? "scaleY" : "scaleX";

  useEffect(() => {
    latest.current = read;
  }, [read]);

  useEffect(() => {
    let frame = 0;
    let lastFrame = performance.now();
    const levels = [0, 0];
    const peaks = new StereoPeaks();
    const update = (now: number) => {
      frame = requestAnimationFrame(update);
      const elapsed = (now - lastFrame) / 1000;
      lastFrame = now;
      peaks.read(latest.current()).forEach((peak, side) => {
        levels[side] = fallingLevel(levels[side], peak, elapsed);
        const cover = covers.current[side];
        if (cover) {
          cover.style.transform = `${scale}(${1 - meterPosition(levels[side])})`;
        }
      });
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [scale]);

  return (
    <div className="level-meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={1} data-orientation={orientation}>
      {SIDES.map((side, index) => (
        <div key={side} className="level-meter-bar" data-side={side}>
          <div
            ref={(cover) => {
              covers.current[index] = cover;
            }}
            className="level-meter-cover"
            style={{ transform: `${scale}(1)` }}
          />
        </div>
      ))}
    </div>
  );
}
