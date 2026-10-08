import { DEFAULT_VELOCITY, MAX_VELOCITY } from "../../../patch/clip";
import type { Params, ParamValue } from "../../../patch/types";
import { glide, NoteBus, TriggerBus, unknownParameter, type AudioModule, type NoteReceiver, type VoiceUsage } from "../AudioModule";
import { VoiceAllocator } from "./voiceAllocator";

const MIDDLE_C = 60;
/** Seconds a voice that still sounds takes to fade out before a new note starts on it. */
const STEAL_FADE = 0.005;

/** The Outs of sound of each voice of the subpatches of a context, by the voice they belong to. */
const outsOfVoices = new WeakMap<BaseAudioContext, Map<string, Set<PortModule>>>();

const outsOf = (context: BaseAudioContext, group: string) => {
  const groups = outsOfVoices.get(context) ?? new Map<string, Set<PortModule>>();
  outsOfVoices.set(context, groups);
  const outs = groups.get(group) ?? new Set<PortModule>();
  groups.set(group, outs);
  return outs;
};

/**
 * An In or an Out of a subpatch, once the subpatch is flattened: it lets through whatever reaches
 * it, sound and control through a single node, gates through a bus. A control In adds its value to
 * what goes through, like the knob of a param adds to its modulation. An In of notes plays, as a
 * pitch, a gate and a velocity from 0 to 1, the notes that fall to its voice of the voices of the
 * subpatch, and sends them on as notes too, for a module played by notes; alone, it sends on every
 * note as it comes, so that such a module slurs as it would outside. The signal it carries only shapes the ports the editor shows. When, of several voices,
 * the note it is given takes its voice while that still sounds, held or in the release of its envelopes, the Outs of sound
 * of its voice fade out in a few milliseconds and the note starts right after, rather than the tail
 * jumping to it.
 */
export class PortModule implements AudioModule {
  private readonly pass: GainNode;
  private readonly offset: ConstantSourceNode;
  private readonly gates = new TriggerBus();
  private readonly pitch: ConstantSourceNode;
  private readonly velocity: ConstantSourceNode;
  private readonly gate = new TriggerBus();
  private readonly voiceNotes = new NoteBus();
  private voice: number;
  private voices: VoiceAllocator;
  private voiceCount: number;
  private ringsFor: number;
  private readonly context: BaseAudioContext;
  private group?: string;
  private signal: string;
  private playing?: number;
  private readonly notes: NoteReceiver = {
    noteOn: (note, at, velocity = DEFAULT_VELOCITY) => {
      const mine = this.voices.noteOn(note, at) === this.voice;
      if (this.alone) {
        this.voiceNotes.noteOn(note, at, velocity);
      }
      if (!mine) {
        return;
      }
      const time = this.voices.stole && this.voiceCount > 1 ? this.fadeVoice(at) : at;
      if (!this.alone) {
        if (this.playing !== undefined) {
          this.voiceNotes.noteOff(this.playing, at);
        }
        this.voiceNotes.noteOn(note, time, velocity);
      }
      this.playing = note;
      this.pitch.offset.setValueAtTime((note - MIDDLE_C) / 12, time);
      this.velocity.offset.setValueAtTime(velocity / MAX_VELOCITY, time);
      this.gate.gateOn(time);
    },
    noteOff: (note, time) => {
      if (this.alone) {
        this.voiceNotes.noteOff(note, time);
      }
      if (this.voices.noteOff(note, time) === this.voice) {
        if (!this.alone && this.playing !== undefined) {
          this.voiceNotes.noteOff(this.playing, time);
        }
        this.release(time);
      }
    },
    allNotesOff: (time) => this.restart(time),
    glide: (from, to, time, seconds) => {
      const mine = this.voices.glide(from, to) === this.voice;
      if (this.alone || mine) {
        this.voiceNotes.glide(from, to, time, seconds);
      }
      if (!mine) {
        return;
      }
      this.playing = to;
      const pitch = (to - MIDDLE_C) / 12;
      if (seconds > 0) {
        this.pitch.offset.setTargetAtTime(pitch, time, seconds / 3);
      } else {
        this.pitch.offset.setValueAtTime(pitch, time);
      }
    },
  };

  constructor(context: BaseAudioContext, params: Params) {
    this.context = context;
    this.pass = context.createGain();
    this.offset = context.createConstantSource();
    this.offset.offset.value = Number(params.value ?? 0);
    this.offset.connect(this.pass);
    this.offset.start();
    this.pitch = context.createConstantSource();
    this.pitch.offset.value = 0;
    this.pitch.start();
    this.velocity = context.createConstantSource();
    this.velocity.offset.value = 0;
    this.velocity.start();
    this.voice = Number(params.voice ?? 1) - 1;
    this.voiceCount = Number(params.voices ?? 1);
    this.ringsFor = Number(params.release ?? 0);
    this.voices = new VoiceAllocator(this.voiceCount, this.ringsFor);
    this.signal = String(params.signal ?? "");
    this.join(params.group === undefined ? undefined : String(params.group));
  }

  /** How many voices its subpatch has, and the most its notes needed at once, their release included. */
  getVoiceUsage(): VoiceUsage | undefined {
    if (this.signal !== "notes") {
      return undefined;
    }
    return { voices: this.voiceCount, needed: this.voices.needed };
  }

  getAudioInput(port: string) {
    return port === "in" ? this.pass : undefined;
  }

  openInput(port: string) {
    return this.getAudioInput(port);
  }

  closeInput() {}

  getAudioOutput(port: string) {
    switch (port) {
      case "out":
        return this.pass;
      case "pitch":
        return this.pitch;
      case "velocity":
        return this.velocity;
      default:
        return undefined;
    }
  }

  getTriggerInput(port: string) {
    return port === "in" ? this.gates : undefined;
  }

  getTriggerOutput(port: string) {
    switch (port) {
      case "out":
        return this.gates;
      case "gate":
        return this.gate;
      default:
        return undefined;
    }
  }

  getNoteInput(port: string) {
    return port === "in" ? this.notes : undefined;
  }

  getNoteOutput(port: string) {
    return port === "notes" ? this.voiceNotes : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    switch (name) {
      case "signal":
        this.signal = String(value);
        return this.join(this.group);
      case "group":
        return this.join(String(value));
      case "release":
        this.ringsFor = Number(value);
        return this.voices.setRelease(this.ringsFor);
      case "value":
        return glide(this.offset.offset, value, time);
      case "voice":
        this.voice = Number(value) - 1;
        return this.restart(time);
      case "voices":
        this.voiceCount = Number(value);
        return this.restart(time);
      default:
        unknownParameter("Port", name);
    }
  }

  dispose() {
    this.offset.stop();
    this.offset.disconnect();
    this.pitch.stop();
    this.pitch.disconnect();
    this.velocity.stop();
    this.velocity.disconnect();
    this.pass.disconnect();
    this.join(undefined);
  }

  /** Fades the Outs of sound of its voice out and back in, by when the new note starts. */
  private fadeVoice(time: number) {
    const start = time + STEAL_FADE;
    if (this.group !== undefined) {
      for (const out of outsOf(this.context, this.group)) {
        out.pass.gain.setValueAtTime(1, time);
        out.pass.gain.linearRampToValueAtTime(0, start);
        out.pass.gain.setValueAtTime(1, start);
      }
    }
    return start;
  }

  /** Belongs to a voice of a subpatch, as an Out of sound its In of notes fades. */
  private join(group: string | undefined) {
    if (this.group !== undefined) {
      outsOf(this.context, this.group).delete(this);
    }
    this.group = group;
    if (group !== undefined && this.signal === "audio") {
      outsOf(this.context, group).add(this);
    }
  }

  /** Whether it is the only voice of its subpatch, and so plays every note. */
  private get alone() {
    return this.voiceCount === 1;
  }

  private restart(time: number) {
    this.voices = new VoiceAllocator(this.voiceCount, this.ringsFor);
    this.voiceNotes.allNotesOff(time);
    this.release(time);
  }

  private release(time: number) {
    if (this.playing === undefined) {
      return;
    }
    this.playing = undefined;
    this.gate.gateOff(time);
  }
}
