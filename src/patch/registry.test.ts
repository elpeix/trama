import { describe, expect, it } from "vitest";
import { DRIVE_RANGE } from "../audio/modules/processing/distortionCurve";
import { defaultParams, MATH_OPERATIONS, moduleRegistry, modulatableParams, paramHidden, portsOf } from "./registry";
import { ROOTS, SCALES } from "./scales";

describe("defaultParams", () => {
  it("builds the default params of an oscillator", () => {
    expect(defaultParams("oscillator")).toEqual({
      waveform: "sine",
      mode: "free",
      frequency: 440,
      detune: 0,
      shape: expect.stringMatching(/^0 0.1 0.2 0.29 0.38 /),
      harmonics: expect.stringMatching(/^1 0.5 0.33 0.25 0.2 /),
    });
  });

  it("builds the default params of a filter", () => {
    expect(defaultParams("filter")).toEqual({
      type: "lowpass",
      frequency: 1200,
      Q: 1,
    });
  });

  it("builds the default params of a gain", () => {
    expect(defaultParams("gain")).toEqual({ gain: 0.5 });
  });

  it("builds the default params of an LFO", () => {
    expect(defaultParams("lfo")).toEqual({ waveform: "sine", sync: "free", rate: 2 });
  });

  it("builds the default params of an envelope", () => {
    expect(defaultParams("envelope")).toEqual({
      attack: 0.01,
      decay: 0.3,
      sustain: 0.6,
      release: 0.5,
      curve: "linear",
      spread: 0.01,
    });
  });

  it("builds the default params of a keyboard", () => {
    expect(defaultParams("keyboard")).toEqual({ transpose: 0 });
  });

  it("builds the default params of a delay", () => {
    expect(defaultParams("delay")).toEqual({ sync: "free", time: 0.3, feedback: 0.4, mix: 0.5 });
  });

  it("builds the default params of a reverb", () => {
    expect(defaultParams("reverb")).toEqual({ decay: 2, predelay: 0.02, tone: 6000, mix: 0.3 });
  });

  it("builds the default params of a distortion, with the shape drawn as a straight line", () => {
    expect(defaultParams("distortion")).toEqual({
      mode: "soft",
      drive: 4,
      shape: expect.stringMatching(/^-1 -0.97 -0.94 /),
      tone: 12000,
      mix: 1,
    });
    expect(String(defaultParams("distortion").shape).split(" ").at(-1)).toBe("1");
  });

  it("builds the default params of a sample and hold", () => {
    expect(defaultParams("sampleHold")).toEqual({ clock: "1/8" });
  });

  it("builds the default params of a quantizer", () => {
    expect(defaultParams("quantizer")).toEqual({ root: "C", scale: "major" });
  });

  it("builds the default params of a math: a cable through as it comes", () => {
    expect(defaultParams("math")).toEqual({ operation: "add", b: 0 });
  });

  it("builds the default params of a slew", () => {
    expect(defaultParams("slew")).toEqual({ rise: 0.1, fall: 0.1 });
  });

  it("builds the default params of an envelope follower", () => {
    expect(defaultParams("envelopeFollower")).toEqual({ attack: 0.01, release: 0.2, gain: 1 });
  });

  it("builds the default params of a compressor", () => {
    expect(defaultParams("compressor")).toEqual({
      threshold: -24,
      ratio: 4,
      knee: 6,
      attack: 0.003,
      release: 0.25,
      makeup: 0,
    });
  });

  it("builds the default params of a clock", () => {
    expect(defaultParams("clock")).toEqual({ gate: 0.5 });
  });

  it("builds the default params of an audio input", () => {
    expect(defaultParams("audioInput")).toEqual({ gain: 1 });
  });

  it("returns no params for the noise, and full volume and the limiter on for the output", () => {
    expect(defaultParams("noise")).toEqual({});
    expect(defaultParams("output")).toEqual({ volume: 1, limiter: "on" });
  });
});

describe("moduleRegistry", () => {
  it("gives the output an audio input and no outputs", () => {
    expect(moduleRegistry.output.inputs).toEqual([{ id: "audio", type: "audio" }]);
    expect(moduleRegistry.output.outputs).toEqual([]);
  });

  it("gives the oscillator no explicit inputs", () => {
    expect(moduleRegistry.oscillator.inputs).toEqual([]);
  });
});

describe("portsOf", () => {
  it("adds a control input for every modulatable param", () => {
    expect(portsOf("oscillator").inputs).toEqual([
      { id: "frequency", type: "control" },
      { id: "detune", type: "control" },
    ]);
  });

  it("keeps explicit inputs before the control inputs", () => {
    expect(portsOf("filter").inputs).toEqual([
      { id: "audio", type: "audio" },
      { id: "frequency", type: "control" },
      { id: "Q", type: "control" },
    ]);
  });

  it("gives the LFO a control output", () => {
    expect(portsOf("lfo")).toEqual({ inputs: [], outputs: [{ id: "out", type: "control" }] });
  });

  it("gives the envelope a gate input and a control output", () => {
    expect(portsOf("envelope")).toEqual({
      inputs: [{ id: "gate", type: "trigger" }],
      outputs: [{ id: "out", type: "control" }],
    });
  });

  it("offers the envelope a straight, an exponential and a clap curve", () => {
    const curve = moduleRegistry.envelope.params.find((param) => param.id === "curve");

    expect(curve).toMatchObject({ options: ["linear", "exp", "clap"] });
  });

  it("lets the envelope spread the hands of a clap up to 50 milliseconds apart", () => {
    const spread = moduleRegistry.envelope.params.find((param) => param.id === "spread");

    expect(spread).toMatchObject({ kind: "number", min: 0.001, max: 0.05, default: 0.01, unit: "s" });
  });

  it("gives the keyboard a pitch and a gate output, its notes for the voices of a subpatch, and their velocity", () => {
    expect(portsOf("keyboard")).toEqual({
      inputs: [],
      outputs: [
        { id: "pitch", type: "control" },
        { id: "gate", type: "trigger" },
        { id: "notes", type: "notes" },
        { id: "velocity", type: "control" },
      ],
    });
  });

  it("gives the clip its notes for the voices of a subpatch, besides a pitch, a gate and a velocity", () => {
    expect(portsOf("clip").outputs).toEqual([
      { id: "pitch", type: "control" },
      { id: "gate", type: "trigger" },
      { id: "notes", type: "notes" },
      { id: "velocity", type: "control" },
    ]);
  });

  it("gives the Seq its notes for the voices of a subpatch, and a Chord within its scale, part of its patterns", () => {
    expect(portsOf("sequencer").outputs.at(-1)).toEqual({ id: "notes", type: "notes" });
    expect(moduleRegistry.sequencer.params.find(({ id }) => id === "chord")).toMatchObject({
      kind: "select",
      options: ["off", "5th", "triad", "7th"],
      default: "off",
    });
    expect(moduleRegistry.sequencer.patterns).toContain("chord");
  });

  it("gives the Drums a gate for each of its eight rows, named after them, and an accent, and takes gates to mark its steps", () => {
    expect(portsOf("drums")).toEqual({
      inputs: [{ id: "clock", type: "trigger" }],
      outputs: [
        { id: "kick", type: "trigger", label: "kick" },
        { id: "snare", type: "trigger", label: "snare" },
        { id: "clap", type: "trigger", label: "clap" },
        { id: "rim", type: "trigger", label: "rim" },
        { id: "lowtom", type: "trigger", label: "lo tom" },
        { id: "hightom", type: "trigger", label: "hi tom" },
        { id: "hat", type: "trigger", label: "hat" },
        { id: "open", type: "trigger", label: "open" },
        { id: "accent", type: "control" },
      ],
    });
    expect(moduleRegistry.drums.params.filter(({ kind }) => kind === "rhythm").map(({ label }) => label)).toEqual([
      "Kick",
      "Snare",
      "Clap",
      "Rim",
      "Lo tom",
      "Hi tom",
      "Hat",
      "Open",
      "Acc",
    ]);
    expect(moduleRegistry.drums.patterns).toEqual([
      "length", "kick", "snare", "clap", "rim", "lowtom", "hightom", "hat", "open", "accent",
    ]);
    expect(defaultParams("drums")).toMatchObject({ clap: "- - - - - - - - - - - - - - - -", lowtom: "- - - - - - - - - - - - - - - -" });
  });

  it("gives a subpatch a single voice by default, and up to eight", () => {
    expect(defaultParams("subpatch")).toEqual({ voices: 1 });
    expect(moduleRegistry.subpatch.params[0]).toMatchObject({ id: "voices", min: 1, max: 8, step: 1 });
  });

  it("gives the noise an audio output", () => {
    expect(portsOf("noise")).toEqual({ inputs: [], outputs: [{ id: "audio", type: "audio" }] });
  });

  it("gives the delay an audio input and output", () => {
    expect(portsOf("delay")).toEqual({
      inputs: [{ id: "audio", type: "audio" }],
      outputs: [{ id: "audio", type: "audio" }],
    });
  });

  it("gives the reverb an audio input and output, and the tone to modulate", () => {
    expect(portsOf("reverb")).toEqual({
      inputs: [
        { id: "audio", type: "audio" },
        { id: "tone", type: "control" },
      ],
      outputs: [{ id: "audio", type: "audio" }],
    });
  });
});

describe("sample and hold", () => {
  it("takes a control signal and a gate, and gives the value it holds", () => {
    expect(portsOf("sampleHold")).toEqual({
      inputs: [
        { id: "in", type: "control" },
        { id: "gate", type: "trigger" },
      ],
      outputs: [{ id: "out", type: "control" }],
    });
  });

  it("samples on its gate or on a division of the grid", () => {
    expect(moduleRegistry.sampleHold.params[0]).toMatchObject({
      id: "clock",
      kind: "select",
      options: ["gate", "1/4", "1/8", "1/16", "1/32"],
    });
  });
});

describe("audio input", () => {
  it("gives the sound it hears, and shows its level and what the microphone does", () => {
    expect(portsOf("audioInput")).toEqual({ inputs: [], outputs: [{ id: "audio", type: "audio" }] });
    expect(moduleRegistry.audioInput).toMatchObject({ category: "sources", display: "input" });
  });
});

describe("paramHidden", () => {
  const gate = moduleRegistry.sequencer.params.find(({ id }) => id === "gate")!;
  const shape = moduleRegistry.oscillator.params.find(({ id }) => id === "shape")!;
  const detune = moduleRegistry.oscillator.params.find(({ id }) => id === "detune")!;

  it("hides a param while another one has the value that hides it", () => {
    expect(paramHidden(gate, { division: "gate" })).toBe(true);
    expect(paramHidden(gate, { division: "1/16" })).toBe(false);
  });

  it("hides a number param only shown for another value, and never one without a condition", () => {
    const inletValue = moduleRegistry.inlet.params.find(({ id }) => id === "value")!;
    expect(paramHidden(inletValue, { signal: "audio" })).toBe(true);
    expect(paramHidden(inletValue, { signal: "control" })).toBe(false);
    expect(paramHidden(detune, {})).toBe(false);
    expect(paramHidden(shape, { waveform: "sine" })).toBe(false);
  });
});

describe("steps marked by gates", () => {
  it.each(["arpeggiator", "sequencer", "drums"] as const)("lets the %s take its steps from the gates into clock", (type) => {
    expect(portsOf(type).inputs).toContainEqual({ id: "clock", type: "trigger" });
    expect(moduleRegistry[type].params.find(({ id }) => id === "division")).toMatchObject({
      options: ["1/4", "1/8", "1/16", "1/32", "gate"],
    });
  });
});

describe("sampler", () => {
  it("plays on a gate, picks its sample by a control, is tuned by a pitch, and shows the sample it plays", () => {
    expect(portsOf("sampler")).toEqual({
      inputs: [
        { id: "gate", type: "trigger" },
        { id: "select", type: "control" },
        { id: "tune", type: "control" },
      ],
      outputs: [{ id: "audio", type: "audio" }],
    });
    expect(moduleRegistry.sampler).toMatchObject({ category: "sources", display: "sample" });
    expect(defaultParams("sampler")).toEqual({ sample: "", play: "one-shot", order: "select", select: 0, tune: 0, start: 0, end: 1 });
  });
});

describe("clock", () => {
  it("takes gates to divide, and gives one gate for each division", () => {
    expect(portsOf("clock").inputs).toEqual([{ id: "gate", type: "trigger" }]);
    expect(portsOf("clock").outputs.map(({ id, type, label, fed }) => [id, type, label, fed?.label])).toEqual([
      ["bar", "trigger", "bar", "÷16"],
      ["half", "trigger", "1/2", "÷8"],
      ["quarter", "trigger", "1/4", "÷4"],
      ["eighth", "trigger", "1/8", "÷3"],
      ["sixteenth", "trigger", "1/16", "÷2"],
      ["thirtysecond", "trigger", "1/32", "÷1"],
    ]);
    expect(portsOf("clock").outputs.every(({ fed }) => fed?.input === "gate")).toBe(true);
  });
});

describe("quantizer", () => {
  it("takes a pitch and gives it rounded", () => {
    expect(portsOf("quantizer")).toEqual({
      inputs: [{ id: "in", type: "control" }],
      outputs: [{ id: "out", type: "control" }],
    });
  });

  it("rounds to the scales and roots of the Seq", () => {
    const [root, scale] = moduleRegistry.quantizer.params;

    expect(root).toMatchObject({ id: "root", options: ROOTS });
    expect(scale).toMatchObject({ id: "scale", options: Object.keys(SCALES) });
  });
});

describe("math", () => {
  it("takes a signal into a and gives it combined with b, the knob and the cables into it", () => {
    expect(portsOf("math")).toEqual({
      inputs: [
        { id: "a", type: "control" },
        { id: "b", type: "control" },
      ],
      outputs: [{ id: "out", type: "control" }],
    });
  });

  it("offers its operations, and a b from -1 to 1 that its cables reach as they come", () => {
    const [operation, b] = moduleRegistry.math.params;

    expect(operation).toMatchObject({ id: "operation", kind: "select", options: MATH_OPERATIONS });
    expect(b).toMatchObject({ id: "b", kind: "number", min: -1, max: 1, modulationRange: 1 });
  });
});

describe("slew", () => {
  it("takes a control signal and gives it slid", () => {
    expect(portsOf("slew")).toEqual({
      inputs: [{ id: "in", type: "control" }],
      outputs: [{ id: "out", type: "control" }],
    });
  });

  it("rises and falls in seconds, from almost at once to slowly", () => {
    const [rise, fall] = moduleRegistry.slew.params;

    expect(rise).toMatchObject({ id: "rise", kind: "number", min: 0.001, max: 10, unit: "s", scale: "log" });
    expect(fall).toMatchObject({ id: "fall", kind: "number", min: 0.001, max: 10, unit: "s", scale: "log" });
  });
});

describe("envelope follower", () => {
  it("takes a sound and gives its level as a control signal", () => {
    expect(portsOf("envelopeFollower")).toEqual({
      inputs: [{ id: "audio", type: "audio" }],
      outputs: [{ id: "out", type: "control" }],
    });
  });

  it("follows in seconds, and raises the level of a quiet sound up to four times", () => {
    const [attack, release, gain] = moduleRegistry.envelopeFollower.params;

    expect(attack).toMatchObject({ id: "attack", kind: "number", unit: "s", scale: "log" });
    expect(release).toMatchObject({ id: "release", kind: "number", unit: "s", scale: "log" });
    expect(gain).toMatchObject({ id: "gain", kind: "number", min: 0, max: 4 });
  });
});

describe("compressor", () => {
  it("takes a sound and gives it compressed", () => {
    expect(portsOf("compressor")).toEqual({
      inputs: [{ id: "audio", type: "audio" }],
      outputs: [{ id: "audio", type: "audio" }],
    });
    expect(moduleRegistry.compressor.category).toBe("processing");
  });

  it("keeps its params within what a DynamicsCompressorNode takes", () => {
    const param = (id: string) => moduleRegistry.compressor.params.find((definition) => definition.id === id);

    expect(param("threshold")).toMatchObject({ min: -60, max: 0, unit: "dB" });
    expect(param("ratio")).toMatchObject({ min: 1, max: 20 });
    expect(param("knee")).toMatchObject({ min: 0, max: 40, unit: "dB" });
    expect(param("attack")).toMatchObject({ min: 0.001, max: 1, unit: "s" });
    expect(param("release")).toMatchObject({ min: 0.01, max: 1, unit: "s" });
    expect(param("makeup")).toMatchObject({ min: 0, max: 24, unit: "dB" });
  });
});

describe("chances", () => {
  it("gives a chance to each step of the rows of the Drums, and not to the rhythm of the Arp", () => {
    const rhythms = (type: "drums" | "arpeggiator") =>
      moduleRegistry[type].params.filter((param) => param.kind === "rhythm");

    expect(rhythms("drums")).toHaveLength(9);
    expect(rhythms("drums").every((param) => param.kind === "rhythm" && param.chance)).toBe(true);
    expect(rhythms("arpeggiator").every((param) => param.kind === "rhythm" && !param.chance)).toBe(true);
  });
});

describe("chorus, flanger and phaser", () => {
  it.each(["chorus", "flanger", "phaser"] as const)("gives the %s a sound in and out, in the processing modules", (type) => {
    expect(portsOf(type)).toEqual({
      inputs: [{ id: "audio", type: "audio" }],
      outputs: [{ id: "audio", type: "audio" }],
    });
    expect(moduleRegistry[type].category).toBe("processing");
  });

  it("builds their default params", () => {
    expect(defaultParams("chorus")).toEqual({ rate: 0.8, depth: 0.5, delay: 18, voices: 2, mix: 0.5 });
    expect(defaultParams("flanger")).toEqual({ rate: 0.3, depth: 0.7, delay: 2, feedback: 0.5, mix: 0.5 });
    expect(defaultParams("phaser")).toEqual({ rate: 0.5, depth: 0.7, frequency: 700, stages: 4, feedback: 0.3, mix: 0.5 });
  });

  it("keeps the delays within what the processors hold, and the stages in pairs", () => {
    const param = (type: "chorus" | "flanger" | "phaser", id: string) =>
      moduleRegistry[type].params.find((definition) => definition.id === id);

    expect(param("chorus", "delay")).toMatchObject({ min: 5, max: 40, unit: "ms" });
    expect(param("chorus", "voices")).toMatchObject({ min: 1, max: 4, step: 1 });
    expect(param("flanger", "delay")).toMatchObject({ min: 0.5, max: 10, unit: "ms" });
    expect(param("flanger", "feedback")).toMatchObject({ min: -0.95, max: 0.95 });
    expect(param("phaser", "frequency")).toMatchObject({ min: 100, max: 4000, unit: "Hz", scale: "log" });
    expect(param("phaser", "stages")).toMatchObject({ min: 2, max: 12, step: 2 });
    expect(param("phaser", "feedback")).toMatchObject({ min: -0.95, max: 0.95 });
  });
});

describe("distortion", () => {
  it("drives no further than its curve reaches", () => {
    expect(moduleRegistry.distortion.params.find(({ id }) => id === "drive")).toMatchObject({ max: DRIVE_RANGE });
  });

  it("gives the distortion an audio input and output, and the drive and the tone to modulate", () => {
    expect(portsOf("distortion")).toEqual({
      inputs: [
        { id: "audio", type: "audio" },
        { id: "drive", type: "control" },
        { id: "tone", type: "control" },
      ],
      outputs: [{ id: "audio", type: "audio" }],
    });
  });
});

describe("modulation ranges", () => {
  const range = (type: "oscillator" | "filter", param: string) =>
    modulatableParams(type).find(({ id }) => id === param)?.modulationRange;

  it("sweeps the oscillator frequency four octaves in cents", () => {
    expect(range("oscillator", "frequency")).toBe(4 * 1200);
  });

  it("sweeps the filter frequency five octaves in cents", () => {
    expect(range("filter", "frequency")).toBe(5 * 1200);
  });

  it("keeps the detune at one octave per unit", () => {
    expect(range("oscillator", "detune")).toBe(1200);
  });
});

describe("hints", () => {
  it("offers as sources of notes only modules with a notes output", () => {
    const titled = new Map(Object.values(moduleRegistry).map((definition) => [definition.title, definition]));

    for (const definition of Object.values(moduleRegistry)) {
      const sources = definition.hint?.match(/^Connect the notes of (.+?);/)?.[1];
      if (!sources) continue;
      for (const title of sources.split(/, | or /).map((source) => source.replace(/^an? /, ""))) {
        expect(titled.get(title)?.outputs.map((port) => port.type), `${definition.title}: ${title}`).toContain(
          "notes",
        );
      }
    }
  });
});
