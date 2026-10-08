import { beforeEach, describe, expect, it } from "vitest";
import { SampleLibrary } from "../../../samples/sampleLibrary";
import { FakeAudioContext, FakeConstantSourceNode, FakeGainNode } from "../../../test/fakeAudioContext";
import { SamplerModule } from "./SamplerModule";

let context: FakeAudioContext;
let samples: SampleLibrary;
/** A sample of two seconds, as the fake context decodes it. */
let twoSeconds: string;

const params = { sample: "", play: "one-shot", tune: 0, start: 0, end: 1, order: "select", select: 0 };
const settle = () => new Promise((resolve) => setTimeout(resolve));

beforeEach(async () => {
  context = new FakeAudioContext();
  samples = new SampleLibrary();
  twoSeconds = await samples.add("kick.wav", "audio/wav", new Uint8Array([20]).buffer);
});

const create = async (overrides: Partial<typeof params> = {}) => {
  const sampler = new SamplerModule(context.asAudioContext(), { ...params, sample: twoSeconds, ...overrides }, samples);
  await settle();
  return sampler;
};

/** The state of its first sample, or empty without any, as a sampler of one sample shows it. */
const first = (sampler: SamplerModule) => sampler.getSample().samples[0] ?? { status: "empty" };
const output = (sampler: SamplerModule) => sampler.getAudioOutput("audio") as unknown as FakeGainNode;
const tune = () => context.constantSources[0];
const voice = (index: number) => {
  const source = context.bufferSources[index];
  const envelope = [...source.outputs][0] as FakeGainNode;
  return { source, envelope };
};

describe("SamplerModule", () => {
  it("is empty without a sample, and plays nothing", () => {
    const sampler = new SamplerModule(context.asAudioContext(), params, samples);

    sampler.gateOn(0);

    expect(first(sampler)).toEqual({ status: "empty" });
    expect(context.bufferSources).toEqual([]);
  });

  it("reads its sample, and shows its name once it can play it", async () => {
    const sampler = new SamplerModule(context.asAudioContext(), { ...params, sample: twoSeconds }, samples);
    expect(first(sampler).status).toBe("loading");

    await settle();

    expect(first(sampler)).toMatchObject({ status: "ready", name: "kick.wav" });
    expect(first(sampler).buffer?.duration).toBe(2);
  });

  it("tells when the sample is not in this browser, or is not audio", async () => {
    const missing = await create({ sample: "0123456789abcdef" });
    const noise = await create({ sample: await samples.add("notes.txt", "text/plain", new ArrayBuffer(0)) });

    expect(first(missing)).toEqual({ status: "missing" });
    expect(first(noise)).toEqual({ status: "invalid", name: "notes.txt" });
  });

  it("plays the sample once on each gate, faded in, to its end", async () => {
    const sampler = await create({ start: 0.25 });

    sampler.gateOn(1);

    const { source, envelope } = voice(0);
    expect(source.buffer).toBe(first(sampler).buffer);
    expect(source.startTime).toBe(1);
    expect(source.offset).toBe(0.5);
    expect(source.duration).toBe(1.5);
    expect(source.loop).toBe(false);
    expect(envelope.gain.events).toEqual([
      { type: "setValue", value: 0, time: 1 },
      { type: "linearRamp", value: 1, time: 1.005 },
    ]);
    expect(envelope.outputs.has(output(sampler))).toBe(true);
  });

  it("plays a part that ends before the file from a copy of it, faded out, whatever the tune", async () => {
    const sampler = await create({ start: 0.25, end: 0.75 });
    first(sampler).buffer!.getChannelData(0).fill(1);

    sampler.gateOn(1);

    const { source } = voice(0);
    const data = source.buffer!.getChannelData(0);
    expect(source.buffer!.duration).toBe(1);
    expect([source.startTime, source.offset, source.duration]).toEqual([1, undefined, undefined]);
    expect(data[0]).toBe(1);
    expect(data[data.length - 241]).toBe(1);
    expect(data[data.length - 120]).toBeCloseTo(0.5, 1);
    expect(data[data.length - 1]).toBe(0);
    expect(first(sampler).buffer!.getChannelData(0)[95999]).toBe(1);

    sampler.gateOn(2);
    expect(voice(1).source.buffer).toBe(source.buffer);
    sampler.setParameter("end", 0.5, 2);
    sampler.gateOn(3);
    expect(voice(2).source.buffer!.duration).toBe(0.5);
  });

  it("keeps a cut voice playing its copy when the part moves", async () => {
    const sampler = await create({ end: 0.5 });
    sampler.gateOn(0);

    sampler.setParameter("play", "loop", 0.1);
    sampler.setParameter("start", 0.2, 0.1);

    expect(voice(0).source.loop).toBe(false);
    expect(voice(0).source.loopStart).toBe(0);
  });

  it("plays the part between start and end even when end comes first, and nothing when they meet", async () => {
    const backwards = await create({ start: 0.75, end: 0.25, play: "loop" });
    backwards.gateOn(0);
    expect(voice(0).source.offset).toBe(0.5);

    const none = await create({ start: 0.5, end: 0.5 });
    none.gateOn(0);
    expect(context.bufferSources).toHaveLength(1);
  });

  it("lets a one-shot play on after its gate closes, and cuts it with the next gate", async () => {
    const sampler = await create();

    sampler.gateOn(0);
    sampler.gateOff(0.1);
    expect(voice(0).source.stopped).toBe(false);

    sampler.gateOn(0.5);
    expect(voice(0).source.stopTime).toBe(0.51);
    expect(voice(0).envelope.gain.events.slice(-2)).toEqual([
      { type: "cancel", time: 0.5 },
      { type: "setTarget", value: 0, time: 0.5 },
    ]);
    expect(voice(1).source.startTime).toBe(0.5);
  });

  it("plays while the gate is open, in gate mode", async () => {
    const sampler = await create({ play: "gate" });

    sampler.gateOn(0);
    sampler.gateOff(0.3);

    expect(voice(0).source.stopTime).toBeCloseTo(0.31);
  });

  it("loops from start to end while the gate is open, and follows start and end as they move", async () => {
    const sampler = await create({ play: "loop", start: 0.1, end: 0.6 });

    sampler.gateOn(0);
    const { source } = voice(0);
    expect(source.loop).toBe(true);
    expect([source.loopStart, source.loopEnd]).toEqual([0.2, 1.2]);
    expect(source.duration).toBeUndefined();

    sampler.setParameter("end", 0.9, 0.2);
    expect(source.loopEnd).toBeCloseTo(1.8);
    sampler.setParameter("play", "one-shot", 0.3);
    expect(source.loop).toBe(false);

    sampler.gateOff(0.4);
    expect(source.stopped).toBe(false);
  });

  it("tunes every voice in semitones, from a param the cables reach", async () => {
    const sampler = await create({ tune: 7 });
    const offset = sampler.getAudioParam("tune") as unknown as FakeConstantSourceNode["offset"];

    expect(offset).toBe(tune().offset);
    expect(offset.value).toBe(7);

    sampler.gateOn(0);
    const cents = [...tune().outputs][0] as FakeGainNode;
    expect(cents.gain.value).toBe(100);
    expect(cents.outputs.has(voice(0).source.detune)).toBe(true);

    sampler.setParameter("tune", -12, 1);
    expect(offset.events).toEqual([{ type: "setTarget", value: -12, time: 1 }]);
    expect(sampler.getAudioParam("start")).toBeUndefined();
  });

  it("lets go of a voice once it ends", async () => {
    const sampler = await create();
    sampler.gateOn(0);
    const { source, envelope } = voice(0);
    const cents = [...tune().outputs][0] as FakeGainNode;

    source.onended?.();

    expect(cents.outputs.has(source.detune)).toBe(false);
    expect(source.outputs.size).toBe(0);
    expect(envelope.outputs.size).toBe(0);
    sampler.gateOn(1);
    expect(source.stopped).toBe(false);
  });

  it("changes its sample, and keeps the last one chosen when they load out of order", async () => {
    const sampler = await create();
    const snare = await samples.add("snare.wav", "audio/wav", new Uint8Array([5]).buffer);

    sampler.setParameter("sample", snare, 0);
    sampler.setParameter("sample", twoSeconds, 0);
    sampler.setParameter("sample", snare, 0);
    await settle();
    expect(first(sampler)).toMatchObject({ status: "ready", name: "snare.wav" });

    sampler.setParameter("sample", "", 0);
    expect(first(sampler)).toEqual({ status: "empty" });
    expect(() => sampler.setParameter("nope", 1, 0)).toThrow();
  });

  it("hushes every voice at once, and plays its sample again on the next gate", async () => {
    const sampler = await create({ play: "loop" });
    sampler.gateOn(0);

    sampler.hush();

    expect(voice(0).source.stopped).toBe(true);
    expect(voice(0).source.outputs.size).toBe(0);
    expect(tune().stopped).toBe(false);

    sampler.gateOn(1);
    expect(voice(1).source.stopped).toBe(false);
  });

  it("stops its voices and its tune on dispose", async () => {
    const sampler = await create();
    sampler.gateOn(0);

    sampler.dispose();

    expect(voice(0).source.stopped).toBe(true);
    expect(voice(0).source.outputs.size).toBe(0);
    expect(tune().stopped).toBe(true);
    expect(output(sampler).outputs.size).toBe(0);
  });
});

describe("SamplerModule with several samples", () => {
  let ids: string[];
  /** One, two and three seconds long, to tell them apart by the buffer each voice plays. */
  beforeEach(async () => {
    ids = [
      await samples.add("hat-1.wav", "audio/wav", new Uint8Array([10]).buffer),
      await samples.add("hat-2.wav", "audio/wav", new Uint8Array([20]).buffer),
      await samples.add("hat-3.wav", "audio/wav", new Uint8Array([30]).buffer),
    ];
  });

  const createWith = async (overrides: Partial<typeof params> = {}, random?: () => number) => {
    const sampler = new SamplerModule(context.asAudioContext(), { ...params, sample: ids.join(" "), ...overrides }, samples, random);
    await settle();
    return sampler;
  };

  const played = () => context.bufferSources.map((source) => source.buffer!.duration);

  it("loads each of its samples, and tells which one plays", async () => {
    const sampler = await createWith();

    expect(sampler.getSample().samples.map(({ status, name }) => [status, name])).toEqual([
      ["ready", "hat-1.wav"],
      ["ready", "hat-2.wav"],
      ["ready", "hat-3.wav"],
    ]);
    expect(sampler.getSample().playing).toBe(0);
  });

  it("plays the sample the Select knob falls on, and takes a new one from the next gate without cutting the one sounding", async () => {
    const sampler = await createWith({ select: 0.5 });

    sampler.gateOn(0);
    sampler.setParameter("select", 0.9, 0.1);
    expect(context.bufferSources[0].stopped).toBe(false);
    expect(sampler.getSample().playing).toBe(1);

    sampler.gateOn(1);

    expect(played()).toEqual([2, 3]);
    expect(sampler.getSample().playing).toBe(2);
  });

  it("adds what the cables bring into Select to the knob", async () => {
    const sampler = await createWith({ select: 0 });
    context.analysers.at(-1)!.samples = new Float32Array([0.6]);

    sampler.gateOn(0);

    expect(played()).toEqual([2]);
  });

  it("plays them at random without the same one twice in a row, with Order random", async () => {
    const sampler = await createWith({ order: "random" });

    for (let gate = 0; gate < 30; gate++) {
      sampler.gateOn(gate);
    }

    const durations = played();
    expect(new Set(durations)).toEqual(new Set([1, 2, 3]));
    expect(durations.every((duration, index) => index === 0 || duration !== durations[index - 1])).toBe(true);
  });

  it("plays them in turn with Order cycle", async () => {
    const sampler = await createWith({ order: "cycle" });

    [0, 1, 2, 3].forEach((gate) => sampler.gateOn(gate));

    expect(played()).toEqual([1, 2, 3, 1]);
  });

  it("keeps the samples it has when one is added, without reading them again", async () => {
    const sampler = await createWith({ sample: ids.slice(0, 2).join(" ") });
    const before = sampler.getSample().samples[0];

    sampler.setParameter("sample", ids.join(" "), 0);

    expect(sampler.getSample().samples[0]).toBe(before);
    await settle();
    expect(sampler.getSample().samples.map(({ status }) => status)).toEqual(["ready", "ready", "ready"]);
  });

  it("tells it has none without samples", async () => {
    const sampler = await createWith({ sample: "" });

    expect(sampler.getSample()).toEqual({ samples: [], playing: 0 });
  });
});
