import { useContext, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import type { SamplerState, SampleState } from "../../audio/modules/AudioModule";
import { formatSampleList, MAX_SAMPLES, parseSampleList } from "../../patch/samples";
import { RemoveIcon } from "../RemoveIcon";
import { EngineContext } from "../EngineContext";
import { SamplesContext } from "../SamplesContext";
import { samplePeaks } from "./samplePeaks";

const POLL_MS = 250;
const COLUMNS = 120;

interface SampleDisplayProps {
  nodeId: string;
  /** The samples of the sampler, their ids separated by spaces. */
  value: string;
  start: number;
  end: number;
  onChange(samples: string): void;
}

const EMPTY: SampleState = { status: "empty" };
const NONE: SamplerState = { samples: [], playing: 0 };

function message(state: SampleState, failed: string | undefined): string {
  if (failed) {
    return failed;
  }
  switch (state.status) {
    case "empty":
      return "No sample: load or drop an audio file";
    case "loading":
      return state.name ? `Loading ${state.name}…` : "Loading…";
    case "missing":
      return "The file of this sample is not in this browser: load it again";
    case "invalid":
      return `${state.name ?? "The file"} is not audio the browser can play`;
    case "ready":
      return `${state.name ?? "Sample"} · ${state.buffer?.duration.toFixed(2) ?? "?"} s`;
  }
}

/**
 * The files a sampler plays: the name and the shape of one, with the part from Start to End lit,
 * and a button to add another one, which can also be dropped on it, several at once. With several,
 * a slot for each, lit on the one that plays: a click shows it, and its cross takes it out.
 */
export function SampleDisplay({ nodeId, value, start, end, onChange }: SampleDisplayProps) {
  const engine = useContext(EngineContext);
  const samples = useContext(SamplesContext);
  const input = useRef<HTMLInputElement>(null);
  const [sampler, setSampler] = useState<SamplerState>(() => engine?.getSample(nodeId) ?? NONE);
  const [picked, setPicked] = useState<number>();
  const [failed, setFailed] = useState<string>();
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    if (!engine) {
      return;
    }
    const read = () =>
      setSampler((previous) => {
        const next = engine.getSample(nodeId) ?? NONE;
        const same =
          next.playing === previous.playing &&
          next.samples.length === previous.samples.length &&
          next.samples.every(
            (sample, index) =>
              sample.status === previous.samples[index].status &&
              sample.name === previous.samples[index].name &&
              sample.buffer === previous.samples[index].buffer,
          );
        return same ? previous : next;
      });
    read();
    const timer = setInterval(read, POLL_MS);
    return () => clearInterval(timer);
  }, [engine, nodeId]);

  const ids = parseSampleList(value) ?? [];
  const shown = picked !== undefined && picked < sampler.samples.length ? picked : sampler.playing;
  const state = sampler.samples[shown] ?? EMPTY;
  const full = ids.length >= MAX_SAMPLES;
  const peaks = useMemo(() => (state.buffer ? samplePeaks(state.buffer, COLUMNS) : undefined), [state.buffer]);

  const load = async (files: File[]) => {
    if (files.length === 0 || !samples) {
      return;
    }
    const added: string[] = [];
    for (const file of files.slice(0, MAX_SAMPLES - ids.length)) {
      try {
        added.push(await samples.add(file.name, file.type, await file.arrayBuffer()));
        setFailed(undefined);
      } catch {
        setFailed(`Could not read ${file.name}`);
      }
    }
    if (added.length > 0) {
      onChange(formatSampleList([...ids, ...added]));
    }
  };

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    void load(files);
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDropping(false);
    void load([...event.dataTransfer.files]);
  };

  const remove = (index: number) => {
    onChange(formatSampleList(ids.filter((_, at) => at !== index)));
    setPicked(undefined);
  };

  const from = Math.min(start, end) * COLUMNS;
  const to = Math.max(start, end) * COLUMNS;

  return (
    <div
      className="sample-display"
      data-dropping={dropping || undefined}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={drop}
    >
      <svg
        className="sample-wave"
        role="img"
        aria-label="Sample"
        viewBox={`0 0 ${COLUMNS} 2`}
        preserveAspectRatio="none"
      >
        {peaks && (
          <>
            <rect className="sample-region" x={from} width={to - from} y={0} height={2} />
            <path
              className="sample-peaks"
              d={peaks
                .map(({ min, max }, column) => `M${column + 0.5},${(1 - max).toFixed(3)}V${(1 - min + 0.02).toFixed(3)}`)
                .join("")}
            />
          </>
        )}
        {!peaks && <line className="wave-preview-zero" x1={0} x2={COLUMNS} y1={1} y2={1} />}
      </svg>
      <div className="sample-bar">
        <p className="sample-status" role="status" aria-label="Sample file" data-status={failed ? "invalid" : state.status}>
          {message(state, failed)}
        </p>
        <button
          type="button"
          className="hw subpatch-open-button nodrag"
          onClick={() => input.current?.click()}
          disabled={full}
          title={full ? `It holds ${MAX_SAMPLES} samples at the most` : "Add an audio file to its samples"}
        >
          Load
        </button>
      </div>
      {sampler.samples.length > 1 && (
        <div className="sample-slots" role="group" aria-label="Samples">
          {sampler.samples.map((sample, index) => (
            <span key={index} className="sample-slot">
              <button
                type="button"
                className="pattern-slot nodrag"
                aria-label={`Sample ${index + 1}`}
                aria-pressed={index === shown}
                title={sample.name ?? `Sample ${index + 1}`}
                data-playing={index === sampler.playing || undefined}
                onClick={() => setPicked(index)}
              >
                <span className="pattern-led" aria-hidden="true" />
                {index + 1}
              </button>
              <button
                type="button"
                className="remove-badge perform-remove sample-slot-remove nodrag"
                aria-label={`Remove sample ${index + 1}`}
                title="Take this sample out"
                onClick={() => remove(index)}
              >
                <RemoveIcon />
              </button>
            </span>
          ))}
        </div>
      )}
      <input ref={input} type="file" accept="audio/*" multiple aria-label="Load sample file" hidden onChange={choose} />
    </div>
  );
}
