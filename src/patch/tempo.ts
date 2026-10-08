/** Length of each division a param can follow, in beats. */
const DIVISION_BEATS: Record<string, number> = {
  "1/2": 2,
  "3/8": 3 / 2,
  "1/4": 1,
  "3/16": 3 / 4,
  "1/8": 1 / 2,
  "1/16": 1 / 4,
};

const DIVISION_BARS: Record<string, number> = {
  "4 bars": 4,
  "2 bars": 2,
  "1 bar": 1,
};

/** The length in beats of a division, with bars of `beatsPerBar`, or undefined when not synced. */
export function syncBeats(sync: string, beatsPerBar: number): number | undefined {
  const bars = DIVISION_BARS[sync];
  return bars === undefined ? DIVISION_BEATS[sync] : bars * beatsPerBar;
}

export const FREE = "free";

/** An LFO does one cycle per division: from four bars down to a sixteenth. */
export const LFO_SYNC_OPTIONS = [FREE, "4 bars", "2 bars", "1 bar", "1/2", "1/4", "1/8", "1/16"];

/** A delay repeats after a division, dotted ones included: the classic echo times. */
export const DELAY_SYNC_OPTIONS = [FREE, "1/16", "1/8", "3/16", "1/4", "3/8", "1/2"];

/** The length in seconds of a division at `tempo`, or undefined when not synced. */
export function syncedSeconds(sync: string, tempo: number, beatsPerBar: number): number | undefined {
  const beats = syncBeats(sync, beatsPerBar);
  return beats === undefined ? undefined : (beats * 60) / tempo;
}

/** The rate in Hz of one cycle per division at `tempo`, or undefined when not synced. */
export function syncedRate(sync: string, tempo: number, beatsPerBar: number): number | undefined {
  const seconds = syncedSeconds(sync, tempo, beatsPerBar);
  return seconds === undefined ? undefined : 1 / seconds;
}
