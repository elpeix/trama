import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { SongRecorder, type RecorderEngine } from "./SongRecorder";

let store: ReturnType<typeof createPatchStore>;
let engine: RecorderEngine & { position: number | undefined; running: boolean; listeners: Set<() => void> };
let recorder: SongRecorder;
let key: string;

const lane = () => store.getState().song?.automation?.[key];

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  const osc = store.getState().addNode("oscillator", { x: 0, y: 0 }).id;
  key = `${osc}.detune`;
  engine = {
    position: 4,
    running: true,
    listeners: new Set(),
    getSongPosition: () => engine.position,
    holdControl: vi.fn(),
    setControl: vi.fn(),
    releaseControl: vi.fn(),
    get state() {
      return engine.running ? ("running" as const) : ("suspended" as const);
    },
    subscribe: (listener) => {
      engine.listeners.add(listener);
      return () => engine.listeners.delete(listener);
    },
  };
  recorder = new SongRecorder(engine, store);
  store.getState().setSongMode(true);
  store.getState().setSongRec(true);
});

describe("SongRecorder while the song plays", () => {
  it("punches a control in when grabbed, plays it as it moves, and writes the take when let go", () => {
    expect(recorder.grab(key, 10, 0.5)).toBe(true);
    expect(engine.holdControl).toHaveBeenCalledWith(key);

    engine.position = 4.5;
    expect(recorder.change(key, 20, 0.6)).toBe(true);
    expect(engine.setControl).toHaveBeenLastCalledWith(key, 20);
    expect(lane()).toBeUndefined();

    engine.position = 5;
    recorder.release(key);

    expect(lane()).toBe("4:10 4.5:20");
    expect(engine.releaseControl).toHaveBeenCalledWith(key);
    expect(store.getState().past).toHaveLength(2);
  });

  it("keeps only the points that change the value enough", () => {
    recorder.grab(key, 10, 0.5);
    engine.position = 4.1;
    recorder.change(key, 10.1, 0.501);
    engine.position = 4.2;
    recorder.change(key, 12, 0.52);
    recorder.release(key);

    expect(lane()).toBe("4:10 4.2:12");
  });

  it("writes what it had and starts a new take when the loop goes round", () => {
    store.getState().setSongLoop({ start: 1, length: 1 });
    recorder.grab(key, 10, 0.5);
    engine.position = 7.5;
    recorder.change(key, 20, 0.6);

    engine.position = 4.25;
    recorder.change(key, 30, 0.7);
    expect(lane()).toBe("4:10 7.5:20");

    engine.position = 5;
    recorder.release(key);
    expect(lane()).toBe("4:10 4.25:30 5:10 7.5:20");
  });

  it("ends the loop on the last beat of its bars of the meter", () => {
    store.getState().setMeter([3]);
    store.getState().setSongLoop({ start: 1, length: 1 });
    store.getState().setControlPoint(key, 7, 99);
    engine.position = 3;
    recorder.grab(key, 10, 0.5);
    engine.position = 5.5;
    recorder.change(key, 20, 0.6);

    engine.position = 3.25;
    recorder.change(key, 30, 0.7);

    expect(lane()).toBe("3:10 5.5:20 7:99");
  });

  it("leaves a control that was not grabbed to the patch", () => {
    expect(recorder.change(key, 20, 0.6)).toBe(false);
  });

  it("does not record without Rec or out of song mode", () => {
    store.getState().setSongRec(false);
    expect(recorder.grab(key, 10, 0.5)).toBe(false);

    store.getState().setSongRec(true);
    store.getState().setSongMode(false);
    expect(recorder.grab(key, 10, 0.5)).toBe(false);
  });

  it("punches out every control when the sound stops, or Rec goes off", () => {
    recorder.grab(key, 10, 0.5);
    engine.position = 6;
    recorder.change(key, 20, 0.6);

    engine.running = false;
    engine.position = undefined;
    engine.listeners.forEach((listener) => listener());

    expect(lane()).toBe("4:10 6:20");
    expect(engine.releaseControl).toHaveBeenCalledWith(key);
  });

  it("sets a switch on the beat it is flipped", () => {
    engine.position = 6;

    expect(recorder.flip(key, 1)).toBe(true);

    expect(lane()).toBe("6:1");
    expect(engine.setControl).toHaveBeenCalledWith(key, 1);
  });

  it("keeps the last value of the controls touched, forgotten when the sound starts again", () => {
    recorder.grab(key, 10, 0.5);
    recorder.change(key, 20, 0.6);
    expect(store.getState().songTouched).toEqual({ [key]: 20 });

    recorder.release(key);
    engine.listeners.forEach((listener) => listener());
    expect(store.getState().songTouched).toEqual({});
  });
});

describe("SongRecorder while the song is stopped", () => {
  beforeEach(() => {
    engine.running = false;
    engine.position = undefined;
  });

  it("sets the value on the first beat of the bar of the cursor", () => {
    store.getState().setSongCursor(2);

    expect(recorder.grab(key, 10, 0.5)).toBe(false);
    expect(recorder.change(key, 15, 0.55)).toBe(true);

    expect(lane()).toBe("8:15");
  });

  it("finds the first beat of the bar of the cursor in bars of the meter", () => {
    store.getState().setMeter([3]);
    store.getState().setSongCursor(2);

    recorder.change(key, 15, 0.55);

    expect(lane()).toBe("6:15");
  });

  it("sets a switch there too", () => {
    expect(recorder.flip(key, 0)).toBe(true);

    expect(lane()).toBe("0:0");
  });
});
