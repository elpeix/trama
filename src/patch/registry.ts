import { MIDDLE_C_HZ, NOTE_NAMES, OCTAVE_CENTS } from "./pitch";
import { CHORUS_MAX_DELAY_MS, CHORUS_MAX_VOICES, FLANGER_MAX_DELAY_MS, MODAL_MODEL_NAMES, PHASER_MAX_STAGES, STRINGS_PLAYS, VCO_MAX_VOICES, WIND_BODY_BANDS, WIND_BORES, WIND_EXCITERS, windBodyFrequencies } from "./effects";
import { filterBandFrequencies, frequencyLabel } from "./filterBands";
import { CHORDS, ROOTS, SCALES } from "./scales";
import { formatCurve } from "./sequence";
import { DELAY_SYNC_OPTIONS, FREE, LFO_SYNC_OPTIONS } from "./tempo";
import type { NodeType, Params, PortType } from "./types";

export interface PortDefinition {
  id: string;
  type: PortType;
  /** What the node shows next to the port, when not its id: the name of an In or an Out of a subpatch. */
  label?: string;
  /** What the node shows next to the port instead while a cable reaches `input`, which changes what it gives. */
  fed?: { input: string; label: string };
}

export interface NumberParamDefinition {
  id: string;
  label: string;
  kind: "number";
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
  /** Names shown instead of the numbers, one for each value from `min`: the notes of an octave. */
  valueNames?: readonly string[];
  scale: "linear" | "log";
  modulationRange?: number;
  /**
   * The modulation reaches this param in cents, through the detune of its node, so it multiplies
   * the value instead of adding to it: a frequency.
   */
  modulationInCents?: boolean;
  lockedWhen?: { param: string; value: string; to: number; label: string };
  /**
   * A select param that, unless "free", sets this param from the tempo of the patch: a rate (one
   * cycle per division) or a time (the length of a division).
   */
  sync?: { param: string; as: "rate" | "time" };
  modulationHint?: string;
  /** The param, and its value, that show this one; always shown without it. */
  when?: { param: string; value: string };
  /** The param, and its value, that hide this one, which then does nothing. */
  hiddenWhen?: { param: string; value: string };
}

export interface SelectParamDefinition {
  id: string;
  label: string;
  kind: "select";
  options: readonly string[];
  default: string;
}

/** A row of steps, each a note between `lowest` and `highest` or a rest, stored as text (see sequence.ts). */
export interface SequenceParamDefinition {
  id: string;
  label: string;
  kind: "sequence";
  steps: number;
  lowest: number;
  highest: number;
  default: string;
}

/**
 * A set of notes of its own, chosen on a piano drawn by the node, which it plays instead of the
 * computer keys while another param says so.
 */
export interface NotesParamDefinition {
  id: string;
  label: string;
  kind: "notes";
  lowest: number;
  highest: number;
  default: string;
  /** The param, and its value, that make the node play these notes. */
  when: { param: string; value: string };
  /** The number param that moves these notes an octave at a time, set on the piano too. */
  octave: string;
}

/** A row of steps that sound or stay silent, looping over the first `length` of them, stored as text (see sequence.ts). */
export interface RhythmParamDefinition {
  id: string;
  label: string;
  kind: "rhythm";
  steps: number;
  /** The number param that sets how many of the steps the loop plays. */
  length: string;
  default: string;
  /** Whether each step that sounds has a chance of sounding, lowered with a right click. */
  chance?: boolean;
  /** Whether a step can sound several times within itself. */
  retrig?: boolean;
}

/**
 * One of the cables that reach the node, kept as its id: the trace a scope holds still on. It is
 * chosen on the display the node draws, not with a control of its own, and an id that names no
 * cable any more falls back to the first one, so removing a cable never leaves the node stuck.
 */
export interface CableParamDefinition {
  id: string;
  label: string;
  kind: "cable";
  default: string;
}

/** A row of values between `min` and `max`, drawn on the node and stored as text (see sequence.ts). */
export interface CurveParamDefinition {
  id: string;
  label: string;
  kind: "curve";
  points: number;
  min: number;
  max: number;
  step: number;
  default: string;
  style: "line" | "bars";
  /** What each bar is named under it, instead of its number. */
  labels?: readonly string[];
  /** Names only every so many bars, each name written across them, when there are too many to name each one. */
  labelEvery?: number;
  /** The levels lined across the curve, each named with the unit beside it. */
  marks?: { levels: readonly number[]; unit: string };
  /** The param, and its value, that show the curve; always shown without it. */
  when?: { param: string; value: string };
}

/** The notes of a clip, between `lowest` and `highest`, stored as text (see clip.ts) and edited on the piano roll. */
export interface ClipParamDefinition {
  id: string;
  label: string;
  kind: "clip";
  lowest: number;
  highest: number;
  default: string;
}

/**
 * An audio file, kept by its id in the samples of the patch (see sampleLibrary.ts); empty while
 * none is loaded. It is loaded on the display the node draws.
 */
export interface SampleParamDefinition {
  id: string;
  label: string;
  kind: "sample";
  default: string;
}

export type ParamDefinition =
  | NumberParamDefinition
  | SelectParamDefinition
  | SequenceParamDefinition
  | NotesParamDefinition
  | RhythmParamDefinition
  | CableParamDefinition
  | CurveParamDefinition
  | ClipParamDefinition
  | SampleParamDefinition;

export const MODULE_CATEGORIES = [
  { id: "sources", label: "Sources" },
  { id: "processing", label: "Processing" },
  { id: "modulation", label: "Modulation" },
  { id: "notes", label: "Notes" },
  { id: "output", label: "Output" },
  { id: "patch", label: "Patch" },
] as const;

export type ModuleCategory = (typeof MODULE_CATEGORIES)[number]["id"];

export interface ModuleDefinition {
  title: string;
  category: ModuleCategory;
  /** One line for the module menu. */
  description: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  params: ParamDefinition[];
  hint?: string;
  /** Played from the computer keys: the node shows which notes they play. */
  playedFromKeys?: boolean;
  display?: "scope" | "meter" | "steps" | "mixer" | "wave" | "input" | "midi" | "sample";
  /** The params that make a pattern, of the four it plays one at a time: its melody and rhythm. */
  patterns?: readonly string[];
}

const audio: PortDefinition = { id: "audio", type: "audio" };

const waveforms = ["sine", "square", "sawtooth", "triangle"] as const;

const WAVE_POINTS = 64;
const HARMONICS = 16;
const FILTER_BANDS = 16;
const TRANSFER_POINTS = 64;

const curveOf = (points: number, value: (index: number) => number, step: number) =>
  formatCurve(Array.from({ length: points }, (_, index) => value(index)), step);

const seconds = (id: string, label: string, defaultValue: number, max: number): NumberParamDefinition => ({
  id,
  label,
  kind: "number",
  min: 0.001,
  max,
  step: 0.001,
  default: defaultValue,
  unit: "s",
  scale: "log",
});

const unit = (id: string, label: string, defaultValue: number, max = 1): NumberParamDefinition => ({
  id,
  label,
  kind: "number",
  min: 0,
  max,
  step: 0.01,
  default: defaultValue,
  scale: "linear",
});

const decibels = (id: string, label: string, defaultValue: number, min: number, max: number): NumberParamDefinition => ({
  id,
  label,
  kind: "number",
  min,
  max,
  step: 0.1,
  default: defaultValue,
  unit: "dB",
  scale: "linear",
});

const milliseconds = (id: string, label: string, defaultValue: number, min: number, max: number): NumberParamDefinition => ({
  id,
  label,
  kind: "number",
  min,
  max,
  step: 0.1,
  default: defaultValue,
  unit: "ms",
  scale: "log",
});

/** The rate of the LFO inside an effect, in cycles a second. */
const lfoRate = (defaultValue: number): NumberParamDefinition => ({
  id: "rate",
  label: "Rate",
  kind: "number",
  min: 0.05,
  max: 10,
  step: 0.01,
  default: defaultValue,
  unit: "Hz",
  scale: "log",
});

/** How much of what comes out goes back in, turned over when negative. */
const feedback = (defaultValue: number): NumberParamDefinition => ({
  id: "feedback",
  label: "Feedback",
  kind: "number",
  min: -0.95,
  max: 0.95,
  step: 0.01,
  default: defaultValue,
  scale: "linear",
});

/** The length of a step on the grid, or "gate": a step on each gate into the clock input, as long as it. */
const division: SelectParamDefinition = {
  id: "division",
  label: "Step",
  kind: "select",
  options: ["1/4", "1/8", "1/16", "1/32", "gate"],
  default: "1/16",
};

/** The input of the gates that mark the steps while the step is "gate". */
const clockInput: PortDefinition = { id: "clock", type: "trigger" };

/** How much of each step a note lasts; a step marked by a gate lasts as long as it instead. */
const stepGate: NumberParamDefinition = {
  ...unit("gate", "Gate", 0.5),
  min: 0.05,
  hiddenWhen: { param: "division", value: "gate" },
};

/**
 * The note the computer keys start from, from C to B, a semitone at a time; the keys move an
 * octave at a time with Z and X.
 */
const transpose: NumberParamDefinition = {
  id: "transpose",
  label: "Transpose",
  kind: "number",
  min: 0,
  max: 11,
  step: 1,
  default: 0,
  valueNames: NOTE_NAMES,
  scale: "linear",
};

/**
 * Whether a node that plays notes on its own follows the computer keys: the last key pressed moves
 * its notes, from C4, until another one is.
 */
const keys: SelectParamDefinition = {
  id: "keys",
  label: "Keys",
  kind: "select",
  options: ["off", "transpose"],
  default: "off",
};

/** When a pattern launched takes over: on the next bar, when the one playing starts over, or on the next step. */
const launch: SelectParamDefinition = {
  id: "launch",
  label: "Launch",
  kind: "select",
  options: ["bar", "end", "now"],
  default: "bar",
};

const rhythmOf = (text: string) => text.split("").join(" ");

const REST_ROW = rhythmOf("----------------");

/** The rows of the Drums, each with the gate it opens, and the beat they start with. */
export const DRUM_ROWS = [
  { id: "kick", label: "Kick", default: rhythmOf("x---x---x---x---") },
  { id: "snare", label: "Snare", default: rhythmOf("----x-------x---") },
  { id: "clap", label: "Clap", default: REST_ROW },
  { id: "rim", label: "Rim", default: REST_ROW },
  { id: "lowtom", label: "Lo tom", default: REST_ROW },
  { id: "hightom", label: "Hi tom", default: REST_ROW },
  { id: "hat", label: "Hat", default: rhythmOf("--x---x---x---x-") },
  { id: "open", label: "Open", default: REST_ROW },
];

/**
 * The outputs of a Clock, from the slowest: the division of the grid each follows, in beats, and
 * the gates coming in that each lets one through of, while some come in.
 */
export const CLOCK_OUTPUTS = [
  { id: "bar", label: "bar", beats: 4, divide: 16 },
  { id: "half", label: "1/2", beats: 2, divide: 8 },
  { id: "quarter", label: "1/4", beats: 1, divide: 4 },
  { id: "eighth", label: "1/8", beats: 1 / 2, divide: 3 },
  { id: "sixteenth", label: "1/16", beats: 1 / 4, divide: 2 },
  { id: "thirtysecond", label: "1/32", beats: 1 / 8, divide: 1 },
];

/** What a Math does with its two signals, a and b. */
export const MATH_OPERATIONS = ["add", "subtract", "multiply", "min", "max"] as const;

/** The kind of signal an Out of a subpatch carries. */
const signal: SelectParamDefinition = {
  id: "signal",
  label: "Signal",
  kind: "select",
  options: ["audio", "control", "trigger"],
  default: "audio",
};

/** The kind of signal an In of a subpatch carries: notes too, which it plays as a pitch and a gate. */
const inletSignal: SelectParamDefinition = { ...signal, options: [...signal.options, "notes"] };

const octaveShift: NumberParamDefinition = {
  id: "octave",
  label: "Octave",
  kind: "number",
  min: -3,
  max: 3,
  step: 1,
  default: 0,
  scale: "linear",
};

export const moduleRegistry: Record<NodeType, ModuleDefinition> = {
  oscillator: {
    title: "Oscillator",
    category: "sources",
    description: "A tone with a classic waveform",
    inputs: [],
    outputs: [audio],
    params: [
      {
        id: "waveform",
        label: "Wave",
        kind: "select",
        options: [...waveforms, "drawn", "harmonics"],
        default: "sine",
      },
      {
        id: "mode",
        label: "Mode",
        kind: "select",
        options: ["free", "keyboard"],
        default: "free",
      },
      {
        id: "frequency",
        label: "Freq",
        kind: "number",
        min: 20,
        max: 20000,
        step: 1,
        default: 440,
        unit: "Hz",
        scale: "log",
        modulationRange: 4 * OCTAVE_CENTS,
        modulationInCents: true,
        lockedWhen: { param: "mode", value: "keyboard", to: MIDDLE_C_HZ, label: "C4" },
      },
      {
        id: "detune",
        label: "Detune",
        kind: "number",
        min: -1200,
        max: 1200,
        step: 1,
        default: 0,
        unit: "ct",
        scale: "linear",
        modulationRange: OCTAVE_CENTS,
      },
      {
        id: "shape",
        label: "Shape",
        kind: "curve",
        points: WAVE_POINTS,
        min: -1,
        max: 1,
        step: 0.01,
        default: curveOf(WAVE_POINTS, (index) => Math.sin((2 * Math.PI * index) / WAVE_POINTS), 0.01),
        style: "line",
        when: { param: "waveform", value: "drawn" },
      },
      {
        id: "harmonics",
        label: "Harmonics",
        kind: "curve",
        points: HARMONICS,
        min: 0,
        max: 1,
        step: 0.01,
        default: curveOf(HARMONICS, (index) => 1 / (index + 1), 0.01),
        style: "bars",
        when: { param: "waveform", value: "harmonics" },
      },
    ],
  },
  vco: {
    title: "VCO",
    category: "sources",
    description: "An analog oscillator: pulse width, detuned voices, hard sync and drift",
    inputs: [{ id: "sync", type: "audio" }],
    outputs: [audio],
    params: [
      { id: "waveform", label: "Wave", kind: "select", options: ["sawtooth", "square", "triangle", "sine"], default: "sawtooth" },
      { id: "mode", label: "Mode", kind: "select", options: ["free", "keyboard"], default: "free" },
      {
        id: "frequency",
        label: "Freq",
        kind: "number",
        min: 20,
        max: 20000,
        step: 1,
        default: 440,
        unit: "Hz",
        scale: "log",
        modulationRange: 4 * OCTAVE_CENTS,
        modulationInCents: true,
        lockedWhen: { param: "mode", value: "keyboard", to: MIDDLE_C_HZ, label: "C4" },
      },
      {
        id: "detune",
        label: "Detune",
        kind: "number",
        min: -1200,
        max: 1200,
        step: 1,
        default: 0,
        unit: "ct",
        scale: "linear",
        modulationRange: OCTAVE_CENTS,
      },
      {
        id: "width",
        label: "Width",
        kind: "number",
        min: 0.05,
        max: 0.95,
        step: 0.01,
        default: 0.5,
        scale: "linear",
        modulationRange: 0.45,
        modulationHint: "Moves how long the square stays up: the PWM of the strings of a Juno",
      },
      { id: "voices", label: "Voices", kind: "number", min: 1, max: VCO_MAX_VOICES, step: 1, default: 1, scale: "linear" },
      { id: "spread", label: "Spread", kind: "number", min: 0, max: 100, step: 1, default: 20, unit: "ct", scale: "linear" },
      unit("drift", "Drift", 0),
    ],
    hint: "Width shapes the square; Voices and Spread make a supersaw; a sound into sync starts its cycle over",
  },
  harmonics: {
    title: "Harmonics",
    category: "sources",
    description: "A tone built from sixteen harmonics you draw",
    inputs: [],
    outputs: [audio],
    params: [
      {
        id: "mode",
        label: "Mode",
        kind: "select",
        options: ["free", "keyboard"],
        default: "free",
      },
      {
        id: "frequency",
        label: "Freq",
        kind: "number",
        min: 20,
        max: 1000,
        step: 1,
        default: 110,
        unit: "Hz",
        scale: "log",
        modulationRange: 4 * OCTAVE_CENTS,
        modulationInCents: true,
        lockedWhen: { param: "mode", value: "keyboard", to: MIDDLE_C_HZ, label: "C4" },
      },
      {
        id: "detune",
        label: "Detune",
        kind: "number",
        min: -1200,
        max: 1200,
        step: 1,
        default: 0,
        unit: "ct",
        scale: "linear",
        modulationRange: OCTAVE_CENTS,
      },
      { ...unit("brightness", "Bright", 1), modulationRange: 1 },
      { ...unit("even", "Even", 1), modulationRange: 1 },
      {
        id: "harmonics",
        label: "Harmonics",
        kind: "curve",
        points: HARMONICS,
        min: 0,
        max: 1,
        step: 0.01,
        default: curveOf(HARMONICS, (index) => 1 / (index + 1), 0.01),
        style: "bars",
      },
    ],
    display: "wave",
  },
  physicalModel: {
    title: "Physical Model",
    category: "sources",
    description: "A plucked string, played by a gate",
    inputs: [{ id: "gate", type: "trigger" }],
    outputs: [audio],
    params: [
      {
        id: "mode",
        label: "Mode",
        kind: "select",
        options: ["free", "keyboard"],
        default: "free",
      },
      {
        id: "frequency",
        label: "Freq",
        kind: "number",
        min: 20,
        max: 4000,
        step: 1,
        default: 220,
        unit: "Hz",
        scale: "log",
        modulationRange: 4 * OCTAVE_CENTS,
        modulationInCents: true,
        lockedWhen: { param: "mode", value: "keyboard", to: MIDDLE_C_HZ, label: "C4" },
      },
      {
        id: "detune",
        label: "Detune",
        kind: "number",
        min: -1200,
        max: 1200,
        step: 1,
        default: 0,
        unit: "ct",
        scale: "linear",
        modulationRange: OCTAVE_CENTS,
      },
      { ...seconds("decay", "Decay", 1.5, 10), min: 0.05 },
      { ...seconds("damp", "Damp", 0.08, 2), min: 0.005 },
      { ...unit("brightness", "Tone", 0.5), modulationRange: 1 },
    ],
    hint: "Connect a gate to pluck it",
  },
  piano: {
    title: "Piano",
    category: "sources",
    description: "A grand piano played by notes: stretched partials, strings that beat, hammers and dampers",
    inputs: [{ id: "notes", type: "notes" }],
    outputs: [audio],
    params: [
      { ...unit("brightness", "Bright", 0.5), modulationRange: 1 },
      { id: "decay", label: "Decay", kind: "number", min: 0.25, max: 2, step: 0.01, default: 1, scale: "linear" },
      { id: "unison", label: "Unison", kind: "number", min: 0, max: 4, step: 0.1, default: 1, scale: "linear" },
      unit("hammer", "Hammer", 0.3),
      { ...unit("pedal", "Pedal", 0), modulationRange: 1 },
      unit("body", "Body", 0.6),
    ],
    hint: "Connect the notes of a Keyboard, a Clip or a Seq; Pedal from 0.5 up holds the notes let go",
  },
  wind: {
    title: "Wind",
    category: "sources",
    description: "A wind instrument blown by notes, one at a time: a reed, the lips or a jet of air, a bore, a bell and a body",
    inputs: [{ id: "notes", type: "notes" }],
    outputs: [audio],
    params: [
      { id: "exciter", label: "Exciter", kind: "select", options: WIND_EXCITERS, default: "reed" },
      { id: "bore", label: "Bore", kind: "select", options: WIND_BORES, default: "cylinder" },
      { ...unit("breath", "Breath", 0.7), modulationRange: 1 },
      {
        id: "detune",
        label: "Detune",
        kind: "number",
        min: -1200,
        max: 1200,
        step: 1,
        default: 0,
        unit: "ct",
        scale: "linear",
        modulationRange: OCTAVE_CENTS,
      },
      unit("noise", "Noise", 0.2),
      { ...unit("brightness", "Bright", 0.5), modulationRange: 1 },
      unit("vibrato", "Vibrato", 0),
      { id: "bell", label: "Bell", kind: "number", min: 300, max: 12000, step: 1, default: 2000, unit: "Hz", scale: "log" },
      unit("flare", "Flare", 0),
      unit("attack", "Attack", 0.5),
      {
        id: "body",
        label: "Body",
        kind: "curve",
        points: WIND_BODY_BANDS,
        min: -12,
        max: 24,
        step: 0.5,
        default: curveOf(WIND_BODY_BANDS, () => 0, 0.5),
        style: "bars",
        labels: windBodyFrequencies().map(frequencyLabel),
        labelEvery: 4,
        marks: { levels: [12, 0, -12], unit: "dB" },
      },
    ],
    hint: "Connect the notes of a Keyboard, a Clip or a Seq; a note played while another is held slurs to it, and velocity and Breath blow it harder. Exciter and Bore choose the instrument; Body raises or lowers bands fixed in hertz, as the body of an instrument does",
  },
  strings: {
    title: "Strings",
    category: "sources",
    description: "A violin, a viola, a cello or a double bass played by notes, one at a time: a string drawn by a bow or plucked by a finger, and a body",
    inputs: [{ id: "notes", type: "notes" }],
    outputs: [audio],
    params: [
      { id: "play", label: "Play", kind: "select", options: STRINGS_PLAYS, default: "bowed" },
      { ...unit("bow", "Bow", 0.7), modulationRange: 1 },
      { ...unit("pressure", "Pressure", 0.5), modulationRange: 1 },
      { id: "position", label: "Position", kind: "number", min: 0.06, max: 0.25, step: 0.01, default: 0.12, scale: "linear", modulationRange: 0.19 },
      {
        id: "detune",
        label: "Detune",
        kind: "number",
        min: -1200,
        max: 1200,
        step: 1,
        default: 0,
        unit: "ct",
        scale: "linear",
        modulationRange: OCTAVE_CENTS,
      },
      { ...unit("brightness", "Bright", 0.5), modulationRange: 1 },
      unit("noise", "Noise", 0.15),
      unit("vibrato", "Vibrato", 0),
      unit("attack", "Attack", 0.4),
      {
        id: "body",
        label: "Body",
        kind: "curve",
        points: WIND_BODY_BANDS,
        min: -12,
        max: 24,
        step: 0.5,
        default: curveOf(WIND_BODY_BANDS, () => 0, 0.5),
        style: "bars",
        labels: windBodyFrequencies().map(frequencyLabel),
        labelEvery: 4,
        marks: { levels: [12, 0, -12], unit: "dB" },
      },
    ],
    hint: "Connect the notes of a Keyboard, a Clip or a Seq; a note played while another is held moves the finger without lifting the bow, and velocity and Bow draw it louder. Pressure is how hard the bow presses, Position how near the bridge it draws: nearer is brighter. Plucked, every note is plucked and rings until it is let go",
  },
  modal: {
    title: "Modal",
    category: "sources",
    description: "A struck bell, bar or gong, ringing with the partials of its model",
    inputs: [{ id: "gate", type: "trigger" }],
    outputs: [audio],
    params: [
      { id: "model", label: "Model", kind: "select", options: MODAL_MODEL_NAMES, default: "tubular" },
      { id: "mode", label: "Mode", kind: "select", options: ["free", "keyboard"], default: "free" },
      {
        id: "frequency",
        label: "Freq",
        kind: "number",
        min: 20,
        max: 8000,
        step: 1,
        default: 440,
        unit: "Hz",
        scale: "log",
        modulationRange: 4 * OCTAVE_CENTS,
        modulationInCents: true,
        lockedWhen: { param: "mode", value: "keyboard", to: MIDDLE_C_HZ, label: "C4" },
      },
      {
        id: "detune",
        label: "Detune",
        kind: "number",
        min: -1200,
        max: 1200,
        step: 1,
        default: 0,
        unit: "ct",
        scale: "linear",
        modulationRange: OCTAVE_CENTS,
      },
      { ...seconds("decay", "Decay", 3, 10), min: 0.1 },
      { ...unit("brightness", "Bright", 0.6), modulationRange: 1 },
      unit("hit", "Hit", 0.7),
      { id: "stretch", label: "Stretch", kind: "number", min: -1, max: 1, step: 0.01, default: 0, scale: "linear" },
    ],
    hint: "Connect a gate to strike it; Stretch draws its partials together or pushes them apart",
  },
  noise: {
    title: "Noise",
    category: "sources",
    description: "White noise",
    inputs: [],
    outputs: [audio],
    params: [],
  },
  audioInput: {
    title: "Audio Input",
    category: "sources",
    description: "The microphone or the sound card, into the patch",
    inputs: [],
    outputs: [audio],
    params: [{ ...unit("gain", "Gain", 1, 4) }],
    display: "input",
    hint: "Use headphones: the speakers can feed back into the microphone",
  },
  sampler: {
    title: "Sampler",
    category: "sources",
    description: "Plays a recorded sound on each gate",
    inputs: [{ id: "gate", type: "trigger" }],
    outputs: [audio],
    params: [
      { id: "sample", label: "Sample", kind: "sample", default: "" },
      { id: "play", label: "Play", kind: "select", options: ["one-shot", "gate", "loop"], default: "one-shot" },
      { id: "order", label: "Order", kind: "select", options: ["select", "random", "cycle"], default: "select" },
      { ...unit("select", "Select", 0), modulationRange: 1, when: { param: "order", value: "select" } },
      {
        id: "tune",
        label: "Tune",
        kind: "number",
        min: -24,
        max: 24,
        step: 1,
        default: 0,
        unit: "st",
        scale: "linear",
        modulationRange: 12,
      },
      { ...unit("start", "Start", 0), step: 0.001 },
      { ...unit("end", "End", 1), step: 0.001 },
    ],
    display: "sample",
    hint: "Load or drop audio files, and connect a gate to play them; with several, Select or Order picks which one; a pitch into Tune plays it from C4",
  },
  filter: {
    title: "Filter",
    category: "processing",
    description: "Cuts or boosts a band of frequencies",
    inputs: [audio],
    outputs: [audio],
    params: [
      {
        id: "type",
        label: "Type",
        kind: "select",
        options: ["lowpass", "highpass", "bandpass", "notch"],
        default: "lowpass",
      },
      {
        id: "frequency",
        label: "Freq",
        kind: "number",
        min: 20,
        max: 20000,
        step: 1,
        default: 1200,
        unit: "Hz",
        scale: "log",
        modulationRange: 5 * OCTAVE_CENTS,
        modulationInCents: true,
      },
      {
        id: "Q",
        label: "Q",
        kind: "number",
        min: 0.1,
        max: 30,
        step: 0.1,
        default: 1,
        scale: "linear",
        modulationRange: 10,
      },
    ],
  },
  ladder: {
    title: "Ladder",
    category: "processing",
    description: "The 24 dB low-pass of a Moog: it saturates, and sings at full resonance",
    inputs: [audio],
    outputs: [audio],
    params: [
      {
        id: "frequency",
        label: "Freq",
        kind: "number",
        min: 20,
        max: 20000,
        step: 1,
        default: 800,
        unit: "Hz",
        scale: "log",
        modulationRange: 5 * OCTAVE_CENTS,
        modulationInCents: true,
      },
      { id: "resonance", label: "Res", kind: "number", min: 0, max: 1, step: 0.01, default: 0.3, scale: "linear", modulationRange: 1 },
      unit("drive", "Drive", 0.2),
    ],
    hint: "Res near 1 makes it sing on its own at Freq; Drive pushes the sound into saturation",
  },
  customFilter: {
    title: "Custom Filter",
    category: "processing",
    description: "A filter with the response you draw",
    inputs: [audio],
    outputs: [audio],
    params: [
      {
        id: "response",
        label: "Response",
        kind: "curve",
        points: FILTER_BANDS,
        min: -24,
        max: 24,
        step: 0.5,
        default: curveOf(FILTER_BANDS, () => 0, 0.5),
        style: "bars",
        labels: filterBandFrequencies(FILTER_BANDS).map(frequencyLabel),
        marks: { levels: [12, 0, -12], unit: "dB" },
      },
    ],
    hint: "Draw how much each band, from 25 Hz to 20 kHz, is cut or boosted",
  },
  pitchShifter: {
    title: "Pitch Shifter",
    category: "processing",
    description: "Moves the pitch of a sound, keeping its length",
    inputs: [audio],
    outputs: [audio],
    params: [
      {
        id: "shift",
        label: "Shift",
        kind: "number",
        min: -24,
        max: 24,
        step: 1,
        default: 7,
        unit: "st",
        scale: "linear",
        modulationRange: 12,
      },
      {
        id: "window",
        label: "Window",
        kind: "number",
        min: 20,
        max: 200,
        step: 1,
        default: 60,
        unit: "ms",
        scale: "log",
      },
      unit("mix", "Mix", 0.5),
    ],
  },
  spectralFreeze: {
    title: "Spectral Freeze",
    category: "processing",
    description: "Holds the sound of an instant while its gate is open",
    inputs: [audio, { id: "gate", type: "trigger" }],
    outputs: [audio],
    params: [unit("mix", "Mix", 0.5), { ...seconds("release", "Release", 1, 10), min: 0.01 }],
    hint: "Open a gate to freeze the sound it gets; it fades when the gate closes",
  },
  granulator: {
    title: "Granulator",
    category: "processing",
    description: "Breaks the sound it gets into a cloud of grains",
    inputs: [audio],
    outputs: [audio],
    params: [
      {
        id: "position",
        label: "Position",
        kind: "number",
        min: 0,
        max: 4,
        step: 0.01,
        default: 0.3,
        unit: "s",
        scale: "linear",
        modulationRange: 1,
      },
      {
        id: "size",
        label: "Size",
        kind: "number",
        min: 10,
        max: 500,
        step: 1,
        default: 80,
        unit: "ms",
        scale: "log",
      },
      {
        id: "density",
        label: "Density",
        kind: "number",
        min: 1,
        max: 100,
        step: 0.1,
        default: 20,
        unit: "/s",
        scale: "log",
      },
      {
        id: "pitch",
        label: "Pitch",
        kind: "number",
        min: -24,
        max: 24,
        step: 1,
        default: 0,
        unit: "st",
        scale: "linear",
        modulationRange: 12,
      },
      { ...unit("spread", "Spread", 0.2), modulationRange: 1 },
      unit("mix", "Mix", 0.7),
      { id: "freeze", label: "Freeze", kind: "select", options: ["off", "on"], default: "off" },
    ],
    hint: "Position reads up to four seconds back; Freeze holds what it heard",
  },
  gain: {
    title: "Gain",
    category: "processing",
    description: "Volume; with an ADSR, a VCA",
    inputs: [audio],
    outputs: [audio],
    params: [
      {
        ...unit("gain", "Gain", 0.5),
        modulationRange: 1,
        modulationHint: "Set to 0 so the modulation can fully close it",
      },
    ],
  },
  delay: {
    title: "Delay",
    category: "processing",
    description: "Echo with feedback",
    inputs: [audio],
    outputs: [audio],
    params: [
      { id: "sync", label: "Sync", kind: "select", options: DELAY_SYNC_OPTIONS, default: FREE },
      { ...unit("time", "Time", 0.3, 2), min: 0.01, unit: "s", sync: { param: "sync", as: "time" } },
      unit("feedback", "Feedback", 0.4, 0.95),
      unit("mix", "Mix", 0.5),
    ],
  },
  distortion: {
    title: "Distortion",
    category: "processing",
    description: "Saturates, clips or folds the sound, or bends it through a curve you draw",
    inputs: [audio],
    outputs: [audio],
    params: [
      { id: "mode", label: "Mode", kind: "select", options: ["soft", "hard", "fold", "drawn"], default: "soft" },
      {
        id: "drive",
        label: "Drive",
        kind: "number",
        min: 1,
        max: 40,
        step: 0.1,
        default: 4,
        scale: "log",
        modulationRange: 10,
      },
      {
        id: "shape",
        label: "Shape",
        kind: "curve",
        points: TRANSFER_POINTS,
        min: -1,
        max: 1,
        step: 0.01,
        default: curveOf(TRANSFER_POINTS, (index) => (2 * index) / (TRANSFER_POINTS - 1) - 1, 0.01),
        style: "line",
        when: { param: "mode", value: "drawn" },
      },
      {
        id: "tone",
        label: "Tone",
        kind: "number",
        min: 500,
        max: 20000,
        step: 1,
        default: 12000,
        unit: "Hz",
        scale: "log",
        modulationRange: 4 * OCTAVE_CENTS,
        modulationInCents: true,
      },
      unit("mix", "Mix", 1),
    ],
  },
  reverb: {
    title: "Reverb",
    category: "processing",
    description: "The sound of a room, from a small one to a hall",
    inputs: [audio],
    outputs: [audio],
    params: [
      { ...seconds("decay", "Decay", 2, 10), min: 0.1, step: 0.01 },
      { ...unit("predelay", "Pre-delay", 0.02, 0.25), step: 0.001, unit: "s" },
      {
        id: "tone",
        label: "Tone",
        kind: "number",
        min: 500,
        max: 20000,
        step: 1,
        default: 6000,
        unit: "Hz",
        scale: "log",
        modulationRange: 4 * OCTAVE_CENTS,
        modulationInCents: true,
      },
      unit("mix", "Mix", 0.3),
    ],
  },
  compressor: {
    title: "Compressor",
    category: "processing",
    description: "Brings the loud parts of a sound down, for drums and the whole mix",
    inputs: [audio],
    outputs: [audio],
    params: [
      decibels("threshold", "Threshold", -24, -60, 0),
      { id: "ratio", label: "Ratio", kind: "number", min: 1, max: 20, step: 0.1, default: 4, scale: "log" },
      decibels("knee", "Knee", 6, 0, 40),
      seconds("attack", "Attack", 0.003, 1),
      { ...seconds("release", "Release", 0.25, 1), min: 0.01 },
      decibels("makeup", "Makeup", 0, 0, 24),
    ],
    hint: "Past Threshold, the sound grows Ratio times less; Makeup raises it all back",
  },
  chorus: {
    title: "Chorus",
    category: "processing",
    description: "Copies of a sound a little late, swept by an LFO: wider and thicker",
    inputs: [audio],
    outputs: [audio],
    params: [
      lfoRate(0.8),
      unit("depth", "Depth", 0.5),
      milliseconds("delay", "Delay", 18, 5, CHORUS_MAX_DELAY_MS),
      { id: "voices", label: "Voices", kind: "number", min: 1, max: CHORUS_MAX_VOICES, step: 1, default: 2, scale: "linear" },
      unit("mix", "Mix", 0.5),
    ],
  },
  flanger: {
    title: "Flanger",
    category: "processing",
    description: "A very short swept delay fed back into itself: the sound of a jet",
    inputs: [audio],
    outputs: [audio],
    params: [
      lfoRate(0.3),
      unit("depth", "Depth", 0.7),
      milliseconds("delay", "Delay", 2, 0.5, FLANGER_MAX_DELAY_MS),
      feedback(0.5),
      unit("mix", "Mix", 0.5),
    ],
  },
  phaser: {
    title: "Phaser",
    category: "processing",
    description: "Notches swept up and down the sound by an LFO",
    inputs: [audio],
    outputs: [audio],
    params: [
      lfoRate(0.5),
      unit("depth", "Depth", 0.7),
      { id: "frequency", label: "Freq", kind: "number", min: 100, max: 4000, step: 1, default: 700, unit: "Hz", scale: "log" },
      { id: "stages", label: "Stages", kind: "number", min: 2, max: PHASER_MAX_STAGES, step: 2, default: 4, scale: "linear" },
      feedback(0.3),
      unit("mix", "Mix", 0.5),
    ],
  },
  lfo: {
    title: "LFO",
    category: "modulation",
    description: "A slow wave to move a param",
    inputs: [],
    outputs: [{ id: "out", type: "control" }],
    params: [
      { id: "waveform", label: "Wave", kind: "select", options: waveforms, default: "sine" },
      { id: "sync", label: "Sync", kind: "select", options: LFO_SYNC_OPTIONS, default: FREE },
      {
        id: "rate",
        label: "Rate",
        kind: "number",
        min: 0.05,
        max: 40,
        step: 0.01,
        default: 2,
        unit: "Hz",
        scale: "log",
        sync: { param: "sync", as: "rate" },
      },
    ],
  },
  envelope: {
    title: "ADSR",
    category: "modulation",
    description: "A shape started by a gate",
    inputs: [{ id: "gate", type: "trigger" }],
    outputs: [{ id: "out", type: "control" }],
    params: [
      seconds("attack", "A", 0.01, 5),
      seconds("decay", "D", 0.3, 5),
      unit("sustain", "S", 0.6),
      seconds("release", "R", 0.5, 10),
      { id: "curve", label: "Curve", kind: "select", options: ["linear", "exp", "clap"], default: "linear" },
      seconds("spread", "Spread", 0.01, 0.05),
    ],
  },
  sampleHold: {
    title: "Sample & Hold",
    category: "modulation",
    description: "Holds the value of a signal, or a random one, on each step or gate",
    inputs: [
      { id: "in", type: "control" },
      { id: "gate", type: "trigger" },
    ],
    outputs: [{ id: "out", type: "control" }],
    params: [{ id: "clock", label: "Clock", kind: "select", options: ["gate", "1/4", "1/8", "1/16", "1/32"], default: "1/8" }],
    hint: "Without a cable into in, it holds a random value from -1 to 1",
  },
  quantizer: {
    title: "Quantizer",
    category: "modulation",
    description: "Rounds a pitch to the nearest note of a scale",
    inputs: [{ id: "in", type: "control" }],
    outputs: [{ id: "out", type: "control" }],
    params: [
      { id: "root", label: "Root", kind: "select", options: ROOTS, default: "C" },
      { id: "scale", label: "Scale", kind: "select", options: Object.keys(SCALES), default: "major" },
    ],
    hint: "A pitch as the Keyboard gives it: 0 is C4, and 1 an octave above",
  },
  math: {
    title: "Math",
    category: "modulation",
    description: "Adds, subtracts or multiplies two control signals, or takes the lowest or the highest",
    inputs: [{ id: "a", type: "control" }],
    outputs: [{ id: "out", type: "control" }],
    params: [
      { id: "operation", label: "Op", kind: "select", options: MATH_OPERATIONS, default: "add" },
      {
        id: "b",
        label: "B",
        kind: "number",
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        scale: "linear",
        modulationRange: 1,
      },
    ],
    hint: "B is the knob plus the cables into b: without one, it offsets a, or scales and inverts it with multiply",
  },
  slew: {
    title: "Slew",
    category: "modulation",
    description: "Smooths the jumps of a control signal: a portamento for any pitch",
    inputs: [{ id: "in", type: "control" }],
    outputs: [{ id: "out", type: "control" }],
    params: [seconds("rise", "Rise", 0.1, 10), seconds("fall", "Fall", 0.1, 10)],
    hint: "Rise and Fall are the time to move by 1 up or down: an octave, on a pitch",
  },
  envelopeFollower: {
    title: "Envelope Follower",
    category: "modulation",
    description: "The level of a sound as a control signal: the base of a sidechain",
    inputs: [audio],
    outputs: [{ id: "out", type: "control" }],
    params: [
      seconds("attack", "Attack", 0.01, 1),
      seconds("release", "Release", 0.2, 5),
      unit("gain", "Gain", 1, 4),
    ],
    hint: "With a negative cable into a Gain, a sound ducks while another one plays",
  },
  clock: {
    title: "Clock",
    category: "modulation",
    description: "A gate on each division of the grid, or on one of every few gates it gets",
    inputs: [{ id: "gate", type: "trigger" }],
    outputs: CLOCK_OUTPUTS.map(({ id, label, divide }) => ({
      id,
      type: "trigger",
      label,
      fed: { input: "gate", label: `÷${divide}` },
    })),
    params: [{ ...unit("gate", "Gate", 0.5, 0.95), min: 0.05 }],
    hint: "With a cable into gate, it divides the gates it gets instead of following the grid",
  },
  keyboard: {
    title: "Keyboard",
    category: "notes",
    description: "Play notes with the computer keys",
    inputs: [],
    outputs: [
      { id: "pitch", type: "control" },
      { id: "gate", type: "trigger" },
      { id: "notes", type: "notes" },
      { id: "velocity", type: "control" },
    ],
    params: [transpose],
    playedFromKeys: true,
  },
  midiInput: {
    title: "MIDI In",
    category: "notes",
    description: "Play notes with a MIDI keyboard or controller",
    inputs: [],
    outputs: [
      { id: "pitch", type: "control" },
      { id: "gate", type: "trigger" },
      { id: "notes", type: "notes" },
      { id: "velocity", type: "control" },
      { id: "mod", type: "control" },
      { id: "pedal", type: "control" },
    ],
    params: [
      {
        id: "channel",
        label: "Channel",
        kind: "select",
        options: ["all", ...Array.from({ length: 16 }, (_, index) => String(index + 1))],
        default: "all",
      },
      { ...transpose, min: -24, max: 24, unit: "st", valueNames: undefined },
      { id: "bend", label: "Bend", kind: "number", min: 0, max: 12, step: 1, default: 2, unit: "st", scale: "linear" },
    ],
    display: "midi",
    hint: "Hears every MIDI device plugged in. The pitch wheel bends pitch by Bend semitones; mod is the mod wheel and pedal the sustain pedal, which also holds the notes let go while down",
  },
  arpeggiator: {
    title: "Arp",
    category: "notes",
    description: "Plays the held keys in turn",
    inputs: [clockInput],
    outputs: [
      { id: "pitch", type: "control" },
      { id: "gate", type: "trigger" },
    ],
    params: [
      { id: "source", label: "Source", kind: "select", options: ["keys", "notes"], default: "keys" },
      division,
      { id: "start", label: "Start", kind: "select", options: ["grid", "now"], default: "grid" },
      {
        id: "pattern",
        label: "Pattern",
        kind: "select",
        options: ["up", "down", "up-down", "random"],
        default: "up",
      },
      {
        id: "chord",
        label: "Chord",
        kind: "select",
        options: ["off", "major", "minor", "7", "maj7", "m7", "sus4"],
        default: "off",
      },
      { id: "span", label: "Span", kind: "number", min: 1, max: 3, step: 1, default: 1, unit: "oct", scale: "linear" },
      stepGate,
      { id: "length", label: "Length", kind: "number", min: 1, max: 16, step: 1, default: 8, scale: "linear" },
      transpose,
      {
        id: "rhythm",
        label: "Rhythm",
        kind: "rhythm",
        steps: 16,
        length: "length",
        default: Array.from({ length: 16 }, () => "x").join(" "),
      },
      {
        id: "notes",
        label: "Notes",
        kind: "notes",
        // One octave, like the computer keys; the octave param moves them.
        lowest: 60,
        highest: 72,
        default: "C4 E4 G4",
        when: { param: "source", value: "notes" },
        octave: "octave",
      },
      octaveShift,
      keys,
      launch,
    ],
    hint: "Hold several keys at once to arpeggiate them; the pencil writes the rhythm and the notes as text. With Step at gate, each gate into clock plays a step",
    playedFromKeys: true,
    patterns: ["pattern", "chord", "length", "rhythm", "notes"],
  },
  sequencer: {
    title: "Seq",
    category: "notes",
    description: "A loop of 16 steps",
    inputs: [clockInput],
    outputs: [
      { id: "pitch", type: "control" },
      { id: "gate", type: "trigger" },
      { id: "accent", type: "control" },
      { id: "notes", type: "notes" },
    ],
    params: [
      division,
      { id: "length", label: "Length", kind: "number", min: 1, max: 16, step: 1, default: 16, scale: "linear" },
      stepGate,
      { id: "glide", label: "Glide", kind: "number", min: 0, max: 500, step: 1, default: 60, unit: "ms", scale: "linear" },
      octaveShift,
      { id: "root", label: "Root", kind: "select", options: ROOTS, default: "C" },
      { id: "scale", label: "Scale", kind: "select", options: Object.keys(SCALES), default: "pentatonic minor" },
      { id: "chord", label: "Chord", kind: "select", options: Object.keys(CHORDS), default: "off" },
      keys,
      launch,
      {
        id: "steps",
        label: "Steps",
        kind: "sequence",
        steps: 16,
        // Two octaves from any root in the fourth octave: C4 to B6.
        lowest: 60,
        highest: 95,
        default: "C4 - D#4 - F4 - G4 - A#4 - G4 - F4 - D#4 -",
      },
    ],
    hint: "Click the grid to place a note on a step, click it again to remove it; the % row under it makes a note sound only some of the time; the pencil writes the steps as text. With Step at gate, each gate into clock plays a step",
    display: "steps",
    patterns: ["length", "root", "scale", "chord", "steps"],
  },
  clip: {
    title: "Clip",
    category: "notes",
    description: "A phrase of notes of any length, on a piano roll",
    inputs: [],
    outputs: [
      { id: "pitch", type: "control" },
      { id: "gate", type: "trigger" },
      { id: "notes", type: "notes" },
      { id: "velocity", type: "control" },
    ],
    params: [
      { id: "bars", label: "Bars", kind: "number", min: 1, max: 16, step: 1, default: 2, scale: "linear" },
      octaveShift,
      {
        id: "notes",
        label: "Notes",
        kind: "clip",
        lowest: 24,
        highest: 96,
        default: "C4@0+1 D#4@1+0.5 G4@1.5+1.5 A#4@3+1 G4@4+2 F4@6+1 D#4@7+1",
      },
      launch,
    ],
    hint: "Edit opens the piano roll at the bottom of the screen; stacked notes make chords",
    patterns: ["bars", "notes"],
  },
  drums: {
    title: "Drums",
    category: "notes",
    description: "A row of steps for each drum, each with a gate",
    inputs: [clockInput],
    outputs: [
      ...DRUM_ROWS.map((row): PortDefinition => ({ id: row.id, type: "trigger", label: row.label.toLowerCase() })),
      { id: "accent", type: "control" },
    ],
    params: [
      division,
      { id: "length", label: "Length", kind: "number", min: 1, max: 16, step: 1, default: 16, scale: "linear" },
      stepGate,
      launch,
      ...[...DRUM_ROWS, { id: "accent", label: "Acc", default: REST_ROW }].map(
        (row): RhythmParamDefinition => ({ ...row, kind: "rhythm", steps: 16, length: "length", chance: true, retrig: true }),
      ),
    ],
    hint: "Click a step to make a drum sound on it, and right-click a step to make it sound only some of the time; each row opens its own gate, and the pencil writes the rows as text. With Step at gate, each gate into clock plays a step",
    patterns: ["length", ...DRUM_ROWS.map(({ id }) => id), "accent"],
  },
  mixer: {
    title: "Mixer",
    category: "processing",
    description: "Mixes sounds, a channel per cable",
    inputs: [audio],
    outputs: [audio],
    params: [{ ...unit("level", "Level", 1), modulationRange: 1 }],
    display: "mixer",
  },
  pan: {
    title: "Pan",
    category: "processing",
    description: "Places a sound between left and right",
    inputs: [audio],
    outputs: [audio],
    params: [
      {
        id: "pan",
        label: "Pan",
        kind: "number",
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        scale: "linear",
        modulationRange: 1,
      },
    ],
  },
  output: {
    title: "Output",
    category: "output",
    description: "To the speakers, with a level meter",
    inputs: [audio],
    outputs: [],
    params: [
      unit("volume", "Volume", 1),
      { id: "limiter", label: "Limiter", kind: "select", options: ["on", "off"], default: "on" },
    ],
    hint: "The limiter keeps the sound under 0 dBFS, and mutes it if it runs away",
    display: "meter",
  },
  scope: {
    title: "Scope",
    category: "output",
    description: "Draws the signals it gets",
    inputs: [audio, { id: "control", type: "control" }],
    outputs: [],
    params: [
      {
        id: "time",
        label: "Time",
        kind: "number",
        min: 0.005,
        max: 5,
        step: 0.001,
        default: 0.02,
        unit: "s",
        scale: "log",
      },
      {
        id: "range",
        label: "Range",
        kind: "number",
        min: 0.01,
        max: 10,
        step: 0.01,
        default: 1,
        scale: "log",
      },
      { id: "trigger", label: "Trigger", kind: "cable", default: "" },
    ],
    display: "scope",
  },
  subpatch: {
    title: "Subpatch",
    category: "patch",
    description: "A group of modules in a node of its own",
    inputs: [],
    outputs: [],
    params: [{ id: "voices", label: "Voices", kind: "number", min: 1, max: 8, step: 1, default: 1, scale: "linear" }],
    hint: "Open it to add modules inside; an In or an Out inside makes a port outside. With an In of notes, Voices plays chords",
  },
  inlet: {
    title: "In",
    category: "patch",
    description: "A port into the subpatch it is in",
    inputs: [],
    outputs: [],
    params: [
      inletSignal,
      {
        id: "value",
        label: "Value",
        kind: "number",
        min: -1,
        max: 1,
        step: 0.01,
        default: 0,
        scale: "linear",
        when: { param: "signal", value: "control" },
      },
    ],
  },
  outlet: {
    title: "Out",
    category: "patch",
    description: "A port out of the subpatch it is in",
    inputs: [],
    outputs: [],
    params: [signal],
  },
};

/** Whether a number param is hidden by the value of another one of its node, which it then does nothing for. */
export function paramHidden(definition: ParamDefinition, params: Params): boolean {
  if (definition.kind !== "number") {
    return false;
  }
  const { when, hiddenWhen } = definition;
  return (
    (when !== undefined && params[when.param] !== when.value) ||
    (hiddenWhen !== undefined && params[hiddenWhen.param] === hiddenWhen.value)
  );
}

export function defaultParams(type: NodeType): Params {
  return Object.fromEntries(
    moduleRegistry[type].params.map((param) => [param.id, param.default]),
  );
}

export function modulatableParams(type: NodeType): NumberParamDefinition[] {
  return moduleRegistry[type].params.filter(
    (param): param is NumberParamDefinition =>
      param.kind === "number" && param.modulationRange !== undefined,
  );
}

export function portsOf(type: NodeType): { inputs: PortDefinition[]; outputs: PortDefinition[] } {
  const { inputs, outputs } = moduleRegistry[type];
  return {
    inputs: [
      ...inputs,
      ...modulatableParams(type).map((param): PortDefinition => ({ id: param.id, type: "control" })),
    ],
    outputs,
  };
}
