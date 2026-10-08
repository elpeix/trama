import { changesIn, valueAt, type ControlKey } from "../patch/automation";
import { cellAt, fadeGain, laneOf, launchedOn, nextBar, slotAt } from "../patch/song";
import { STOP, type Launch } from "../patch/patterns";
import type { Song } from "../patch/types";
import type { Transport } from "./Transport";

const TICK_MS = 25;
const EPSILON = 1e-6;
const LOOKAHEAD_SECONDS = 0.1;

interface Placed {
  /** Bars played since the start, counted from the first beat of the transport. */
  played: number;
  bar: number;
  /** Whether the song got to it from somewhere else than the bar before: the start, or the loop going round. */
  jumped: boolean;
}

/** Sets a control at a time: to a value, or back to its value in the patch with undefined. */
export type ApplyControl = (key: ControlKey, value: number | undefined, time: number) => void;

/** Brings the volume of the sound to `gain` by `time`. */
export type ApplyFade = (gain: number, time: number) => void;

/**
 * Plays a song on the transport: before each bar it launches, for the first beat of that bar, the
 * pattern each node has on it, and a little ahead it sets each control to the points of its lane.
 * It starts together with the transport, so that its first bar is the first beat. Over the fade of
 * the song, it brings the volume down a little ahead too, to nothing at the end.
 */
export class SongPlayer {
  private readonly context: BaseAudioContext;
  private readonly transport: Transport;
  private readonly launch: (path: string, slot: Launch, mode: string, at?: number) => void;
  private readonly onEnd: () => void;
  private readonly apply: ApplyControl | undefined;
  private readonly applyFade: ApplyFade | undefined;
  private from = 0;
  private lastGain: number | undefined;
  private readonly held = new Set<ControlKey>();
  private scheduledUntil = 0;
  private song: Song | undefined;
  private timer: ReturnType<typeof setInterval> | undefined;
  private current: Placed | undefined;
  private launched: Placed | undefined;
  private endBeat: number | undefined;

  constructor(
    context: BaseAudioContext,
    transport: Transport,
    launch: (path: string, slot: Launch, mode: string, at?: number) => void,
    onEnd: () => void,
    apply?: ApplyControl,
    applyFade?: ApplyFade,
  ) {
    this.context = context;
    this.transport = transport;
    this.launch = launch;
    this.onEnd = onEnd;
    this.apply = apply;
    this.applyFade = applyFade;
  }

  /** The bar of the song that plays, while it does. */
  get bar(): number | undefined {
    return this.placedNow()?.bar;
  }

  /** Where the song is, in beats from its start, while it plays. */
  get position(): number | undefined {
    const placed = this.placedNow();
    if (!placed) {
      return undefined;
    }
    const beat = this.transport.beatAt(this.context.currentTime);
    return placed.bar * this.beatsPerBar + beat - placed.played * this.beatsPerBar;
  }

  private placedNow(): Placed | undefined {
    if (this.timer === undefined || !this.current) {
      return undefined;
    }
    const beat = this.transport.beatAt(this.context.currentTime);
    return this.placedAt(Math.floor(beat / this.beatsPerBar + EPSILON)) ?? this.current;
  }

  private get beatsPerBar() {
    return this.transport.beatsPerBar;
  }

  /** How far into a bar the patterns of the next one are launched: early enough for any step clock. */
  private get launchAhead() {
    return this.beatsPerBar / 2;
  }

  start(song: Song, from: number) {
    this.stop();
    this.song = song;
    this.from = from;
    this.lastGain = undefined;
    this.current = { played: 0, bar: from, jumped: true };
    this.launched = this.current;
    this.endBeat = undefined;
    this.scheduledUntil = 0;
    this.held.clear();
    this.launchBar(from, true, "now");
    this.scheduleControls(this.transport.beatAt(this.context.currentTime + LOOKAHEAD_SECONDS));
    this.scheduleFade(this.context.currentTime);
    this.timer = setInterval(this.tick, TICK_MS);
  }

  /** Leaves a control to the hand that holds it, until release. */
  hold(key: ControlKey) {
    this.held.add(key);
  }

  release(key: ControlKey) {
    this.held.delete(key);
  }

  isHeld(key: ControlKey): boolean {
    return this.held.has(key);
  }

  /** Plays on with the song changed; the bar launched ahead is launched again as it now is. */
  update(song: Song) {
    this.song = song;
    if (this.timer !== undefined && this.launched && this.current && this.launched.played > this.current.played) {
      this.launchBar(this.launched.bar, this.launched.bar !== this.current.bar + 1);
    }
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  private tick = () => {
    const song = this.song;
    if (!song || !this.launched) {
      return;
    }
    const beat = this.transport.beatAt(this.context.currentTime) + EPSILON;
    if (this.endBeat !== undefined && beat >= this.endBeat) {
      this.stop();
      this.onEnd();
      return;
    }
    const played = Math.floor(beat / this.beatsPerBar);
    if (this.launched.played === played) {
      this.current = this.launched;
    }
    const upcoming = this.launched.played + 1;
    if (this.endBeat === undefined && beat >= upcoming * this.beatsPerBar - this.launchAhead) {
      const bar = nextBar(song, this.launched.bar);
      if (bar === undefined) {
        this.endBeat = upcoming * this.beatsPerBar;
        return;
      }
      this.current = this.launched;
      this.launched = { played: upcoming, bar, jumped: bar !== this.current.bar + 1 };
      this.launchBar(bar, this.launched.jumped);
    }
    this.scheduleControls(this.transport.beatAt(this.context.currentTime + LOOKAHEAD_SECONDS));
    this.scheduleFade(this.context.currentTime + LOOKAHEAD_SECONDS);
  };

  /** The volume the fade gives at `time`, sent when it changes. */
  private scheduleFade(time: number) {
    const gain = fadeGain(this.song!, this.from, this.transport.beatAt(time), this.beatsPerBar);
    if (gain !== this.lastGain) {
      this.lastGain = gain;
      this.applyFade?.(gain, time);
    }
  }

  private placedAt(played: number): Placed | undefined {
    return [this.current, this.launched].find((placed) => placed?.played === played);
  }

  /** Sets the controls on the points up to `until`, a beat of the transport, going bar by bar. */
  private scheduleControls(until: number) {
    const song = this.song;
    const keys = Object.keys(song?.automation ?? {}).filter((key) => !this.held.has(key));
    const end = Math.min(until, this.endBeat ?? Infinity);
    let from = this.scheduledUntil;
    while (song && from < end - EPSILON) {
      const played = Math.floor(from / this.beatsPerBar + EPSILON);
      const placed = this.placedAt(played);
      if (!placed) {
        break;
      }
      const barStart = played * this.beatsPerBar;
      const to = Math.min(end, barStart + this.beatsPerBar);
      const offset = placed.bar * this.beatsPerBar - barStart;
      const atJump = placed.jumped && Math.abs(from - barStart) < EPSILON;
      for (const key of this.apply ? keys : []) {
        const points = laneOf(song, key);
        if (atJump) {
          this.apply!(key, valueAt(points, from + offset), this.transport.timeAt(from));
        }
        for (const point of changesIn(points, from + offset, to + offset)) {
          if (!atJump || point.beat > from + offset + EPSILON) {
            this.apply!(key, point.value, this.transport.timeAt(point.beat - offset));
          }
        }
      }
      from = to;
    }
    this.scheduledUntil = Math.max(this.scheduledUntil, from);
  }

  /**
   * Launches the letters of a bar, each for the first beat of its pattern; after a jump, what sounds
   * on it, for the beat it has got to, as if the song had played up to it. Ahead of a bar they wait
   * for it; at the start they take over on the first step, which a clock that joins a little late
   * would otherwise miss for a whole bar.
   */
  private launchBar(bar: number, jumped: boolean, mode = "bar") {
    const song = this.song!;
    for (const path of Object.keys(song.rows)) {
      const slot = jumped ? slotAt(song, path, bar) : cellAt(song, path, bar);
      if (slot) {
        const written = jumped ? launchedOn(song, path, bar)! : bar;
        this.launch(path, slot, mode, slot === STOP ? undefined : (bar - written) * this.beatsPerBar);
      }
    }
  }
}
