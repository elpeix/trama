import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudioContext } from "../../test/fakeAudioContext";
import { Transport } from "../Transport";
import { beatsPerStep, StepClock } from "./StepClock";

let context: FakeAudioContext;
let transport: Transport;
let steps: [number, number, number][];
let division: string;
let clock: StepClock;

const advance = (seconds: number) => {
  const end = Math.round((context.currentTime + seconds) * 1000);
  for (let ms = Math.round(context.currentTime * 1000) + 5; ms <= end; ms += 5) {
    context.currentTime = ms / 1000;
    vi.advanceTimersByTime(5);
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  context = new FakeAudioContext();
  transport = new Transport(context.asAudioContext());
  steps = [];
  division = "1/8";
  clock = new StepClock(context.asAudioContext(), transport, () => beatsPerStep(division), (...step) =>
    steps.push(step),
  );
});

afterEach(() => {
  clock.stop();
  vi.useRealTimers();
});

describe("beatsPerStep", () => {
  it("turns a division into beats", () => {
    expect(beatsPerStep("1/4")).toBe(1);
    expect(beatsPerStep("1/16")).toBe(0.25);
  });
});

describe("StepClock", () => {
  it("plays the steps of the grid with their number, at the tempo of the transport", () => {
    clock.start(0);
    advance(0.6);

    // 120 BPM in eighths: 0.25 s per step.
    expect(steps).toEqual([
      [0, 0.25, 0],
      [0.25, 0.25, 1],
      [0.5, 0.25, 2],
    ]);
    expect(clock.running).toBe(true);
  });

  it("plays no step while the transport is paused, and starts from the restart that lets it go on", () => {
    transport.pause();
    clock.start(0);
    advance(0.6);
    expect(steps).toEqual([]);

    transport.restart(context.currentTime);
    advance(0.3);

    expect(steps).toEqual([
      [0.6, 0.25, 0],
      [0.85, 0.25, 1],
    ]);
  });

  it("waits for the next step of the grid when started between two", () => {
    advance(0.3);

    clock.start(context.currentTime);
    advance(0.2);

    expect(steps[0]).toEqual([0.5, 0.25, 2]);
  });

  it("keeps two clocks started at different moments in step", () => {
    const other: number[] = [];
    const late = new StepClock(context.asAudioContext(), transport, () => 0.5, (time) => other.push(time));
    clock.start(0);
    advance(0.6);

    late.start(context.currentTime);
    advance(0.5);
    late.stop();

    expect(other.every((time) => steps.some(([step]) => step === time))).toBe(true);
    expect(other.length).toBeGreaterThan(0);
  });

  it("follows tempo changes from now on", () => {
    clock.start(0);
    advance(0.05);

    transport.setTempo(60);
    advance(1.2);

    // The beats keep their place: at 0.05 s the transport was at beat 0.1, and eighths now last 0.5 s.
    expect(steps.map(([time]) => time)).toEqual([0, expect.closeTo(0.45), expect.closeTo(0.95)]);
  });

  it("moves to the grid of a new division", () => {
    clock.start(0);
    advance(0.3);

    division = "1/4";
    advance(1.2);

    // After the eighth at 0.25 comes the quarter at 0.5, then 1.0.
    expect(steps.map(([time, , step]) => [time, step])).toEqual([
      [0, 0],
      [0.25, 1],
      [0.5, 1],
      [1, 2],
      [1.5, 3],
    ]);
  });

  it("starts again from the first step when the transport restarts", () => {
    clock.start(0);
    advance(1);

    transport.restart(context.currentTime);
    vi.advanceTimersByTime(25);

    expect(steps.at(-1)).toEqual([1, 0.25, 0]);
  });

  it("starts again from the moment of the restart, not from the tick that sees it", () => {
    clock.start(0);
    advance(1);

    transport.restart(context.currentTime);
    // Firefox moves the audio clock on between the restart and the next wake-up of the scheduler.
    context.currentTime += 0.02;
    vi.advanceTimersByTime(25);

    expect(steps.at(-1)).toEqual([1, 0.25, 0]);
  });

  it("starts right where it is asked to, keeping that beat, instead of waiting for the grid", () => {
    advance(0.3);

    clock.start(context.currentTime, "now");
    advance(0.5);

    expect(steps.map(([time, , step]) => [time, step])).toEqual([
      [expect.closeTo(0.3), 0],
      [expect.closeTo(0.55), 1],
      [expect.closeTo(0.8), 2],
    ]);
  });

  it("goes back to the shared grid when the transport restarts under it", () => {
    clock.start(0.3, "now");
    advance(0.5);

    transport.restart(1);
    context.currentTime = 1;
    vi.advanceTimersByTime(25);

    expect(steps.at(-1)).toEqual([1, 0.25, 0]);
  });

  it("joins the grid from now after a long pause instead of catching up", () => {
    clock.start(0);
    advance(0.3);

    context.currentTime = 30;
    vi.advanceTimersByTime(25);

    expect(steps.filter(([time]) => time > 0.5 && time < 30)).toEqual([]);
    expect(steps.at(-1)).toEqual([30, 0.25, 120]);
  });

  it("holds back the steps on the sixteenths between the eighths with swing, and shortens them to match", () => {
    transport.setSwing(75);
    division = "1/16";
    clock.start(0);
    advance(0.39);

    // 120 BPM in sixteenths: 0.125 s per step, and the ones between the eighths come 0.0625 s later.
    expect(steps).toEqual([
      [0, 0.1875, 0],
      [0.1875, 0.0625, 1],
      [0.25, 0.1875, 2],
      [0.4375, 0.0625, 3],
    ]);
  });

  it("holds back the steps on the eighths between the beats when the swing is on the eighths", () => {
    transport.setSwing(75);
    transport.setSwingGrid("1/8");
    clock.start(0);
    advance(0.9);

    // 120 BPM in eighths: 0.25 s per step, and the ones between the beats come 0.125 s later.
    expect(steps).toEqual([
      [0, 0.375, 0],
      [0.375, 0.125, 1],
      [0.5, 0.375, 2],
      [0.875, 0.125, 3],
    ]);
  });

  it("keeps its steps straight with swing when it does not follow it", () => {
    const straight = new StepClock(context.asAudioContext(), transport, () => 1 / 4, (...step) => steps.push(step), { swing: false });
    transport.setSwing(75);
    straight.start(0);
    advance(0.39);
    straight.stop();

    expect(steps).toEqual([
      [0, 0.125, 0],
      [0.125, 0.125, 1],
      [0.25, 0.125, 2],
      [0.375, 0.125, 3],
    ]);
  });

  it("keeps the eighths straight with swing", () => {
    transport.setSwing(75);
    clock.start(0);
    advance(0.6);

    expect(steps.map(([time]) => time)).toEqual([0, 0.25, 0.5]);
  });

  it("stops", () => {
    clock.start(0);
    clock.stop();
    advance(1);

    expect(steps).toHaveLength(1);
    expect(clock.running).toBe(false);
  });
});
