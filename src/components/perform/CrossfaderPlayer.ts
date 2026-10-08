import type { AudioEngine } from "../../audio/AudioEngine";
import type { ControlKey } from "../../patch/automation";
import type { PatchStore } from "../../store/patchStore";
import { crossfadeValues } from "./crossfade";

export type CrossfaderEngine = Pick<AudioEngine, "holdControl" | "setControl" | "resetControl" | "state" | "subscribe">;

/**
 * Plays the crossfader on the engine without touching the patch: while a scene is on either side,
 * it holds each knob the scenes keep and sets it to its value at the place of the crossfader, and
 * gives it back to the patch once neither side has a scene. Stopping the sound lets the controls
 * go, so it plays them again when it starts. A knob turned by hand is left to the hand until the
 * crossfader moves again.
 */
export class CrossfaderPlayer {
  private readonly engine: CrossfaderEngine;
  private readonly store: PatchStore;
  private readonly listeners = new Set<() => void>();
  private values: Record<ControlKey, number> = {};

  constructor(engine: CrossfaderEngine, store: PatchStore) {
    this.engine = engine;
    this.store = store;
    store.subscribe((state, previous) => {
      if (state.crossfader !== previous.crossfader || state.scenes !== previous.scenes) {
        this.play();
      }
    });
    engine.subscribe(() => {
      if (engine.state === "running") {
        this.playAgain();
      }
    });
    this.play();
  }

  /** The value it plays a knob at, or undefined while it leaves it to the patch. */
  valueOf(key: ControlKey): number | undefined {
    return this.values[key];
  }

  /** Whether the knob is one it moves. */
  moves(key: ControlKey): boolean {
    return key in this.values;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Leaves a knob to the hand that turns it, until the crossfader moves again. */
  release(key: ControlKey) {
    if (!this.moves(key)) {
      return;
    }
    const { [key]: _released, ...kept } = this.values;
    this.values = kept;
    this.engine.resetControl(key);
    this.notify();
  }

  private play() {
    const { crossfader, scenes } = this.store.getState();
    const active = crossfader.a !== undefined || crossfader.b !== undefined;
    const next = active
      ? crossfadeValues(this.store.getState().toPatch(), scenes[crossfader.a ?? -1], scenes[crossfader.b ?? -1], crossfader.position)
      : {};
    for (const key of Object.keys(this.values).filter((key) => !(key in next))) {
      this.engine.resetControl(key);
    }
    this.values = next;
    this.playAgain();
    this.notify();
  }

  private playAgain() {
    for (const [key, value] of Object.entries(this.values)) {
      this.engine.holdControl(key);
      this.engine.setControl(key, value);
    }
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }
}
