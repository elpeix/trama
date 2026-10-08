import { parseSampleList } from "../../../patch/samples";
import type { Params, ParamValue } from "../../../patch/types";
import type { SampleLibrary } from "../../../samples/sampleLibrary";
import { glide, unknownParameter, type AudioModule, type SamplerState, type SampleState, type TriggerInput } from "../AudioModule";

/** Seconds a voice takes to come in and to fade away, so it neither clicks when it starts nor when it is cut. */
const FADE = 0.005;

const CENTS_PER_SEMITONE = 100;
const EMPTY: SampleState = { status: "empty" };

interface Voice {
  source: AudioBufferSourceNode;
  /** The sample it plays, whole. */
  buffer: AudioBuffer;
  envelope: GainNode;
  /** Plays a copy of its part of the sample, not the sample from Start to End. */
  cut: boolean;
}

interface Region {
  from: number;
  to: number;
}

/**
 * Plays a sample from Start to End on each gate: to its end (one-shot), while the gate is open
 * (gate), or over and over while it is open (loop). A new gate cuts the voice that sounds. Tune
 * moves it in semitones, and the pitch of a Keyboard into it plays it from C4. With several
 * samples, each gate plays the one Select falls on, the knob and the cables into it together, or
 * one at random but not the last again, or each in turn.
 */
export class SamplerModule implements AudioModule, TriggerInput {
  private readonly context: BaseAudioContext;
  private readonly samples: SampleLibrary;
  private readonly output: GainNode;
  /** The tune, in semitones, and what the cables add to it, reaching each voice in cents. */
  private readonly tune: ConstantSourceNode;
  private readonly cents: GainNode;
  private readonly voices = new Set<Voice>();
  private voice: Voice | undefined;
  private play: string;
  private start: number;
  private end: number;
  private readonly random: () => number;
  private ids: string[] = [];
  /** The state of each sample by its id, kept while it stays among the samples. */
  private states = new Map<string, SampleState>();
  private order: string;
  private select: number;
  /** What the cables bring into Select, read when a gate comes. */
  private readonly selectIn: ConstantSourceNode;
  private readonly selectProbe: AnalyserNode;
  private readonly probed = new Float32Array(32);
  private playing = 0;
  private last = -1;
  /** The part from Start to End with its end faded out, made again when the sample or the part changes. */
  private part: { buffer: AudioBuffer; from: number; to: number; cut: AudioBuffer } | undefined;

  constructor(context: BaseAudioContext, params: Params, samples: SampleLibrary, random: () => number = Math.random) {
    this.context = context;
    this.samples = samples;
    this.random = random;
    this.order = String(params.order ?? "select");
    this.select = Number(params.select ?? 0);
    this.play = String(params.play);
    this.start = Number(params.start);
    this.end = Number(params.end);
    this.output = context.createGain();
    this.tune = context.createConstantSource();
    this.tune.offset.value = Number(params.tune);
    this.cents = context.createGain();
    this.cents.gain.value = CENTS_PER_SEMITONE;
    this.tune.connect(this.cents);
    this.tune.start();
    this.selectIn = context.createConstantSource();
    this.selectIn.offset.value = 0;
    this.selectProbe = context.createAnalyser();
    this.selectProbe.fftSize = this.probed.length;
    this.selectIn.connect(this.selectProbe);
    this.selectIn.start();
    this.load(String(params.sample));
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.output : undefined;
  }

  getAudioParam(port: string) {
    if (port === "select") {
      return this.selectIn.offset;
    }
    return port === "tune" ? this.tune.offset : undefined;
  }

  getTriggerInput(port: string) {
    return port === "gate" ? this : undefined;
  }

  getSample(): SamplerState {
    return { samples: this.ids.map((id) => this.states.get(id) ?? EMPTY), playing: this.playing };
  }

  gateOn(time: number) {
    const index = this.choose();
    if (index === undefined) {
      return;
    }
    this.playing = index;
    this.last = index;
    const { buffer } = this.states.get(this.ids[index]) ?? EMPTY;
    const region = buffer && this.region(buffer);
    if (!buffer || !region) {
      return;
    }
    this.release(time);
    const loop = this.play === "loop";
    // Ended before the end of the file, a part would be cut short with a click: it plays a copy
    // faded out instead, which fades on time however the tune moves it.
    const cut = !loop && region.to < buffer.duration;
    const source = this.context.createBufferSource();
    source.buffer = cut ? this.cut(buffer, region) : buffer;
    source.loop = loop;
    source.loopStart = region.from;
    source.loopEnd = region.to;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(1, time + FADE);
    this.cents.connect(source.detune);
    source.connect(envelope);
    envelope.connect(this.output);
    if (cut) {
      source.start(time);
    } else if (loop) {
      source.start(time, region.from);
    } else {
      source.start(time, region.from, region.to - region.from);
    }
    const voice = { source, buffer, envelope, cut };
    source.onended = () => this.silence(voice);
    this.voices.add(voice);
    this.voice = voice;
  }

  gateOff(time: number) {
    if (this.play !== "one-shot") {
      this.release(time);
    }
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "sample":
        return this.load(String(value));
      case "play":
        this.play = String(value);
        return this.follow();
      case "start":
        this.start = Number(value);
        return this.follow();
      case "end":
        this.end = Number(value);
        return this.follow();
      case "tune":
        return glide(this.tune.offset, value, time);
      case "order":
        this.order = String(value);
        return;
      case "select":
        this.select = Number(value);
        return;
      default:
        unknownParameter("Sampler", name);
    }
  }

  hush() {
    this.voices.forEach((voice) => {
      voice.source.stop();
      this.silence(voice);
    });
  }

  dispose() {
    this.states.clear();
    this.hush();
    this.part = undefined;
    this.selectIn.stop();
    this.selectIn.disconnect();
    this.tune.stop();
    this.tune.disconnect();
    this.cents.disconnect();
    this.output.disconnect();
  }

  /** The part of the sample it plays, in seconds; none while Start and End meet. */
  private region(buffer: AudioBuffer): Region | undefined {
    const from = Math.min(this.start, this.end) * buffer.duration;
    const to = Math.max(this.start, this.end) * buffer.duration;
    return to - from > 1 / buffer.sampleRate ? { from, to } : undefined;
  }

  /** The place of the sample the next gate plays, by the order of the samples; none without any. */
  private choose(): number | undefined {
    const count = this.ids.length;
    if (count === 0) {
      return undefined;
    }
    if (this.order === "cycle") {
      return (this.last + 1) % count;
    }
    if (this.order === "random") {
      if (count === 1) {
        return 0;
      }
      const pick = Math.floor(this.random() * (count - 1));
      return this.last >= 0 && pick >= this.last ? pick + 1 : pick;
    }
    this.selectProbe.getFloatTimeDomainData(this.probed);
    const select = Math.max(0, Math.min(1, this.select + this.probed[this.probed.length - 1]));
    return Math.min(count - 1, Math.floor(select * count));
  }

  /** The voice that sounds keeps looping, or stops looping, over the part now chosen. */
  private follow() {
    const buffer = this.voice?.buffer;
    const region = buffer && this.region(buffer);
    const source = this.voice?.source;
    if (!source || !region || this.voice?.cut) {
      return;
    }
    source.loop = this.play === "loop";
    source.loopStart = region.from;
    source.loopEnd = region.to;
  }

  /** A copy of the part of the sample it plays, faded out over its last few milliseconds. */
  private cut(buffer: AudioBuffer, { from, to }: Region): AudioBuffer {
    if (this.part?.buffer === buffer && this.part.from === from && this.part.to === to) {
      return this.part.cut;
    }
    const first = Math.round(from * buffer.sampleRate);
    const length = Math.max(1, Math.round(to * buffer.sampleRate) - first);
    const cut = this.context.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
    const fade = Math.min(Math.round(FADE * buffer.sampleRate), Math.floor(length / 2));
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = cut.getChannelData(channel);
      data.set(buffer.getChannelData(channel).subarray(first, first + length));
      for (let index = 0; index < fade; index++) {
        data[length - 1 - index] *= index / fade;
      }
    }
    this.part = { buffer, from, to, cut };
    return cut;
  }

  private release(time: number) {
    const voice = this.voice;
    if (!voice) {
      return;
    }
    this.voice = undefined;
    voice.envelope.gain.cancelScheduledValues(time);
    voice.envelope.gain.setTargetAtTime(0, time, FADE / 3);
    voice.source.stop(time + FADE * 2);
  }

  private silence(voice: Voice) {
    if (!this.voices.delete(voice)) {
      return;
    }
    if (this.voice === voice) {
      this.voice = undefined;
    }
    this.cents.disconnect(voice.source.detune);
    voice.source.disconnect();
    voice.envelope.disconnect();
  }

  /** Takes the samples of a list: those it already has stay as they are, and each new one loads on its own. */
  private load(list: string) {
    this.part = undefined;
    this.ids = parseSampleList(list) ?? [];
    const had = this.states;
    this.states = new Map(this.ids.map((id) => [id, had.get(id) ?? { status: "loading" }]));
    this.ids.filter((id) => !had.has(id)).forEach((id) => this.loadOne(id));
    if (this.playing >= this.ids.length) {
      this.playing = 0;
    }
  }

  private loadOne(id: string) {
    const set = (state: SampleState) => {
      if (this.states.has(id)) {
        this.states.set(id, state);
      }
    };
    void this.samples.get(id).then(async (record) => {
      if (!record) {
        set({ status: "missing" });
        return;
      }
      set({ status: "loading", name: record.name });
      try {
        const buffer = await this.samples.decode(this.context, id);
        set(buffer ? { status: "ready", name: record.name, buffer } : { status: "missing" });
      } catch {
        set({ status: "invalid", name: record.name });
      }
    });
  }
}
