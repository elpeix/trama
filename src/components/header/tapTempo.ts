import { MAX_TEMPO, MIN_TEMPO } from "../../patch/types";

/** Taps further apart than this start a new count. */
const RESET_MS = 2000;
/** How many of the last taps are averaged. */
const TAPS = 5;

/**
 * Keeps the times of the last taps and gives the tempo they mark: the average interval between
 * them, from the second tap on.
 */
export class TapTempo {
  private taps: number[] = [];

  tap(time: number): number | undefined {
    if (this.taps.length > 0 && time - this.taps[this.taps.length - 1] > RESET_MS) {
      this.taps = [];
    }
    this.taps = [...this.taps, time].slice(-TAPS);
    if (this.taps.length < 2) {
      return undefined;
    }
    const interval = (this.taps[this.taps.length - 1] - this.taps[0]) / (this.taps.length - 1);
    return Math.round(Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, 60000 / interval)));
  }
}
