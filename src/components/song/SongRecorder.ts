import type { AudioEngine } from "../../audio/AudioEngine";
import type { AutomationPoint, ControlKey } from "../../patch/automation";
import { beatsPerBar } from "../../patch/meter";
import { emptySong } from "../../patch/song";
import type { PatchStore } from "../../store/patchStore";

export type RecorderEngine = Pick<
  AudioEngine,
  "getSongPosition" | "holdControl" | "setControl" | "releaseControl" | "state" | "subscribe"
>;

/** How far along its range a control has to move for a new point, so a slow drag does not fill the lane. */
const MIN_MOVE = 0.005;
/** How far back the song has to go for a loop that went round, and not a rounding of the position. */
const WRAP_BEATS = 0.5;

interface Take {
  start: number;
  points: AutomationPoint[];
  /** Where along its range the control was at the last point. */
  position: number;
  /** The last beat the take heard of. */
  last: number;
}

/**
 * Writes the controls into the song with Rec on in song mode. While it plays, a control grabbed
 * punches in: the engine plays it as the hand moves it, and when let go, or when the sound stops
 * or Rec goes off, the take replaces what the lane had there. When the loop goes round, the take
 * written so far goes in and a new one starts. While it is stopped, a change sets the control on
 * the first beat of the bar of the cursor.
 */
export class SongRecorder {
  private readonly engine: RecorderEngine;
  private readonly store: PatchStore;
  private readonly takes = new Map<ControlKey, Take>();

  constructor(engine: RecorderEngine, store: PatchStore) {
    this.engine = engine;
    this.store = store;
    store.subscribe((state, previous) => {
      if (state.songRec && !previous.songRec) {
        state.clearTouched();
      }
      if (!state.songRec || !state.songMode) {
        this.releaseAll();
      }
    });
    engine.subscribe(() => {
      if (engine.state === "running") {
        store.getState().clearTouched();
      } else {
        this.releaseAll();
      }
    });
  }

  private get recording() {
    const { songRec, songMode } = this.store.getState();
    return songRec && songMode;
  }

  /** Punches a control in while the song plays; true when it does. */
  grab(key: ControlKey, value: number, position: number): boolean {
    const beat = this.engine.getSongPosition();
    if (!this.recording || beat === undefined) {
      return false;
    }
    this.takes.set(key, { start: beat, points: [{ beat, value }], position, last: beat });
    this.engine.holdControl(key);
    this.engine.setControl(key, value);
    this.store.getState().touchControl(key, value);
    return true;
  }

  /** Records a change of a control; true when it went into the song instead of the patch. */
  change(key: ControlKey, value: number, position: number): boolean {
    if (!this.recording) {
      return false;
    }
    const beat = this.engine.getSongPosition();
    const take = this.takes.get(key);
    if (beat === undefined) {
      this.setOnCursor(key, value);
      return true;
    }
    if (!take) {
      return false;
    }
    if (beat < take.last - WRAP_BEATS) {
      this.write(key, take, this.loopEnd());
      this.takes.set(key, { start: beat, points: [{ beat, value }], position, last: beat });
    } else if (Math.abs(position - take.position) >= MIN_MOVE) {
      take.points.push({ beat, value });
      take.position = position;
      take.last = beat;
    } else {
      take.last = beat;
    }
    this.engine.setControl(key, value);
    this.store.getState().touchControl(key, value);
    return true;
  }

  /** Punches a control out, writing its take into the song. */
  release(key: ControlKey) {
    const take = this.takes.get(key);
    if (!take) {
      return;
    }
    this.takes.delete(key);
    const beat = this.engine.getSongPosition();
    const end = beat === undefined ? take.last : beat < take.last - WRAP_BEATS ? this.loopEnd() : beat;
    this.write(key, take, end);
    this.engine.releaseControl(key);
  }

  /** Sets a switch, such as a mute: on the beat it is flipped while the song plays, or on the cursor. */
  flip(key: ControlKey, value: number): boolean {
    if (!this.recording) {
      return false;
    }
    const beat = this.engine.getSongPosition();
    if (beat === undefined) {
      this.setOnCursor(key, value);
      return true;
    }
    this.store.getState().setControlPoint(key, beat, value);
    this.engine.setControl(key, value);
    this.store.getState().touchControl(key, value);
    return true;
  }

  private setOnCursor(key: ControlKey, value: number) {
    const { songCursor, meter, setControlPoint, touchControl } = this.store.getState();
    setControlPoint(key, songCursor * beatsPerBar(meter), value);
    touchControl(key, value);
  }

  private write(key: ControlKey, take: Take, end: number) {
    this.store.getState().recordTake(key, take.points, take.start, Math.max(end, take.last));
  }

  private loopEnd() {
    const { song = emptySong(), meter } = this.store.getState();
    const beats = beatsPerBar(meter);
    return song.loop ? (song.loop.start + song.loop.length) * beats : song.bars * beats;
  }

  private releaseAll() {
    for (const key of [...this.takes.keys()]) {
      this.release(key);
    }
  }
}
