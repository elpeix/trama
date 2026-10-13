import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeType, PatchConnection, PatchNode, Params } from "../patch/types";
import { defaultParams } from "../patch/registry";
import { FakeAudioContext } from "../test/fakeAudioContext";
import { FakeMidiAccess, FakeMidiInput, settle } from "../test/fakeMidi";
import { AudioEngine } from "./AudioEngine";
import { MidiInput } from "./MidiInput";
import { ClockModule } from "./modules/modulation/ClockModule";
import { DelayModule } from "./modules/processing/DelayModule";
import { EnvelopeModule } from "./modules/modulation/EnvelopeModule";
import { MixerModule } from "./modules/processing/MixerModule";
import { OscillatorModule } from "./modules/sources/OscillatorModule";
import { PianoModule } from "./modules/sources/PianoModule";
import { SamplerModule } from "./modules/sources/SamplerModule";
import { SequencerModule } from "./modules/notes/SequencerModule";
import { WindModule } from "./modules/sources/WindModule";
import { initialPatterns } from "../patch/patterns";

const node = (id: string, type: NodeType, params: Params = defaultParams(type)): PatchNode => ({
  id,
  type,
  position: { x: 0, y: 0 },
  params,
});

const link = (id: string, source: string, target: string): PatchConnection => ({
  id,
  source: { nodeId: source, port: "audio" },
  target: { nodeId: target, port: "audio" },
});

let context: FakeAudioContext;
let engine: AudioEngine;

beforeEach(() => {
  context = new FakeAudioContext();
  engine = new AudioEngine(context.asAudioContext());
});

describe("transport", () => {
  it("starts suspended", () => {
    expect(engine.state).toBe("suspended");
  });

  it("resumes the context on start", async () => {
    await engine.start();
    expect(context.state).toBe("running");
    expect(engine.state).toBe("running");
  });

  it("puts the transport back on the first beat on start", async () => {
    context.currentTime = 5;

    await engine.start();

    expect(engine.transport.beatAt(5)).toBe(0);
  });

  it("tells the beat only while running", async () => {
    expect(engine.getBeat()).toBeUndefined();

    await engine.start();
    context.currentTime = 0.75;

    expect(engine.getBeat()).toBe(1.5);
  });

  it("suspends the context on stop", async () => {
    await engine.start();
    await engine.stop();
    expect(context.state).toBe("suspended");
  });

  it("suspends a context the browser starts on its own", () => {
    context.changeState("running");

    expect(context.state).toBe("suspended");
  });

  it("suspends a context that is created running", () => {
    const running = new FakeAudioContext();
    running.state = "running";

    new AudioEngine(running.asAudioContext());

    expect(running.state).toBe("suspended");
  });

  it("lets the context run once started", async () => {
    await engine.start();
    context.changeState("interrupted");
    context.changeState("running");

    expect(context.state).toBe("running");
  });

  it("suspends the context again if the browser resumes it after a stop", async () => {
    await engine.start();
    await engine.stop();

    context.changeState("running");

    expect(context.state).toBe("suspended");
  });

  it("notifies state changes", async () => {
    const listener = vi.fn();
    engine.subscribe(listener);

    await engine.start();
    context.changeState("interrupted");

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("stops notifying after unsubscribing", async () => {
    const listener = vi.fn();
    const unsubscribe = engine.subscribe(listener);

    unsubscribe();
    await engine.start();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("createModule", () => {
  it("creates and starts an oscillator with its params", () => {
    engine.createModule(node("osc", "oscillator", { waveform: "sawtooth", frequency: 220, detune: 5 }));

    const [oscillator] = context.oscillators;
    expect(oscillator.type).toBe("sawtooth");
    expect(oscillator.frequency.value).toBe(220);
    expect(oscillator.detune.value).toBe(5);
    expect(oscillator.started).toBe(true);
  });

  it("creates a filter with its params", () => {
    engine.createModule(node("f", "filter", { type: "highpass", frequency: 800, Q: 4 }));

    const [filter] = context.filters;
    expect(filter.type).toBe("highpass");
    expect(filter.frequency.value).toBe(800);
    expect(filter.Q.value).toBe(4);
  });

  it("creates a gain with its params", () => {
    engine.createModule(node("g", "gain", { gain: 0.25 }));

    expect(context.gains[0].gain.value).toBe(0.25);
  });

  it("wires the output to the destination, through its fade", () => {
    engine.createModule(node("out", "output"));

    expect(context.gains[1].outputs.has(context.destination)).toBe(true);
  });

  it("sends the output to the recording too", () => {
    engine.createModule(node("out", "output"));

    const [recording] = context.mediaStreamDestinations;
    expect(context.gains[1].outputs.has(recording)).toBe(true);
    expect(engine.recordingStream).toBe(recording.stream);
  });

  it("refuses to create two modules with the same id", () => {
    engine.createModule(node("g", "gain"));

    expect(() => engine.createModule(node("g", "gain"))).toThrow();
  });
});

describe("output limiter", () => {
  it("tells when an output went quiet, and unmutes it", () => {
    engine.createModule(node("out", "output"));
    engine.createModule(node("g", "gain"));
    const [limiter] = context.workletNodes;

    expect(engine.isOutputMuted("out")).toBe(false);
    limiter.port.receive({ type: "muted" });
    expect(engine.isOutputMuted("out")).toBe(true);
    expect(engine.isOutputMuted("g")).toBe(false);
    expect(engine.isOutputMuted("nope")).toBe(false);

    engine.unmuteOutput("out");
    engine.unmuteOutput("g");
    engine.unmuteOutput("nope");

    expect(engine.isOutputMuted("out")).toBe(false);
    expect(limiter.port.messages).toEqual([{ type: "unmute" }]);
  });
});

describe("connect", () => {
  it("connects an oscillator to a filter", () => {
    engine.createModule(node("osc", "oscillator"));
    engine.createModule(node("f", "filter"));

    engine.connect(link("c", "osc", "f"));

    expect(context.oscillators[0].outputs.has(context.filters[0])).toBe(true);
  });

  it("builds the whole chain down to the destination", () => {
    engine.createModule(node("osc", "oscillator"));
    engine.createModule(node("f", "filter"));
    engine.createModule(node("g", "gain"));
    engine.createModule(node("out", "output"));

    engine.connect(link("c1", "osc", "f"));
    engine.connect(link("c2", "f", "g"));
    engine.connect(link("c3", "g", "out"));

    const [gain, output, fade] = context.gains;
    expect(context.filters[0].outputs.has(gain)).toBe(true);
    expect(gain.outputs.has(output)).toBe(true);
    expect(output.outputs.has(context.workletNodes[0])).toBe(true);
    expect(context.workletNodes[0].outputs.has(fade)).toBe(true);
    expect(fade.outputs.has(context.destination)).toBe(true);
  });

  it("throws when a module does not exist", () => {
    engine.createModule(node("osc", "oscillator"));

    expect(() => engine.connect(link("c", "osc", "missing"))).toThrow();
  });
});

describe("disconnect", () => {
  it("removes the audio connection", () => {
    engine.createModule(node("osc", "oscillator"));
    engine.createModule(node("f", "filter"));
    const connection = link("c", "osc", "f");
    engine.connect(connection);

    engine.disconnect(connection.id);

    expect(context.oscillators[0].outputs.size).toBe(0);
  });

  it("keeps the other connections of the same source", () => {
    engine.createModule(node("osc", "oscillator"));
    engine.createModule(node("f", "filter"));
    engine.createModule(node("g", "gain"));
    engine.connect(link("c1", "osc", "f"));
    engine.connect(link("c2", "osc", "g"));

    engine.disconnect("c1");

    expect([...context.oscillators[0].outputs]).toEqual([context.gains[0]]);
  });

  it("ignores unknown connections", () => {
    expect(() => engine.disconnect("nope")).not.toThrow();
  });
});

describe("updateParameter", () => {
  it("glides numeric params from the current time", () => {
    engine.createModule(node("f", "filter"));
    context.currentTime = 3;

    engine.updateParameter("f", "frequency", 1800);

    expect(context.filters[0].frequency.events).toEqual([{ type: "setTarget", value: 1800, time: 3 }]);
  });

  it("sets the oscillator waveform", () => {
    engine.createModule(node("osc", "oscillator"));

    engine.updateParameter("osc", "waveform", "square");

    expect(context.oscillators[0].type).toBe("square");
  });

  it("sets the filter type", () => {
    engine.createModule(node("f", "filter"));

    engine.updateParameter("f", "type", "bandpass");

    expect(context.filters[0].type).toBe("bandpass");
  });

  it("updates the gain", () => {
    engine.createModule(node("g", "gain"));

    engine.updateParameter("g", "gain", 0.8);

    expect(context.gains[0].gain.value).toBe(0.8);
  });

  it("throws on an unknown parameter", () => {
    engine.createModule(node("g", "gain"));

    expect(() => engine.updateParameter("g", "nope", 1)).toThrow();
  });

  it("ignores unknown modules", () => {
    expect(() => engine.updateParameter("nope", "gain", 1)).not.toThrow();
  });
});

describe("removeModule", () => {
  beforeEach(() => {
    engine.createModule(node("osc", "oscillator"));
    engine.createModule(node("f", "filter"));
    engine.createModule(node("out", "output"));
    engine.connect(link("c1", "osc", "f"));
    engine.connect(link("c2", "f", "out"));
  });

  it("disconnects incoming and outgoing connections", () => {
    engine.removeModule("f");

    expect(context.oscillators[0].outputs.size).toBe(0);
    expect(context.filters[0].outputs.size).toBe(0);
  });

  it("forgets the connections it removed", () => {
    engine.removeModule("f");

    expect(() => engine.disconnect("c1")).not.toThrow();
  });

  it("stops a removed oscillator", () => {
    engine.removeModule("osc");

    expect(context.oscillators[0].stopped).toBe(true);
  });

  it("detaches a removed output from the destination", () => {
    engine.removeModule("out");

    expect(context.gains[0].outputs.size).toBe(0);
  });

  it("allows reusing the id afterwards", () => {
    engine.removeModule("f");

    expect(() => engine.createModule(node("f", "filter"))).not.toThrow();
  });

  it("ignores unknown modules", () => {
    expect(() => engine.removeModule("nope")).not.toThrow();
  });
});

const wire = (
  id: string,
  source: string,
  sourcePort: string,
  target: string,
  targetPort: string,
): PatchConnection => ({
  id,
  source: { nodeId: source, port: sourcePort },
  target: { nodeId: target, port: targetPort },
});

describe("control connections", () => {
  beforeEach(() => {
    engine.createModule(node("lfo", "lfo"));
    engine.createModule(node("f", "filter"));
  });

  // The LFO feeds its own output node, created first; the scaler of the connection comes after it.
  const lfoOutput = () => context.gains[0];
  const scaler = () => context.gains[1];

  it("modulates the filter frequency in cents through its detune", () => {
    engine.connect(wire("c", "lfo", "out", "f", "frequency"));

    expect(lfoOutput().outputs.has(scaler())).toBe(true);
    expect(scaler().gain.value).toBe(6000);
    expect(scaler().outputs.has(context.filters[0].detune)).toBe(true);
  });

  it("modulates a linear param in its own units", () => {
    engine.connect(wire("c", "lfo", "out", "f", "Q"));

    expect(scaler().gain.value).toBe(10);
    expect(scaler().outputs.has(context.filters[0].Q)).toBe(true);
  });

  it("scales the modulation by the amount of the connection", () => {
    engine.connect({ ...wire("c", "lfo", "out", "f", "frequency"), amount: -0.5 });

    expect(scaler().gain.value).toBe(-3000);
  });

  it("glides to a new amount", () => {
    engine.connect(wire("c", "lfo", "out", "f", "frequency"));
    context.currentTime = 2;

    engine.setConnectionAmount("c", 0.2);

    expect(scaler().gain.events).toEqual([{ type: "setTarget", value: 1200, time: 2 }]);
  });

  it("ignores amounts for unknown connections", () => {
    expect(() => engine.setConnectionAmount("nope", 0.5)).not.toThrow();
  });

  it("ignores amounts for audio connections", () => {
    engine.createModule(node("osc", "oscillator"));
    engine.connect(wire("a", "osc", "audio", "f", "audio"));

    expect(() => engine.setConnectionAmount("a", 0.5)).not.toThrow();
  });

  it("gives a mixer channel the level, mute and solo of its cable, and follows their changes", () => {
    engine.createModule(node("osc", "oscillator"));
    engine.createModule(node("mix", "mixer"));
    const connection = { ...wire("a", "osc", "audio", "mix", "audio"), amount: 0.5, mute: true };
    const setChannel = vi.spyOn(MixerModule.prototype, "setChannel");

    engine.connect(connection);
    expect(setChannel).toHaveBeenLastCalledWith("a", { level: 0.5, pan: 0, mute: true, solo: false }, 0);

    engine.sync({
      tempo: 120,
      nodes: [node("osc", "oscillator"), node("mix", "mixer")],
      connections: [{ ...connection, mute: undefined, solo: true }],
    });
    expect(setChannel).toHaveBeenLastCalledWith("a", { level: 0.5, pan: 0, mute: false, solo: true }, 0);

    engine.sync({
      tempo: 120,
      nodes: [node("osc", "oscillator"), node("mix", "mixer")],
      connections: [{ ...connection, mute: undefined, solo: true, pan: 0.6 }],
    });
    expect(setChannel).toHaveBeenLastCalledWith("a", { level: 0.5, pan: 0.6, mute: false, solo: true }, 0);

    engine.setConnectionAmount("a", 0.2);
    expect(setChannel).toHaveBeenLastCalledWith("a", { level: 0.2, pan: 0.6, mute: false, solo: true }, 0);
  });

  it("removes the scaler on disconnect", () => {
    engine.connect(wire("c", "lfo", "out", "f", "frequency"));

    engine.disconnect("c");

    expect(lfoOutput().outputs.size).toBe(0);
    expect(scaler().outputs.size).toBe(0);
  });

  it("sends the keyboard pitch to the detune in cents", () => {
    engine.createModule(node("keys", "keyboard"));
    engine.createModule(node("osc", "oscillator"));

    engine.connect(wire("c", "keys", "pitch", "osc", "detune"));

    const pitchScaler = context.gains.at(-1)!;
    expect(context.constantSources[0].outputs.has(pitchScaler)).toBe(true);
    expect(pitchScaler.gain.value).toBe(1200);
    expect(pitchScaler.outputs.has(context.oscillators[1].detune)).toBe(true);
  });

  it("throws on a param without modulation", () => {
    expect(() => engine.connect(wire("c", "lfo", "out", "f", "type"))).toThrow();
  });

  describe("modulation", () => {
    const probe = () => context.analysers.at(-1)!;

    it("tells what the cables add to a param, only while the sound runs", async () => {
      engine.connect(wire("c", "lfo", "out", "f", "frequency"));
      expect(scaler().outputs.has(probe())).toBe(true);
      probe().samples = Float32Array.from([100, -250]);

      expect(engine.getModulation("f", "frequency")).toBeUndefined();
      await engine.start();
      expect(engine.getModulation("f", "frequency")).toBe(-250);
    });

    it("sums every cable to the same param in one probe", () => {
      engine.createModule(node("lfo2", "lfo"));
      engine.connect(wire("c", "lfo", "out", "f", "Q"));
      engine.connect(wire("d", "lfo2", "out", "f", "Q"));

      const scalers = context.gains.filter((gain) => gain.outputs.has(context.filters[0].Q));
      expect(scalers).toHaveLength(2);
      expect(scalers.every((gain) => gain.outputs.has(probe()))).toBe(true);
    });

    it("tells nothing for a param without cables, or of a removed module", async () => {
      engine.connect(wire("c", "lfo", "out", "f", "frequency"));
      await engine.start();

      expect(engine.getModulation("f", "Q")).toBeUndefined();
      engine.removeModule("f");
      expect(engine.getModulation("f", "frequency")).toBeUndefined();
    });
  });
});

describe("scope", () => {
  beforeEach(() => {
    engine.createModule(node("scope", "scope"));
    engine.createModule(node("osc", "oscillator"));
    engine.createModule(node("lfo", "lfo"));
  });

  const audioTrace = () => link("a", "osc", "scope");
  const controlTrace = (amount?: number) => ({
    ...wire("c", "lfo", "out", "scope", "control"),
    ...(amount !== undefined && { amount }),
  });

  it("gives every connection its own stereo probe", () => {
    engine.connect(audioTrace());
    engine.connect(controlTrace());

    const [audio, control] = context.gains.filter((gain) => gain.channelCountMode === "explicit");
    expect(engine.getProbe("scope", "a")).toEqual({ left: context.analysers[0], right: context.analysers[1] });
    expect(engine.getProbe("scope", "c")).toEqual({ left: context.analysers[2], right: context.analysers[3] });
    expect(context.oscillators[0].outputs.has(audio)).toBe(true);
    expect(context.gains.some((gain) => gain.outputs.has(control))).toBe(true);
  });

  it("scales a control signal only by the amount", () => {
    engine.connect(controlTrace(0.5));

    const scaler = context.gains.at(-1)!;
    const lfoOutput = context.gains[0];
    expect(lfoOutput.outputs.has(scaler)).toBe(true);
    expect(scaler.gain.value).toBe(0.5);

    context.currentTime = 1;
    engine.setConnectionAmount("c", -1);
    expect(scaler.gain.events).toEqual([{ type: "setTarget", value: -1, time: 1 }]);
  });

  it("drops the probe on disconnect", () => {
    engine.connect(audioTrace());
    engine.connect(controlTrace());

    engine.disconnect("a");
    engine.disconnect("c");

    expect(context.oscillators[0].outputs.size).toBe(0);
    expect(engine.getProbe("scope", "a")).toBeUndefined();
    expect(engine.getProbe("scope", "c")).toBeUndefined();
  });

  it("disconnects its sources on remove", () => {
    engine.connect(audioTrace());

    engine.removeModule("scope");

    expect(context.oscillators[0].outputs.size).toBe(0);
    expect(engine.getProbe("scope", "a")).toBeUndefined();
  });

  it("has no probes on other modules", () => {
    expect(engine.getProbe("osc", "a")).toBeUndefined();
    expect(engine.getProbe("nope", "a")).toBeUndefined();
  });

  it("exposes the meter of the output", () => {
    engine.createModule(node("out", "output"));

    expect(engine.getAnalyser("out")).toEqual({ left: context.analysers.at(-2), right: context.analysers.at(-1) });
    expect(engine.getAnalyser("scope")).toBeUndefined();
  });
});

describe("audio input", () => {
  it("tells what the microphone of an audio input is doing, and nothing for other modules", () => {
    vi.stubGlobal("navigator", { mediaDevices: undefined });
    engine.createModule(node("mic", "audioInput"));
    engine.createModule(node("gain", "gain"));

    expect(engine.getInputStatus("mic")).toBe("unavailable");
    expect(engine.getInputStatus("gain")).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

describe("voices of a subpatch", () => {
  it("tells how many voices a subpatch has and the most its notes needed at once, and nothing for other modules", () => {
    for (const voice of [1, 2]) {
      const prefix = voice === 1 ? "synth/" : `synth#${voice}/`;
      engine.createModule(node(`${prefix}inlet-1`, "inlet", { signal: "notes", voice, voices: 2, release: 2, group: prefix }));
    }
    engine.createModule(node("gain", "gain"));
    engine.createModule(node("keys", "keyboard"));
    engine.connect(wire("a", "keys", "notes", "synth/inlet-1", "in"));
    engine.connect(wire("b", "keys", "notes", "synth#2/inlet-1", "in"));
    [60, 64, 67].forEach((note) => engine.noteOn(note));

    expect(engine.getVoiceUsage("synth")).toEqual({ voices: 2, needed: 3 });
    expect(engine.getVoiceUsage("gain")).toBeUndefined();
  });
});

describe("sampler", () => {
  it("tells what sample a sampler plays, and nothing for other modules", () => {
    engine.createModule(node("sampler", "sampler"));
    engine.createModule(node("gain", "gain"));

    expect(engine.getSample("sampler")).toEqual({ samples: [], playing: 0 });
    expect(engine.getSample("gain")).toBeUndefined();
  });
});

describe("trigger connections", () => {
  beforeEach(() => {
    engine.createModule(node("keys", "keyboard"));
    engine.createModule(node("env", "envelope", { ...defaultParams("envelope"), attack: 0.1 }));
    context.currentTime = 5;
  });

  // The keyboard makes two before it: its pitch and its velocity.
  const envelopeEvents = () => context.constantSources[2].offset.events;

  it("opens the envelope when a note is played", () => {
    engine.connect(wire("c", "keys", "gate", "env", "gate"));

    engine.noteOn(60);

    expect(envelopeEvents()).toContainEqual({ type: "linearRamp", value: 1, time: 5.1 });
  });

  it("releases the envelope when the note is released", () => {
    engine.connect(wire("c", "keys", "gate", "env", "gate"));
    engine.noteOn(60);

    engine.noteOff(60);

    expect(envelopeEvents().at(-1)).toEqual({ type: "linearRamp", value: 0, time: 5.5 });
  });

  it("releases everything at once", () => {
    engine.connect(wire("c", "keys", "gate", "env", "gate"));
    engine.noteOn(60);
    engine.noteOn(62);

    engine.allNotesOff();

    expect(envelopeEvents().at(-1)).toEqual({ type: "linearRamp", value: 0, time: 5.5 });
  });

  it("opens a trigger input of its own for each cable when the module keeps them apart, and closes it", () => {
    const close = vi.spyOn(ClockModule.prototype, "closeTrigger");
    engine.createModule(node("clock", "clock"));
    engine.connect(wire("in", "keys", "gate", "clock", "gate"));
    engine.connect(wire("out", "clock", "bar", "env", "gate"));

    engine.noteOn(60);
    expect(envelopeEvents()).toContainEqual({ type: "linearRamp", value: 1, time: 5.1 });

    engine.disconnect("in");
    expect(close).toHaveBeenCalledWith("in");
    engine.removeModule("clock");
    close.mockRestore();
  });

  it("stops triggering after disconnect", () => {
    engine.connect(wire("c", "keys", "gate", "env", "gate"));
    engine.disconnect("c");

    engine.noteOn(60);

    expect(envelopeEvents()).toEqual([]);
  });

  it("stops triggering a removed envelope", () => {
    engine.connect(wire("c", "keys", "gate", "env", "gate"));
    engine.removeModule("env");

    engine.noteOn(60);

    expect(envelopeEvents()).toEqual([]);
  });

  it("plays notes without any keyboard", () => {
    engine.removeModule("keys");

    expect(() => engine.noteOn(60)).not.toThrow();
  });

  it("transposes a sequencer that follows the keys, and tells by how much", () => {
    engine.createModule(node("seq", "sequencer", { ...defaultParams("sequencer"), keys: "transpose" }));

    engine.noteOn(65);
    engine.noteOff(65);

    expect(engine.getKeyTranspose("seq")).toBe(5);
    expect(engine.getKeyTranspose("keys")).toBeUndefined();
  });
});

describe("sync", () => {
  const osc = node("osc", "oscillator");
  const out = node("out", "output");
  const lfo = node("lfo", "lfo");
  const chain = link("c1", "osc", "out");
  const vibrato: PatchConnection = { ...wire("c2", "lfo", "out", "osc", "detune"), amount: 0.5 };

  it("builds the modules and connections of a patch", () => {
    engine.sync({ tempo: 120, nodes: [osc, out], connections: [chain] });

    const [oscillator] = context.oscillators;
    expect(oscillator.outputs.has(context.gains[0])).toBe(true);
    expect(context.gains[0].outputs.has(context.workletNodes[0])).toBe(true);
    expect(context.workletNodes[0].outputs.has(context.gains[1])).toBe(true);
    expect(context.gains[1].outputs.has(context.destination)).toBe(true);
  });

  it("does nothing when the patch has not changed", () => {
    engine.sync({ tempo: 120, nodes: [osc, out, lfo], connections: [chain, vibrato] });
    const created = context.gains.length + context.oscillators.length;

    engine.sync({ tempo: 120, nodes: [osc, out, lfo], connections: [chain, vibrato] });

    expect(context.gains.length + context.oscillators.length).toBe(created);
    expect(context.oscillators[0].frequency.events).toEqual([]);
  });

  it("removes modules that are gone, with their connections", () => {
    engine.sync({ tempo: 120, nodes: [osc, out], connections: [chain] });

    engine.sync({ tempo: 120, nodes: [out], connections: [] });

    expect(context.oscillators[0].stopped).toBe(true);
    expect(context.oscillators[0].outputs.size).toBe(0);
  });

  it("disconnects connections that are gone", () => {
    engine.sync({ tempo: 120, nodes: [osc, out], connections: [chain] });

    engine.sync({ tempo: 120, nodes: [osc, out], connections: [] });

    expect(context.oscillators[0].outputs.size).toBe(0);
    expect(context.oscillators[0].stopped).toBe(false);
  });

  it("updates only the params that changed", () => {
    engine.sync({ tempo: 120, nodes: [osc], connections: [] });

    engine.sync({ tempo: 120, nodes: [{ ...osc, params: { ...osc.params, detune: 50 } }], connections: [] });

    expect(context.oscillators[0].detune.events).toEqual([{ type: "setTarget", value: 50, time: 0 }]);
    expect(context.oscillators[0].frequency.events).toEqual([]);
  });

  it("updates the amount of a connection", () => {
    engine.sync({ tempo: 120, nodes: [osc, lfo], connections: [vibrato] });

    engine.sync({ tempo: 120, nodes: [osc, lfo], connections: [{ ...vibrato, amount: -1 }] });

    expect(context.gains.at(-1)!.gain.events).toEqual([{ type: "setTarget", value: -1200, time: 0 }]);
  });

  it("sets the tempo of the transport", () => {
    engine.sync({ tempo: 90, nodes: [], connections: [] });

    expect(engine.transport.tempo).toBe(90);
  });

  it("sets the swing of the transport, straight when the patch has none", () => {
    engine.sync({ tempo: 90, swing: 66, nodes: [], connections: [] });
    expect(engine.transport.swing).toBe(66);

    engine.sync({ tempo: 90, nodes: [], connections: [] });
    expect(engine.transport.swing).toBe(50);
  });

  it("sets what the swing of the transport holds back, the sixteenths when the patch does not say", () => {
    engine.sync({ tempo: 90, swing: 66, swingGrid: "1/8", nodes: [], connections: [] });
    expect(engine.transport.swingGrid).toBe("1/8");

    engine.sync({ tempo: 90, swing: 66, nodes: [], connections: [] });
    expect(engine.transport.swingGrid).toBe("1/16");
  });

  it("sets the meter of the transport, four beats when the patch has none", () => {
    engine.sync({ tempo: 90, meter: [3, 2], nodes: [], connections: [] });
    expect(engine.transport.meter).toEqual([3, 2]);

    engine.sync({ tempo: 90, nodes: [], connections: [] });
    expect(engine.transport.meter).toEqual([4]);
  });

  it("recovers on the next sync after a failed one", () => {
    const broken = wire("bad", "osc", "audio", "out", "nope");
    expect(() => engine.sync({ tempo: 120, nodes: [osc, out], connections: [broken] })).toThrow();

    engine.sync({ tempo: 120, nodes: [osc, out], connections: [chain] });

    expect(context.oscillators).toHaveLength(1);
    expect(context.oscillators[0].outputs.has(context.gains[0])).toBe(true);
  });
});

describe("patterns", () => {
  const sequencer = (steps?: string): PatchNode => {
    const params = defaultParams("sequencer");
    const patterns = initialPatterns("sequencer", params)!;
    return { ...node("seq", "sequencer", params), patterns: steps ? { ...patterns, A2: { ...patterns.A2, steps } } : patterns };
  };

  it("passes the changes of a pattern on to its module", () => {
    const setPatternParameter = vi.spyOn(SequencerModule.prototype, "setPatternParameter");
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [] });
    const steps = Array(16).fill("D4").join(" ");

    engine.sync({ tempo: 120, nodes: [sequencer(steps)], connections: [] });

    expect(setPatternParameter).toHaveBeenCalledTimes(1);
    expect(setPatternParameter).toHaveBeenCalledWith("A2", "steps", steps);
  });

  it("launches a pattern and tells which one plays and which one waits", () => {
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [] });

    engine.launchPattern("seq", "A3");

    expect(engine.getPattern("seq")).toEqual({ playing: "A1", queued: "A3" });
    expect(engine.getPattern("missing")).toBeUndefined();
    expect(() => engine.launchPattern("missing", "A2")).not.toThrow();
  });
});

describe("while stopped", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    return () => {
      void engine.stop();
      vi.useRealTimers();
    };
  });

  const advance = (seconds: number) => {
    const end = Math.round((context.currentTime + seconds) * 1000);
    for (let ms = Math.round(context.currentTime * 1000) + 5; ms <= end; ms += 5) {
      context.currentTime = ms / 1000;
      vi.advanceTimersByTime(5);
    }
  };

  it("plays no step ahead of the start, so that what the song launches first is what sounds first", async () => {
    engine.sync({ tempo: 120, nodes: [node("seq", "sequencer")], connections: [] });
    advance(0.5);
    expect(engine.getPosition("seq")).toBeUndefined();

    await engine.start();
    advance(0.1);

    expect(engine.getPosition("seq")).toBe(0);
  });
});

describe("sound while stopped", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    engine.sync({ tempo: 120, nodes: [node("keys", "keyboard"), node("roll", "clip")], connections: [] });
    return () => {
      vi.useRealTimers();
    };
  });

  it("stays quiet on a note until it is chosen", () => {
    engine.noteOn(60);

    expect(context.state).toBe("suspended");
  });

  it("sounds a note while stopped, with the transport still stopped", () => {
    engine.setSoundWhileStopped(true);

    engine.noteOn(60);

    expect(context.state).toBe("running");
    expect(engine.state).toBe("suspended");
    expect(engine.transport.paused).toBe(true);
    expect(engine.getBeat()).toBeUndefined();
  });

  it("sounds a note a clip previews while stopped, as the piano roll hears it whether or not the keys may sound", () => {
    engine.previewNote("roll", 60);

    expect(context.state).toBe("running");
    expect(engine.state).toBe("suspended");
    expect(engine.transport.paused).toBe(true);
  });

  it("rests a while after a preview stops, with the keys kept quiet", () => {
    engine.previewNote("roll", 60);

    engine.stopPreview("roll");
    vi.advanceTimersByTime(10_000);

    expect(context.state).toBe("suspended");
  });

  it("rests a while after the last note is let go, for its tail", () => {
    engine.setSoundWhileStopped(true);
    engine.noteOn(60);
    engine.noteOn(64);
    engine.noteOff(60);
    vi.advanceTimersByTime(10_000);
    expect(context.state).toBe("running");

    engine.noteOff(64);
    vi.advanceTimersByTime(4_900);
    expect(context.state).toBe("running");
    vi.advanceTimersByTime(200);

    expect(context.state).toBe("suspended");
  });

  it("rests too after all the notes are let go at once, or a preview stops", () => {
    engine.setSoundWhileStopped(true);
    engine.noteOn(60);
    engine.previewNote("roll", 62);

    engine.allNotesOff();
    vi.advanceTimersByTime(10_000);
    expect(context.state).toBe("running");
    engine.stopPreview("roll");
    vi.advanceTimersByTime(10_000);

    expect(context.state).toBe("suspended");
  });

  it("keeps sounding when a note comes before the rest", () => {
    engine.setSoundWhileStopped(true);
    engine.noteOn(60);
    engine.noteOff(60);
    vi.advanceTimersByTime(3_000);

    engine.noteOn(62);
    vi.advanceTimersByTime(10_000);

    expect(context.state).toBe("running");
  });

  it("plays from a note sounding, and tells it plays", async () => {
    engine.setSoundWhileStopped(true);
    engine.noteOn(60);
    const listener = vi.fn();
    engine.subscribe(listener);

    await engine.start();
    vi.advanceTimersByTime(10_000);

    expect(engine.state).toBe("running");
    expect(engine.transport.paused).toBe(false);
    expect(listener).toHaveBeenCalled();
  });

  it("stops at once, even with a note held", async () => {
    engine.setSoundWhileStopped(true);
    engine.noteOn(60);
    await engine.start();

    await engine.stop();
    vi.advanceTimersByTime(10_000);

    expect(context.state).toBe("suspended");
  });

  it("goes quiet at once when it is turned off", () => {
    engine.setSoundWhileStopped(true);
    engine.noteOn(60);

    engine.setSoundWhileStopped(false);

    expect(context.state).toBe("suspended");
  });

  it("makes afresh the modules that ring on, so that the tail the stop froze does not sound", async () => {
    engine.setSoundWhileStopped(true);
    engine.sync({ tempo: 120, nodes: [node("keys", "keyboard"), node("echo", "delay")], connections: [] });
    await engine.start();
    await engine.stop();
    const disposed = vi.spyOn(DelayModule.prototype, "dispose");

    engine.noteOn(60);

    expect(disposed).toHaveBeenCalledTimes(1);
  });
});

describe("starting again", () => {
  const patch = () => ({
    tempo: 120,
    nodes: [node("osc", "oscillator"), node("echo", "delay"), node("out", "output")],
    connections: [link("a", "osc", "echo"), link("b", "echo", "out")],
  });

  it("makes the modules that ring on afresh, so that no tail of before sounds, and leaves the others", async () => {
    engine.sync(patch());
    const delayDisposed = vi.spyOn(DelayModule.prototype, "dispose");
    const oscillatorDisposed = vi.spyOn(OscillatorModule.prototype, "dispose");
    await engine.start();
    expect(delayDisposed).not.toHaveBeenCalled();

    await engine.stop();
    await engine.start();

    expect(delayDisposed).toHaveBeenCalledTimes(1);
    expect(oscillatorDisposed).not.toHaveBeenCalled();
    const delays = context.delays;
    const fresh = delays.at(-1)!;
    expect(context.oscillators[0].outputs.size).toBeGreaterThan(0);
    expect([...context.gains, ...delays].some((audio) => audio.outputs.has(fresh) || audio === fresh)).toBe(true);
  });
});

describe("starting again with a note held", () => {
  it("closes the envelopes, so that a note held when the sound stopped does not ring on", async () => {
    engine.sync({ tempo: 120, nodes: [node("adsr", "envelope")], connections: [] });
    await engine.start();
    const disposed = vi.spyOn(EnvelopeModule.prototype, "dispose");

    await engine.stop();
    await engine.start();

    expect(disposed).toHaveBeenCalledTimes(1);
  });
});

describe("starting again with a piano ringing", () => {
  it("makes the piano afresh, so that its strings do not ring on from before the stop", async () => {
    engine.sync({ tempo: 120, nodes: [node("keys", "piano"), node("out", "output")], connections: [link("a", "keys", "out")] });
    await engine.start();
    const disposed = vi.spyOn(PianoModule.prototype, "dispose");

    await engine.stop();
    await engine.start();

    expect(disposed).toHaveBeenCalledTimes(1);
    const piano = context.workletNodes.filter(({ name }) => name === "piano").at(-1)!;
    expect(piano.outputs.size).toBe(1);
  });

  it("makes afresh a piano inside a subpatch too", async () => {
    engine.sync({ tempo: 120, nodes: [node("sub/keys", "piano")], connections: [] });
    await engine.start();
    const disposed = vi.spyOn(PianoModule.prototype, "dispose");

    await engine.stop();
    await engine.start();

    expect(disposed).toHaveBeenCalledTimes(1);
  });
});

describe("starting again with a wind blowing", () => {
  it("makes the wind afresh, so that a note held before the stop does not sound on", async () => {
    engine.sync({ tempo: 120, nodes: [node("reed", "wind"), node("out", "output")], connections: [link("a", "reed", "out")] });
    await engine.start();
    const disposed = vi.spyOn(WindModule.prototype, "dispose");

    await engine.stop();
    await engine.start();

    expect(disposed).toHaveBeenCalledTimes(1);
    const wind = context.workletNodes.filter(({ name }) => name === "wind").at(-1)!;
    expect(wind.outputs.size).toBe(1);
  });
});

describe("starting again with a sampler playing", () => {
  it("hushes the modules that can, without making them again", async () => {
    engine.sync({ tempo: 120, nodes: [node("smp", "sampler")], connections: [] });
    await engine.start();
    const hush = vi.spyOn(SamplerModule.prototype, "hush");
    const disposed = vi.spyOn(SamplerModule.prototype, "dispose");

    await engine.stop();
    await engine.start();

    expect(hush).toHaveBeenCalledTimes(1);
    expect(disposed).not.toHaveBeenCalled();
  });
});

describe("reset", () => {
  const sequencer = (): PatchNode => {
    const params = defaultParams("sequencer");
    return { ...node("seq", "sequencer", params), patterns: initialPatterns("sequencer", params)! };
  };

  it("stops the sound and lets go of every module, so that a patch loaded after starts afresh", async () => {
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [] });
    await engine.start();
    engine.launchPattern("seq", "A3");
    const dispose = vi.spyOn(SequencerModule.prototype, "dispose");

    const resetting = engine.reset();
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [] });
    await resetting;

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(engine.state).toBe("suspended");
    expect(engine.getPattern("seq")).toEqual({ playing: "A1" });
  });
});

describe("song", () => {
  const sequencer = (id = "seq"): PatchNode => {
    const params = defaultParams("sequencer");
    return { ...node(id, "sequencer", params), patterns: initialPatterns("sequencer", params)! };
  };
  const song = { bars: 2, rows: { seq: "A2 A3" } };

  const advance = (seconds: number) => {
    const end = Math.round((context.currentTime + seconds) * 1000);
    for (let ms = Math.round(context.currentTime * 1000) + 5; ms <= end; ms += 5) {
      context.currentTime = ms / 1000;
      vi.advanceTimersByTime(5);
    }
  };

  beforeEach(() => {
    vi.useFakeTimers();
    return () => {
      void engine.stop();
      vi.useRealTimers();
    };
  });

  it("launches a pattern for when the mode given says", () => {
    const launchPattern = vi.spyOn(SequencerModule.prototype, "launchPattern");
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [] });

    engine.launchPattern("seq", "A2", "bar");

    expect(launchPattern).toHaveBeenCalledWith("A2", "bar", undefined);
  });

  it("launches a pattern for a place in it, in beats", () => {
    const launchPattern = vi.spyOn(SequencerModule.prototype, "launchPattern");
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [] });

    engine.launchPattern("seq", "A2", "bar", 8);

    expect(launchPattern).toHaveBeenCalledWith("A2", "bar", 8);
  });

  it("plays the song from the bar given when started in song mode", async () => {
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [], song });
    engine.setSongStart(1);

    await engine.start();

    expect(engine.getPattern("seq")).toEqual({ playing: "A1", queued: "A3" });
    expect(engine.getSongBar()).toBe(1);
  });

  it("stops a node on a dot of the song, and plays it again on the next start", async () => {
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [], song: { bars: 2, rows: { seq: "A1 ." } } });
    engine.setSongStart(0);
    await engine.start();
    advance(2.5);
    expect(engine.getPattern("seq")).toEqual({ playing: "A1", stopped: true });

    engine.setSongStart(undefined);
    await engine.stop();
    await engine.start();
    advance(0.3);
    expect(engine.getPattern("seq")).toEqual({ playing: "A1" });
  });

  it("plays no song in pattern mode", async () => {
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [], song });

    await engine.start();

    expect(engine.getPattern("seq")).toEqual({ playing: "A1" });
    expect(engine.getSongBar()).toBeUndefined();
  });

  it("launches the patterns of the nodes inside subpatches by their path", async () => {
    engine.sync({ tempo: 120, nodes: [sequencer("sub/seq")], connections: [], song: { bars: 1, rows: { "sub/seq": "A4" } } });
    engine.setSongStart(0);

    await engine.start();

    expect(engine.getPattern("sub/seq")).toEqual({ playing: "A1", queued: "A4" });
  });

  it("plays the changes made to the song while it plays", async () => {
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [], song });
    engine.setSongStart(0);
    await engine.start();

    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [], song: { bars: 2, rows: { seq: "A2 A4" } } });
    advance(1);

    expect(engine.getPattern("seq")?.queued).toBe("A4");
  });

  it("stops the sound when the song ends", async () => {
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [], song });
    engine.setSongStart(1);
    await engine.start();

    advance(2.1);
    await Promise.resolve();

    expect(engine.state).toBe("suspended");
    expect(engine.getSongBar()).toBeUndefined();
  });

  it("stops the song on stop, and when song mode goes off", async () => {
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [], song });
    engine.setSongStart(0);
    await engine.start();
    await engine.stop();
    expect(engine.getSongBar()).toBeUndefined();

    await engine.start();
    engine.setSongStart(undefined);
    expect(engine.getSongBar()).toBeUndefined();
  });

  it("fades every output at the end of the song, and starts whole again", async () => {
    engine.sync({ tempo: 120, nodes: [sequencer(), node("out", "output")], connections: [], song: { ...song, fade: 1 } });
    const fade = context.gains.find((gain) => gain.outputs.has(context.destination))!;
    engine.setSongStart(0);
    await engine.start();

    advance(3.9);
    expect(fade.gain.value).toBeLessThan(0.05);
    engine.setSongStart(undefined);
    expect(fade.gain.value).toBe(1);

    engine.setSongStart(0);
    advance(3.9);
    await engine.stop();
    await engine.start();
    expect(fade.gain.value).toBe(1);
  });

  it("stops the song when the patch loses it", async () => {
    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [], song });
    engine.setSongStart(0);
    await engine.start();

    engine.sync({ tempo: 120, nodes: [sequencer()], connections: [] });

    expect(engine.getSongBar()).toBeUndefined();
  });
});

describe("song controls", () => {
  const osc = node("osc", "oscillator");
  const mix = node("mix", "mixer");
  const cable: PatchConnection = { ...link("a", "osc", "mix"), amount: 0.5 };
  const patch = (automation: Record<string, string>) => ({
    tempo: 120,
    nodes: [osc, mix],
    connections: [cable],
    song: { bars: 2, rows: {}, automation },
  });

  beforeEach(() => {
    vi.useFakeTimers();
    return () => {
      void engine.stop();
      vi.useRealTimers();
    };
  });

  it("sets the params of the nodes on the points of their lanes", async () => {
    const setParameter = vi.spyOn(OscillatorModule.prototype, "setParameter");
    engine.sync(patch({ "osc.detune": "0:25" }));
    engine.setSongStart(0);

    await engine.start();

    expect(setParameter).toHaveBeenLastCalledWith("detune", 25, 0);
    expect(engine.getControl("osc.detune")).toBe(25);
  });

  it("sets the level, pan, mute and solo of a mixer channel, each on its own", async () => {
    engine.sync(patch({ "a.level": "0:0.2", "a.mute": "0:1" }));
    const setChannel = vi.spyOn(MixerModule.prototype, "setChannel");
    engine.setSongStart(0);

    await engine.start();

    expect(setChannel).toHaveBeenLastCalledWith("a", { level: 0.2, pan: 0, mute: true, solo: false }, 0);
  });

  describe("on control cables", () => {
    const lfo = node("lfo", "lfo");
    const gainsAt = (value: number) =>
      context.gains.filter((gain) => {
        const last = gain.gain.events.at(-1);
        return last !== undefined && last.type !== "cancel" && last.value === value;
      });
    const modulation = (automation: Record<string, string>, ...ids: string[]) => ({
      tempo: 120,
      nodes: [lfo, ...ids.map((_, index) => node(`f${index}`, "filter"))],
      connections: ids.map((id, index) => ({ ...wire(id, "lfo", "out", `f${index}`, "frequency"), amount: 0.5 })),
      song: { bars: 2, rows: {}, automation },
    });

    it("sets the amount of a control cable on the points of its lane, and that of the patch on stop", async () => {
      engine.sync(modulation({ "m.amount": "0:-1" }, "m"));
      engine.setSongStart(0);

      await engine.start();
      expect(gainsAt(-6000)).toHaveLength(1);
      expect(engine.getControl("m.amount")).toBe(-1);

      await engine.stop();
      expect(gainsAt(3000)).toHaveLength(1);
    });

    it("sets the amount of every copy of a cable into the voices of a subpatch", async () => {
      engine.sync(modulation({ "m.amount": "0:-1" }, "m", "m#1-2"));
      engine.setSongStart(0);

      await engine.start();

      expect(gainsAt(-6000)).toHaveLength(2);
    });

    it("sets the amount of a control cable inside a subpatch on every voice", async () => {
      engine.sync(modulation({ "sub/m.amount": "0:-1" }, "sub/m", "sub#2/m", "other/m"));
      engine.setSongStart(0);

      await engine.start();

      expect(gainsAt(-6000)).toHaveLength(2);
    });
  });

  describe("inside a subpatch of several voices", () => {
    const voices = {
      tempo: 120,
      nodes: [
        node("sub/osc", "oscillator"),
        node("sub/mix", "mixer"),
        node("sub#2/osc", "oscillator"),
        node("sub#2/mix", "mixer"),
        node("sub#2/inner#3/osc", "oscillator"),
        node("other/osc", "oscillator"),
      ],
      connections: [
        { ...link("sub/a", "sub/osc", "sub/mix"), amount: 0.5 },
        { ...link("sub#2/a", "sub#2/osc", "sub#2/mix"), amount: 0.5 },
      ],
    };
    const song = (automation: Record<string, string>) => ({ ...voices, song: { bars: 2, rows: {}, automation } });

    it("sets a param of a node on every voice", async () => {
      const setParameter = vi.spyOn(OscillatorModule.prototype, "setParameter");
      engine.sync(song({ "sub/osc.detune": "0:25" }));
      engine.setSongStart(0);

      await engine.start();

      expect(setParameter.mock.calls.filter(([name, value]) => name === "detune" && value === 25)).toHaveLength(2);
      expect(engine.getControl("sub/osc.detune")).toBe(25);
    });

    it("sets a param of a node in a subpatch of voices inside another one on every voice", async () => {
      const setParameter = vi.spyOn(OscillatorModule.prototype, "setParameter");
      engine.sync(song({ "sub/inner/osc.detune": "0:25" }));
      engine.setSongStart(0);

      await engine.start();

      expect(setParameter.mock.calls.filter(([name, value]) => name === "detune" && value === 25)).toHaveLength(1);
    });

    it("sets a mixer channel on every voice", async () => {
      engine.sync(song({ "sub/a.level": "0:0.2" }));
      const setChannel = vi.spyOn(MixerModule.prototype, "setChannel");
      engine.setSongStart(0);

      await engine.start();

      const set = { level: 0.2, pan: 0, mute: false, solo: false };
      expect(setChannel).toHaveBeenCalledWith("sub/a", set, 0);
      expect(setChannel).toHaveBeenCalledWith("sub#2/a", set, 0);
    });

    it("goes back to the values of the patch on every voice on stop", async () => {
      const setParameter = vi.spyOn(OscillatorModule.prototype, "setParameter");
      engine.sync(song({ "sub/osc.detune": "0:25" }));
      engine.setSongStart(0);
      await engine.start();
      setParameter.mockClear();

      await engine.stop();

      expect(setParameter.mock.calls.filter(([name]) => name === "detune")).toHaveLength(2);
    });
  });

  it("goes back to the values of the patch on stop", async () => {
    const setParameter = vi.spyOn(OscillatorModule.prototype, "setParameter");
    engine.sync(patch({ "osc.detune": "0:25", "a.pan": "0:-1" }));
    engine.setSongStart(0);
    await engine.start();
    const setChannel = vi.spyOn(MixerModule.prototype, "setChannel");

    await engine.stop();

    expect(setParameter).toHaveBeenLastCalledWith("detune", osc.params.detune, 0);
    expect(setChannel).toHaveBeenLastCalledWith("a", { level: 0.5, pan: 0, mute: false, solo: false }, 0);
    expect(engine.getControl("osc.detune")).toBeUndefined();
  });

  it("goes back to the value of the patch for a lane taken away while it plays", async () => {
    const setParameter = vi.spyOn(OscillatorModule.prototype, "setParameter");
    engine.sync(patch({ "osc.detune": "0:25" }));
    engine.setSongStart(0);
    await engine.start();

    engine.sync({ ...patch({}), song: { bars: 2, rows: {} } });

    expect(setParameter).toHaveBeenLastCalledWith("detune", osc.params.detune, 0);
  });

  it("plays a control held by hand as it is moved, leaving its lane alone until let go", async () => {
    const setParameter = vi.spyOn(OscillatorModule.prototype, "setParameter");
    engine.sync(patch({ "osc.detune": "0:25 2:50" }));
    engine.setSongStart(0);
    await engine.start();

    engine.holdControl("osc.detune");
    engine.setControl("osc.detune", 10);
    context.currentTime = 1.5;
    vi.advanceTimersByTime(50);

    expect(setParameter).toHaveBeenLastCalledWith("detune", 10, 0);
    expect(engine.getControl("osc.detune")).toBe(10);
    engine.releaseControl("osc.detune");
  });

  it("takes a control back to the value of the patch, and leaves it to the song again", async () => {
    const setParameter = vi.spyOn(OscillatorModule.prototype, "setParameter");
    engine.sync(patch({}));
    engine.holdControl("osc.detune");
    engine.setControl("osc.detune", 10);

    engine.resetControl("osc.detune");

    expect(setParameter).toHaveBeenLastCalledWith("detune", osc.params.detune, 0);
    expect(engine.getControl("osc.detune")).toBeUndefined();
  });

  it("keeps a control held by hand as it is when the song changes", async () => {
    const setParameter = vi.spyOn(OscillatorModule.prototype, "setParameter");
    engine.sync(patch({}));
    engine.setSongStart(0);
    await engine.start();
    engine.holdControl("osc.detune");
    engine.setControl("osc.detune", 10);

    engine.sync(patch({ "osc.gain": "0:1" }));

    expect(setParameter).toHaveBeenLastCalledWith("detune", 10, 0);
  });

  it("tells where the song is, in beats", async () => {
    engine.sync(patch({}));
    engine.setSongStart(1);
    await engine.start();
    context.currentTime = 0.5;

    expect(engine.getSongPosition()).toBe(5);
  });
});

describe("subpatches", () => {
  const wire = (id: string, from: [string, string], to: [string, string]): PatchConnection => ({
    id,
    source: { nodeId: from[0], port: from[1] },
    target: { nodeId: to[0], port: to[1] },
  });

  it("plays a subpatch flattened, its In and Out passing sound and gates between inside and out", () => {
    engine.sync({
      tempo: 120,
      nodes: [
        node("osc", "oscillator"),
        node("keys", "keyboard"),
        node("sub/in", "inlet", { signal: "audio" }),
        node("sub/gate", "inlet", { signal: "trigger" }),
        node("sub/filter", "filter"),
        node("sub/env", "envelope"),
        node("sub/out", "outlet", { signal: "audio" }),
        node("speaker", "output"),
      ],
      connections: [
        wire("a", ["osc", "audio"], ["sub/in", "in"]),
        wire("g", ["keys", "gate"], ["sub/gate", "in"]),
        wire("i1", ["sub/in", "out"], ["sub/filter", "audio"]),
        wire("i2", ["sub/gate", "out"], ["sub/env", "gate"]),
        wire("i3", ["sub/filter", "audio"], ["sub/out", "in"]),
        wire("o", ["sub/out", "out"], ["speaker", "audio"]),
      ],
    });

    const [into, , out] = context.gains;
    const filter = context.filters[0];
    expect(context.oscillators[0].outputs.has(into)).toBe(true);
    expect(into.outputs.has(filter)).toBe(true);
    expect(filter.outputs.has(out)).toBe(true);
    engine.noteOn(60);
    const ramps = context.constantSources.filter((source) =>
      source.offset.events.some((event) => event.type === "linearRamp"),
    );
    expect(ramps).toHaveLength(1);
  });

  describe("notes", () => {
    const voices = (count: number) => ({
      tempo: 120,
      nodes: [
        node("keys", "keyboard"),
        ...Array.from({ length: count }, (_, index) => [
          node(`sub#${index + 1}/notes`, "inlet", { signal: "notes", value: 0, voice: index + 1, voices: count }),
          node(`sub#${index + 1}/env`, "envelope"),
        ]).flat(),
      ],
      connections: Array.from({ length: count }, (_, index) => [
        wire(`n${index}`, ["keys", "notes"], [`sub#${index + 1}/notes`, "in"]),
        wire(`g${index}`, [`sub#${index + 1}/notes`, "gate"], [`sub#${index + 1}/env`, "gate"]),
      ]).flat(),
    });
    const opened = () =>
      context.constantSources.filter((source) => source.offset.events.some((event) => event.type === "linearRamp"));

    it("plays a chord on the keys with a voice for each note", () => {
      engine.sync(voices(3));

      engine.noteOn(60);
      engine.noteOn(64);

      expect(opened()).toHaveLength(2);
    });

    it("releases the notes of a cable that is removed", () => {
      engine.sync(voices(1));
      engine.noteOn(60);
      context.currentTime = 1;

      engine.disconnect("n0");

      const envelope = opened()[0].offset.events;
      expect(envelope.at(-1)).toMatchObject({ type: "linearRamp", value: 0 });
    });
  });

  it("modulates through a control In as far as the cable into it says", () => {
    engine.sync({
      tempo: 120,
      nodes: [node("lfo", "lfo"), node("sub/cutoff", "inlet", { signal: "control" }), node("sub/filter", "filter")],
      connections: [
        { ...wire("m", ["lfo", "out"], ["sub/cutoff", "in"]), amount: 0.5 },
        wire("i", ["sub/cutoff", "out"], ["sub/filter", "frequency"]),
      ],
    });

    const scaler = context.gains.find((gain) => gain.gain.value === 0.5);
    expect(scaler).toBeDefined();
  });
});

describe("MIDI", () => {
  let access: FakeMidiAccess;
  let keyboard: FakeMidiInput;
  let request: ReturnType<typeof vi.fn<() => Promise<MIDIAccess>>>;

  beforeEach(() => {
    access = new FakeMidiAccess();
    keyboard = new FakeMidiInput("a", "Keystation");
    access.inputs.set(keyboard.id, keyboard);
    request = vi.fn(() => Promise.resolve(access.asMidiAccess()));
    context = new FakeAudioContext();
    engine = new AudioEngine(context.asAudioContext(), undefined, new MidiInput(request));
  });

  it("asks for the devices only once a MIDI In is added", async () => {
    engine.createModule(node("keys", "keyboard"));
    await settle();
    expect(request).not.toHaveBeenCalled();

    engine.createModule(node("midi", "midiInput"));
    await settle();

    expect(request).toHaveBeenCalledTimes(1);
    expect(engine.getMidiState("midi")).toEqual({ status: "on", devices: ["Keystation"] });
    expect(engine.getMidiState("keys")).toBeUndefined();
  });

  it("plays the MIDI notes on a MIDI In, and the computer keys on a Keyboard only", async () => {
    engine.createModule(node("midi", "midiInput"));
    engine.createModule(node("keys", "keyboard"));
    await settle();

    keyboard.send(0x90, 62, 100);
    engine.noteOn(60);

    expect(engine.getNotes("midi")).toEqual({ notes: [62], playing: 62 });
    expect(engine.getNotes("keys")).toEqual({ notes: [60], playing: 60 });
  });

  it("ends the notes of the MIDI In when a device goes away", async () => {
    engine.createModule(node("midi", "midiInput"));
    await settle();
    keyboard.send(0x90, 62, 100);

    access.unplug(keyboard);

    expect(engine.getNotes("midi")).toEqual({ notes: [] });
  });

  describe("while stopped", () => {
    beforeEach(async () => {
      engine.createModule(node("midi", "midiInput"));
      await settle();
      vi.useFakeTimers();
      engine.setSoundWhileStopped(true);
      return () => {
        vi.useRealTimers();
      };
    });

    it("sounds the MIDI notes, until a while after the last one ends", () => {
      keyboard.send(0x90, 60, 100);
      expect(context.state).toBe("running");
      expect(engine.state).toBe("suspended");

      keyboard.send(0x80, 60, 0);
      vi.advanceTimersByTime(5_100);

      expect(context.state).toBe("suspended");
    });

    it("keeps sounding while the sustain pedal is down", () => {
      keyboard.send(0x90, 60, 100);
      keyboard.send(0xb0, 64, 127);
      keyboard.send(0x80, 60, 0);
      vi.advanceTimersByTime(10_000);
      expect(context.state).toBe("running");

      keyboard.send(0xb0, 64, 0);
      vi.advanceTimersByTime(5_100);

      expect(context.state).toBe("suspended");
    });

    it("stops sounding a while after a device goes away in the middle of a note", () => {
      keyboard.send(0x90, 60, 100);

      access.unplug(keyboard);
      vi.advanceTimersByTime(5_100);

      expect(context.state).toBe("suspended");
    });
  });

  it("does not sound the MIDI notes while stopped without a MIDI In", async () => {
    engine.createModule(node("midi", "midiInput"));
    await settle();
    engine.removeModule("midi");
    engine.setSoundWhileStopped(true);

    keyboard.send(0x90, 60, 100);

    expect(context.state).toBe("suspended");
  });
});
