import { describe, expect, it } from "vitest";
import type { PatchNode } from "../../patch/types";
import { sidesDiffer, SampleHistory, scopeTraces, traceLabel, triggerLookback, triggerStart, tracePoints } from "./scopeTrace";

const sine = (length: number, period: number, phase = 0) =>
  Float32Array.from({ length }, (_, index) => Math.sin((2 * Math.PI * (index + phase)) / period));

describe("triggerLookback", () => {
  const sampleRate = 48000;
  const capacity = 6 * sampleRate;

  it("looks back a whole window, so anything that fits on screen can be caught", () => {
    expect(triggerLookback(sampleRate, capacity, sampleRate)).toBe(sampleRate);
  });

  it("looks back a few tens of milliseconds even when the window is shorter", () => {
    expect(triggerLookback(240, capacity, sampleRate)).toBe(2400);
  });

  it("never asks for more than the history keeps beyond the window", () => {
    expect(triggerLookback(5 * sampleRate, capacity, sampleRate)).toBe(sampleRate);
  });

  it("gives up when the window fills the history", () => {
    expect(triggerLookback(capacity, capacity, sampleRate)).toBe(0);
  });
});

describe("triggerStart", () => {
  it("starts at the latest rising zero crossing that leaves room for the window", () => {
    const samples = sine(1000, 100, 30);

    const start = triggerStart(samples, 200, 500);

    expect(samples[start - 1]).toBeLessThan(0);
    expect(samples[start]).toBeGreaterThanOrEqual(0);
    expect(start).toBeLessThanOrEqual(800);
    expect(start).toBeGreaterThan(700);
  });

  it("keeps a periodic signal in place as it moves", () => {
    const period = 64;
    const first = sine(2048, period, 0);
    const later = sine(2048, period, 17);

    const a = triggerStart(first, 256, 1024);
    const b = triggerStart(later, 256, 1024);

    const shown = later.subarray(b, b + 256);
    first.subarray(a, a + 256).forEach((value, index) => expect(shown[index]).toBeCloseTo(value, 5));
  });

  it("ignores a small dip across zero in the middle of the period", () => {
    // A sine with a short dip to -0.1 at a third of each period: it crosses zero upwards at 310 too.
    const samples = Float32Array.from({ length: 5000 }, (_, index) => {
      const phase = index % 1000;
      return phase >= 300 && phase < 310 ? -0.1 : Math.sin((2 * Math.PI * phase) / 1000);
    });

    const phases = Array.from({ length: 100 }, (_, step) =>
      triggerStart(samples.subarray(0, 4000 + step * 10), 500, 2000) % 1000,
    );

    expect(new Set(phases)).toEqual(new Set([0]));
  });

  it("keeps a signal slower than a fixed lookback in place when the window is long", () => {
    const sampleRate = 1000;
    const length = 1000;
    const period = 800;
    const lookback = triggerLookback(length, 6000, sampleRate);
    const window = (phase: number) => {
      const samples = sine(length + lookback, period, phase);
      const start = triggerStart(samples, length, lookback);
      return samples.subarray(start, start + length);
    };

    const later = window(173);

    window(0).forEach((value, index) => expect(later[index]).toBeCloseTo(value, 5));
  });

  it("keeps a signal that never goes below zero in place", () => {
    const period = 64;
    const raised = (phase: number) => Float32Array.from(sine(2048, period, phase), (value) => value * 0.5 + 0.5);
    const first = raised(0);
    const later = raised(17);

    const a = triggerStart(first, 256, 1024);
    const b = triggerStart(later, 256, 1024);

    const shown = later.subarray(b, b + 256);
    first.subarray(a, a + 256).forEach((value, index) => expect(shown[index]).toBeCloseTo(value, 5));
  });

  it("triggers on the attack of an envelope, which only ever rises above zero", () => {
    // A note every 1000 samples: ten samples of attack up to 1, then a decay towards a sustain of 0.2.
    const samples = Float32Array.from({ length: 6000 }, (_, index) => {
      const phase = index % 1000;
      return phase < 10 ? phase / 10 : 0.2 + 0.8 * Math.exp(-(phase - 10) / 100);
    });

    const phases = Array.from({ length: 100 }, (_, step) =>
      triggerStart(samples.subarray(0, 5000 + step * 10), 500, 2000) % 1000,
    );

    // Halfway up the attack, every time.
    expect(new Set(phases)).toEqual(new Set([5]));
  });

  it("shows the newest samples when there is no crossing", () => {
    expect(triggerStart(new Float32Array(1000).fill(0.5), 200, 500)).toBe(800);
  });

  it("does not look back further than asked", () => {
    const samples = new Float32Array(1000).fill(0.5);
    samples[100] = -0.5;

    expect(triggerStart(samples, 200, 500)).toBe(800);
  });

  it("never starts before the buffer", () => {
    expect(triggerStart(new Float32Array(100), 200, 500)).toBe(0);
  });
});

describe("SampleHistory", () => {
  it("returns the newest samples, padded with silence", () => {
    const history = new SampleHistory(8);
    history.push(Float32Array.of(1, 2, 3));
    const target = new Float32Array(5);

    history.latest(target);

    expect(Array.from(target)).toEqual([0, 0, 1, 2, 3]);
  });

  it("wraps around, keeping only its capacity", () => {
    const history = new SampleHistory(4);
    history.push(Float32Array.of(1, 2, 3));
    history.push(Float32Array.of(4, 5, 6));
    const target = new Float32Array(4);

    history.latest(target);

    expect(Array.from(target)).toEqual([3, 4, 5, 6]);
  });

  it("keeps the tail of a push longer than its capacity", () => {
    const history = new SampleHistory(3);
    history.push(Float32Array.of(1, 2, 3, 4, 5));
    const target = new Float32Array(3);

    history.latest(target);

    expect(Array.from(target)).toEqual([3, 4, 5]);
  });
});

describe("tracePoints", () => {
  it("draws one point per sample when there are fewer samples than pixels", () => {
    const points = tracePoints(Float32Array.of(0, 1, -1), 100, 40, 1);

    expect(points).toEqual([
      { x: 0, y: 20 },
      { x: 50, y: 0 },
      { x: 100, y: 40 },
    ]);
  });

  it("keeps the minimum and maximum of each column", () => {
    const points = tracePoints(Float32Array.of(0, 1, -0.5, 0.5), 2, 40, 1);

    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 20 },
      { x: 1, y: 10 },
      { x: 1, y: 30 },
    ]);
  });

  it("scales by the range and clamps what does not fit", () => {
    const points = tracePoints(Float32Array.of(0.1, 5), 10, 40, 0.2);

    expect(points[0].y).toBeCloseTo(10);
    expect(points[1].y).toBe(0);
  });

  it("draws nothing without enough samples", () => {
    expect(tracePoints(new Float32Array(1), 10, 40, 1)).toEqual([]);
  });
});

describe("scopeTraces", () => {
  const at = { x: 0, y: 0 };
  const nodes: PatchNode[] = [
    { id: "gain-4", type: "gain", position: at, params: {} },
    { id: "gain-7", type: "gain", name: "Wind", position: at, params: {} },
    { id: "keyboard-2", type: "keyboard", position: at, params: {} },
    { id: "scope-9", type: "scope", position: at, params: {} },
  ];
  const into = (source: string, port: string, target = "scope-9") => ({
    id: `${source}:${port}->${target}`,
    source: { nodeId: source, port },
    target: { nodeId: target, port: port === "audio" ? "audio" : "control" },
  });

  it("names one trace per connection into the scope, in patch order", () => {
    const traces = scopeTraces("scope-9", nodes, [
      into("gain-7", "audio"),
      into("gain-4", "audio", "output-1"),
      into("gain-4", "audio"),
      into("keyboard-2", "pitch"),
    ]);

    expect(traces).toEqual([
      { id: "gain-7:audio->scope-9", label: "Wind", color: "--trace-audio-1" },
      { id: "gain-4:audio->scope-9", label: "Gain 4", color: "--trace-audio-2" },
      { id: "keyboard-2:pitch->scope-9", label: "Keyboard 2 · pitch", color: "--trace-control-1" },
    ]);
  });

  it("colours each trace after the port it arrives at, counting shades apart per signal", () => {
    const traces = scopeTraces("scope-9", nodes, [
      into("keyboard-2", "pitch"),
      into("gain-4", "audio"),
      into("gain-7", "audio"),
    ]);

    expect(traces.map(({ color }) => color)).toEqual([
      "--trace-control-1",
      "--trace-audio-1",
      "--trace-audio-2",
    ]);
  });
});

describe("traceLabel", () => {
  it("names a trace from an Out of a subpatch with more than one after the name of that Out, or its place while unnamed", () => {
    const outlet = (id: string, y: number, name?: string): PatchNode => ({
      id,
      type: "outlet",
      position: { x: 0, y },
      params: { signal: "audio" },
      ...(name !== undefined && { name }),
    });
    const hats: PatchNode = {
      id: "subpatch-60",
      type: "subpatch",
      name: "Hats",
      position: { x: 0, y: 0 },
      params: { voices: 1 },
      patch: { nodes: [outlet("outlet-64", 0, "closed"), outlet("outlet-65", 100, "open"), outlet("outlet-66", 200)], connections: [] },
    };

    expect(["outlet-64", "outlet-65", "outlet-66"].map((port) => traceLabel(hats, port))).toEqual([
      "Hats · closed",
      "Hats · open",
      "Hats · out 3",
    ]);
  });
});

describe("sidesDiffer", () => {
  it("tells a stereo signal from one that is the same on both sides", () => {
    expect(sidesDiffer(Float32Array.from([0.5, -0.5]), Float32Array.from([0.5, -0.5]))).toBe(false);
    expect(sidesDiffer(Float32Array.from([0.5, -0.5]), Float32Array.from([0.5, 0]))).toBe(true);
  });

  it("takes differences too small to see as the same", () => {
    expect(sidesDiffer(Float32Array.from([0.5]), Float32Array.from([0.5001]))).toBe(false);
  });

  const sine = (length: number, shift = 0, scale = 1) =>
    Float32Array.from({ length }, (_, index) => scale * Math.sin(((index + shift) * 2 * Math.PI) / 109));

  it("takes as the same the two sides read a block of the audio apart, or a few blocks", () => {
    expect(sidesDiffer(sine(2048), sine(2048, 128))).toBe(false);
    expect(sidesDiffer(sine(2048, 256), sine(2048))).toBe(false);
    expect(sidesDiffer(sine(2048), sine(2048, 384))).toBe(false);
  });

  it("still tells a side panned or delayed by less than a block", () => {
    expect(sidesDiffer(sine(2048), sine(2048, 0, 0.5))).toBe(true);
    expect(sidesDiffer(sine(2048), sine(2048, 37))).toBe(true);
  });
});

