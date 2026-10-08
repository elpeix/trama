import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { CrossfaderPlayer, type CrossfaderEngine } from "./CrossfaderPlayer";

let store: ReturnType<typeof createPatchStore>;
let engine: CrossfaderEngine & { running: boolean; listeners: Set<() => void> };
let player: CrossfaderPlayer;
let frequency: string;
let q: string;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
  const seq = store.getState().addNode("sequencer", { x: 0, y: 0 }).id;
  const filter = store.getState().addNode("filter", { x: 0, y: 0 }).id;
  frequency = `${filter}.frequency`;
  q = `${filter}.Q`;
  store.getState().togglePinned(frequency);
  store.getState().updateParam(filter, "frequency", 200);
  store.getState().saveScene({ [seq]: "A1" });
  store.getState().updateParam(filter, "frequency", 2000);
  store.getState().togglePinned(q);
  store.getState().saveScene({ [seq]: "B1" });
  store.getState().updateParam(filter, "frequency", 800);
  engine = {
    running: true,
    listeners: new Set(),
    holdControl: vi.fn(),
    setControl: vi.fn(),
    resetControl: vi.fn(),
    get state() {
      return engine.running ? ("running" as const) : ("suspended" as const);
    },
    subscribe: (listener) => {
      engine.listeners.add(listener);
      return () => engine.listeners.delete(listener);
    },
  };
  player = new CrossfaderPlayer(engine, store);
});

describe("CrossfaderPlayer", () => {
  it("plays nothing while no scene is on either side", () => {
    store.getState().setCrossfader({ position: 0 });

    expect(engine.setControl).not.toHaveBeenCalled();
    expect(player.valueOf(frequency)).toBeUndefined();
  });

  it("holds each knob of the scenes and plays it at the place of the crossfader, leaving the patch alone", () => {
    store.getState().setCrossfader({ a: 0, b: 1, position: 0 });

    expect(engine.holdControl).toHaveBeenCalledWith(frequency);
    expect(engine.setControl).toHaveBeenCalledWith(frequency, 200);
    expect(engine.setControl).toHaveBeenCalledWith(q, 1);
    expect(player.valueOf(frequency)).toBe(200);

    store.getState().setCrossfader({ position: 0.5 });

    expect(engine.setControl).toHaveBeenLastCalledWith(q, 1);
    expect(engine.setControl).toHaveBeenCalledWith(frequency, 632);
    expect(store.getState().nodes[1].params.frequency).toBe(800);
  });

  it("gives each knob back to the patch once no scene is on either side", () => {
    store.getState().setCrossfader({ a: 0, b: 1 });

    store.getState().setCrossfader({ a: undefined, b: undefined });

    expect(engine.resetControl).toHaveBeenCalledWith(frequency);
    expect(engine.resetControl).toHaveBeenCalledWith(q);
    expect(player.valueOf(frequency)).toBeUndefined();
  });

  it("plays its knobs again when the sound starts, as stopping lets them go", () => {
    store.getState().setCrossfader({ a: 0, b: 1, position: 1 });
    vi.mocked(engine.setControl).mockClear();

    engine.listeners.forEach((listener) => listener());

    expect(engine.setControl).toHaveBeenCalledWith(frequency, 2000);
  });

  it("leaves a knob to the hand that turns it, until the crossfader moves again", () => {
    const changed = vi.fn();
    player.subscribe(changed);
    store.getState().setCrossfader({ a: 0, b: 1, position: 0 });

    player.release(frequency);

    expect(engine.resetControl).toHaveBeenCalledWith(frequency);
    expect(player.valueOf(frequency)).toBeUndefined();
    expect(changed).toHaveBeenCalled();

    store.getState().setCrossfader({ position: 0.2 });
    expect(player.valueOf(frequency)).toBeDefined();
  });

  it("tells the knobs it moves", () => {
    store.getState().setCrossfader({ a: 0, b: 1 });

    expect(player.moves(frequency)).toBe(true);
    expect(player.moves(`${frequency}x`)).toBe(false);
  });
});
