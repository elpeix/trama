import { useContext, useEffect, useState } from "react";
import { HARMONIC_COUNT } from "../../patch/harmonics";
import { parseCurve } from "../../patch/sequence";
import { EngineContext } from "../EngineContext";
import { harmonicWave } from "./harmonicWave";

interface WavePreviewProps {
  nodeId: string;
  harmonics: string;
  brightness: number;
  even: number;
}

const POINTS = 96;
const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * One cycle of the wave the harmonics make, on a small screen. While the sound runs it adds what
 * the control cables bring to the brightness and the even param, so the wave moves with them.
 */
export function WavePreview({ nodeId, harmonics, brightness, even }: WavePreviewProps) {
  const engine = useContext(EngineContext);
  const [modulation, setModulation] = useState({ brightness: 0, even: 0 });

  useEffect(() => {
    if (!engine) {
      return;
    }
    let frame = 0;
    const update = () => {
      frame = requestAnimationFrame(update);
      const next = {
        brightness: engine.getModulation(nodeId, "brightness") ?? 0,
        even: engine.getModulation(nodeId, "even") ?? 0,
      };
      setModulation((previous) =>
        Math.abs(previous.brightness - next.brightness) < 0.005 && Math.abs(previous.even - next.even) < 0.005
          ? previous
          : next,
      );
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [engine, nodeId]);

  const levels = parseCurve(harmonics) ?? Array(HARMONIC_COUNT).fill(0);
  const wave = harmonicWave(
    levels,
    { brightness: clamp(brightness + modulation.brightness), even: clamp(even + modulation.even) },
    POINTS,
  );

  return (
    <svg className="wave-preview" role="img" aria-label="Wave" viewBox={`0 0 ${POINTS - 1} 2.2`} preserveAspectRatio="none">
      <line className="wave-preview-zero" x1={0} x2={POINTS - 1} y1={1.1} y2={1.1} />
      <polyline
        className="wave-preview-line"
        points={wave.map((value, index) => `${index},${(1.1 - value).toFixed(3)}`).join(" ")}
      />
    </svg>
  );
}
