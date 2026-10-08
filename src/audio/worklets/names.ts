export const PHYSICAL_MODEL_PROCESSOR = "physical-model";
export const PITCH_SHIFTER_PROCESSOR = "pitch-shifter";
export const SPECTRAL_FREEZE_PROCESSOR = "spectral-freeze";
export const GRANULATOR_PROCESSOR = "granulator";
export const SAMPLE_HOLD_PROCESSOR = "sample-hold";
export const MATH_PROCESSOR = "math";
export const SLEW_PROCESSOR = "slew";
export const ENVELOPE_FOLLOWER_PROCESSOR = "envelope-follower";
export const CHORUS_PROCESSOR = "chorus";
export const FLANGER_PROCESSOR = "flanger";
export const PHASER_PROCESSOR = "phaser";
export const VCO_PROCESSOR = "vco";
export const LADDER_PROCESSOR = "ladder";
export const MODAL_PROCESSOR = "modal";
export const PIANO_PROCESSOR = "piano";
export const WIND_PROCESSOR = "wind";
export const STRINGS_PROCESSOR = "strings";
export const OUTPUT_LIMITER_PROCESSOR = "output-limiter";

export type ProcessorMessage =
  | { type: "pluck"; time: number }
  | { type: "freeze"; time: number }
  | { type: "release"; time: number }
  | { type: "sample"; time: number }
  | { type: "operation"; operation: string }
  | { type: "wave"; wave: string }
  | { type: "strike"; time: number }
  | { type: "model"; model: string }
  | { type: "wind"; exciter: string; bore: string }
  | { type: "play"; play: string }
  | { type: "body"; gains: number[] }
  | { type: "noteOn"; note: number; time: number; velocity: number }
  | { type: "noteOff"; note: number; time: number }
  | { type: "allNotesOff"; time: number }
  | { type: "limiter"; enabled: boolean }
  | { type: "unmute" }
  | { type: "stop" };

export type LimiterMessage = { type: "muted" };
