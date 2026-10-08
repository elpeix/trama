import { AMOUNT, parseControlKey, type ChannelControl, type ControlKey } from "../patch/automation";
import { DEFAULT_METER, sameMeter } from "../patch/meter";
import { moduleRegistry } from "../patch/registry";
import { flatPortsOf, withoutVoices } from "../patch/subpatch";
import { DEFAULT_SWING, DEFAULT_SWING_GRID } from "../patch/types";
import type { Launch } from "../patch/patterns";
import type {
  NodeId,
  NodeType,
  Params,
  Patch,
  PatchConnection,
  PatchNode,
  ParamValue,
  Patterns,
  PatternSlot,
  PortType,
  Song,
} from "../patch/types";
import {
  glide,
  isNoteReceiver,
  type AudioModule,
  type InputStatus,
  type VoiceUsage,
  type NoteActivity,
  type NoteReceiver,
  type PatternState,
  type SamplerState,
} from "./modules/AudioModule";
import { createAudioModule } from "./modules/createAudioModule";
import { SongPlayer } from "./SongPlayer";
import { Transport } from "./Transport";
import { SampleLibrary } from "../samples/sampleLibrary";
import type { StereoAnalyser } from "./modules/stereoAnalyser";

interface Entry {
  type: NodeType;
  params: Params;
  patterns: Patterns;
  module: AudioModule;
}

const sameEndpoints = (a: PatchConnection, b: PatchConnection) =>
  a.source.nodeId === b.source.nodeId &&
  a.source.port === b.source.port &&
  a.target.nodeId === b.target.nodeId &&
  a.target.port === b.target.port;

/** Enough samples to read the latest value of a modulation; the smallest size an analyser takes. */
const MODULATION_PROBE_SIZE = 32;

interface ModulationProbe {
  analyser: AnalyserNode;
  samples: Float32Array<ArrayBuffer>;
}

const paramKey = (nodeId: NodeId, port: string) => `${nodeId}:${port}`;

interface Wire {
  connection: PatchConnection;
  dispose(): void;
  setAmount?(amount: number, time: number): void;
  setChannel?(connection: PatchConnection, time: number): void;
}

const channelOf = (connection: PatchConnection) => ({
  level: connection.amount ?? 1,
  pan: connection.pan ?? 0,
  mute: connection.mute === true,
  solo: connection.solo === true,
});

/** What a map holds for a node or a cable on each voice of the subpatches it is in. */
const onEveryVoice = <T>(map: Map<string, T>, path: string): T[] =>
  [...map].filter(([id]) => withoutVoices(id) === path).map(([, value]) => value);

const isCopyOf = (id: string, cable: string) => id === cable || id.startsWith(`${cable}#`);

/** A control the song set: the value, or undefined for back to the patch, and from when. */
interface ControlChange {
  time: number;
  value: number | undefined;
}

/** How long the changes of a control are kept after they happen, to tell the one that sounds now. */
const CONTROL_MEMORY_SECONDS = 1;

const sameSettings = (a: PatchConnection, b: PatchConnection) =>
  (a.amount ?? 1) === (b.amount ?? 1) && (a.pan ?? 0) === (b.pan ?? 0) && a.mute === b.mute && a.solo === b.solo;

/**
 * Whether the sound of each module rings on after what feeds them stops: echoes, rooms, bodies
 * struck or plucked, strings, and envelopes still open. Every type has to say, so that a new module
 * is not left out.
 */
const RINGS: Record<NodeType, boolean> = {
  oscillator: false,
  vco: false,
  harmonics: false,
  physicalModel: true,
  piano: true,
  wind: true,
  strings: true,
  modal: true,
  noise: false,
  audioInput: false,
  sampler: false,
  filter: false,
  ladder: true,
  customFilter: false,
  pitchShifter: true,
  spectralFreeze: true,
  granulator: true,
  gain: false,
  delay: true,
  distortion: false,
  reverb: true,
  compressor: false,
  chorus: true,
  flanger: true,
  phaser: true,
  lfo: false,
  envelope: true,
  sampleHold: false,
  quantizer: false,
  math: false,
  slew: false,
  envelopeFollower: false,
  clock: false,
  keyboard: false,
  arpeggiator: false,
  sequencer: false,
  clip: false,
  drums: false,
  mixer: false,
  pan: false,
  output: false,
  scope: false,
  subpatch: false,
  inlet: false,
  outlet: false,
};

const STOPPED_TAIL_MS = 5_000;

export class AudioEngine {
  private readonly context: AudioContext;
  private readonly entries = new Map<NodeId, Entry>();
  private readonly wires = new Map<string, Wire>();
  /** What the control cables add to each param they reach, summed, for display. */
  private readonly modulations = new Map<string, ModulationProbe>();
  readonly transport: Transport;
  private readonly recording: MediaStreamAudioDestinationNode;
  private shouldRun = false;
  private soundWhileStopped = false;
  /** Whether a note played while stopped keeps the sound on, with the transport still stopped. */
  private sounding = false;
  /** The notes and the previews that sound while stopped, until they are let go. */
  private readonly held = new Set<string>();
  private rest: ReturnType<typeof setTimeout> | undefined;
  private readonly listeners = new Set<() => void>();
  /** The patch last synced, to make again the modules that ring on. */
  private patch: Patch | undefined;
  private started = false;
  /** The audio files the samplers play. */
  readonly samples: SampleLibrary;
  private readonly songPlayer: SongPlayer;
  private song: Song | undefined;
  /** The bar the song starts on in song mode; undefined in pattern mode. */
  private songStart: number | undefined;
  /** The changes the song made to each control, oldest first. */
  private readonly controlChanges = new Map<ControlKey, ControlChange[]>();
  /** What the song sets on each mixer channel instead of the settings of its cable. */
  private readonly channelControls = new Map<string, Partial<Record<ChannelControl, number>>>();

  constructor(context: AudioContext, samples = new SampleLibrary()) {
    this.context = context;
    this.samples = samples;
    this.transport = new Transport(context);
    this.transport.pause();
    this.recording = context.createMediaStreamDestination();
    this.songPlayer = new SongPlayer(
      context,
      this.transport,
      (path, slot, mode, at) => this.launchPattern(path, slot, mode, at),
      () => void this.stop(),
      (key, value, time) => this.applyControl(key, value, time),
      (gain, time) => this.fadeOutputs(gain, time, true),
    );
    this.context.addEventListener("statechange", this.keepStoppedUnlessStarted);
    this.keepStoppedUnlessStarted();
  }

  /** The state of the transport: running only while it plays, not while a note sounds with it stopped. */
  get state(): AudioContextState {
    return this.context.state === "running" && !this.shouldRun ? "suspended" : this.context.state;
  }

  /** What reaches the outputs, as a stream a `MediaRecorder` can record. */
  get recordingStream(): MediaStream {
    return this.recording.stream;
  }

  subscribe = (listener: () => void) => {
    this.context.addEventListener("statechange", listener);
    this.listeners.add(listener);
    return () => {
      this.context.removeEventListener("statechange", listener);
      this.listeners.delete(listener);
    };
  };

  /** Lets the notes played while stopped sound, without starting the transport. */
  setSoundWhileStopped(on: boolean) {
    this.soundWhileStopped = on;
    if (!on && this.sounding) {
      this.quiet();
      void this.context.suspend();
    }
  }

  /** Starts the sound, with sequencers back on their first step and the nodes a song stopped playing again. */
  async start() {
    const wasRunning = this.context.state === "running";
    this.shouldRun = true;
    this.quiet();
    if (this.started) {
      this.renewRinging();
    }
    this.started = true;
    await this.context.resume();
    if (wasRunning) {
      this.listeners.forEach((listener) => listener());
    }
    this.fadeOutputs(1, this.context.currentTime, false);
    this.transport.restart();
    this.resumeStopped();
    if (this.songStart !== undefined && this.song) {
      this.songPlayer.start(this.song, this.songStart);
    }
  }

  async stop() {
    this.shouldRun = false;
    this.quiet();
    this.transport.pause();
    this.songPlayer.stop();
    this.releaseControls();
    await this.context.suspend();
  }

  /**
   * Stops the sound and lets go of every module and cable, so that the next patch starts afresh:
   * a node of another piece with the same id gets a module of its own, without the tail or the
   * pattern of the one before.
   */
  async reset() {
    const stopping = this.stop();
    this.patch = undefined;
    this.started = false;
    for (const id of [...this.entries.keys()]) {
      this.removeModule(id);
    }
    for (const id of [...this.wires.keys()]) {
      this.disconnect(id);
    }
    this.channelControls.clear();
    this.song = undefined;
    await stopping;
  }

  private keepStoppedUnlessStarted = () => {
    if (this.context.state === "running" && !this.shouldRun && !this.sounding) {
      void this.context.suspend();
    }
  };

  /** Turns the sound on for a note played while stopped, with the transport still stopped. */
  private hold(key: string, heard = false) {
    if (this.shouldRun || (!this.soundWhileStopped && !heard)) {
      return;
    }
    clearTimeout(this.rest);
    this.held.add(key);
    if (this.sounding) {
      return;
    }
    this.sounding = true;
    if (this.started) {
      this.renewRinging();
    }
    this.started = true;
    this.fadeOutputs(1, this.context.currentTime, false);
    void this.context.resume();
  }

  /** Lets a note played while stopped go, and stops the sound a while after the last one, for its tail. */
  private letGo(...keys: string[]) {
    keys.forEach((key) => this.held.delete(key));
    if (!this.sounding || this.held.size > 0) {
      return;
    }
    clearTimeout(this.rest);
    this.rest = setTimeout(() => {
      this.quiet();
      void this.context.suspend();
    }, STOPPED_TAIL_MS);
  }

  private quiet() {
    clearTimeout(this.rest);
    this.sounding = false;
    this.held.clear();
  }

  createModule(node: PatchNode) {
    if (this.entries.has(node.id)) {
      throw new Error(`Module "${node.id}" already exists`);
    }
    this.entries.set(node.id, {
      type: node.type,
      params: { ...node.params },
      patterns: { ...node.patterns },
      module: createAudioModule(this.context, node, this.transport, this.recording, this.samples),
    });
  }

  removeModule(nodeId: NodeId) {
    const entry = this.entries.get(nodeId);
    if (!entry) {
      return;
    }
    for (const { connection } of [...this.wires.values()]) {
      if (connection.source.nodeId === nodeId || connection.target.nodeId === nodeId) {
        this.disconnect(connection.id);
      }
    }
    entry.module.dispose();
    this.entries.delete(nodeId);
    for (const key of this.modulations.keys()) {
      if (key.startsWith(paramKey(nodeId, ""))) {
        this.modulations.delete(key);
      }
    }
  }

  updateParameter(nodeId: NodeId, parameter: string, value: ParamValue) {
    const entry = this.entries.get(nodeId);
    if (!entry) {
      return;
    }
    entry.module.setParameter(parameter, value, this.context.currentTime);
    entry.params[parameter] = value;
  }

  private updatePatterns(entry: Entry, patterns: Patterns) {
    for (const [slot, pattern] of Object.entries(patterns) as [Exclude<PatternSlot, "A1">, Params][]) {
      for (const [name, value] of Object.entries(pattern)) {
        if (entry.patterns[slot]?.[name] !== value) {
          entry.module.setPatternParameter?.(slot, name, value);
        }
      }
    }
    entry.patterns = { ...patterns };
  }

  launchPattern(nodeId: NodeId, slot: Launch, mode?: string, at?: number) {
    this.entries.get(nodeId)?.module.launchPattern?.(slot, mode, at);
  }

  private resumeStopped() {
    for (const { module } of this.entries.values()) {
      const state = module.getPattern?.();
      if (state?.stopped) {
        module.launchPattern?.(state.playing, "now");
      }
    }
  }

  private fadeOutputs(gain: number, time: number, ramp: boolean) {
    for (const { module } of this.entries.values()) {
      module.fade?.(gain, time, ramp);
    }
  }

  /** Turns song mode on, to play the song from `bar` on the next start, or off with undefined. */
  setSongStart(bar: number | undefined) {
    this.songStart = bar;
    if (bar === undefined) {
      this.songPlayer.stop();
      this.releaseControls();
      this.fadeOutputs(1, this.context.currentTime, false);
    }
  }

  /** Where the song is, in beats from its start, while it plays. */
  getSongPosition(): number | undefined {
    return this.songPlayer.bar === undefined ? undefined : this.songPlayer.position;
  }

  /** The value the song gives a control now, while it plays and has set it; undefined otherwise. */
  getControl(key: ControlKey): number | undefined {
    const changes = this.controlChanges.get(key);
    if (!changes || this.state !== "running") {
      return undefined;
    }
    const now = this.context.currentTime;
    return changes.findLast((change) => change.time <= now)?.value;
  }

  /** Leaves a control to the hand, which moves it with setControl, until releaseControl. */
  holdControl(key: ControlKey) {
    this.songPlayer.hold(key);
  }

  setControl(key: ControlKey, value: number) {
    this.applyControl(key, value, this.context.currentTime);
  }

  releaseControl(key: ControlKey) {
    this.songPlayer.release(key);
  }

  /** Lets go of a control and sets it back to the value of the patch, for the song to move it again. */
  resetControl(key: ControlKey) {
    this.songPlayer.release(key);
    this.releaseControls([key]);
  }

  private applyControl(key: ControlKey, value: number | undefined, time: number) {
    const { target, name } = parseControlKey(key);
    const entries = onEveryVoice(this.entries, target).filter((entry) => (value ?? entry.params[name]) !== undefined);
    const channels = onEveryVoice(this.wires, target).filter((wire) => wire.setChannel);
    const amounts = name === AMOUNT ? this.amountWires(target) : [];
    if (entries.length > 0) {
      entries.forEach((entry) => entry.module.setParameter(name, (value ?? entry.params[name])!, time));
    } else if (channels.length > 0) {
      const { [name as ChannelControl]: _previous, ...others } = this.channelControls.get(target) ?? {};
      const controls = value === undefined ? others : { ...others, [name]: value };
      this.channelControls.set(target, controls);
      channels.forEach((wire) => wire.setChannel!(this.withChannelControls(wire.connection, controls), time));
    } else if (amounts.length > 0) {
      amounts.forEach((copy) => copy.setAmount!(value ?? copy.connection.amount ?? 1, time));
    } else {
      return;
    }
    const now = this.context.currentTime;
    const kept = (this.controlChanges.get(key) ?? []).filter((change, index, all) => change.time > now - CONTROL_MEMORY_SECONDS || index === all.length - 1);
    this.controlChanges.set(key, [...kept, { time, value }].sort((a, b) => a.time - b.time));
  }

  /**
   * Makes again the modules that ring on after their sound, and hushes those that can stop what they
   * play, so that a start does not play the tail the stop froze; the others keep their patterns and
   * what they hold.
   */
  private renewRinging() {
    this.entries.forEach(({ module }) => module.hush?.());
    const ringing = [...this.entries].filter(([, entry]) => RINGS[entry.type]).map(([id]) => id);
    if (ringing.length === 0 || !this.patch) {
      return;
    }
    ringing.forEach((id) => this.removeModule(id));
    this.sync(this.patch);
  }

  /** The wires of a control cable, and its copies into the voices of a subpatch. */
  private amountWires(cable: string): Wire[] {
    return [...this.wires]
      .filter(([id, wire]) => wire.setAmount && isCopyOf(withoutVoices(id), cable))
      .map(([, wire]) => wire);
  }

  private withChannelControls(connection: PatchConnection, controls: Partial<Record<ChannelControl, number>>): PatchConnection {
    return {
      ...connection,
      amount: controls.level ?? connection.amount,
      pan: controls.pan ?? connection.pan,
      mute: controls.mute === undefined ? connection.mute : controls.mute >= 0.5,
      solo: controls.solo === undefined ? connection.solo : controls.solo >= 0.5,
    };
  }

  /** Sets the controls the song moved back to the values of the patch, all of them or those given. */
  private releaseControls(keys: Iterable<ControlKey> = [...this.controlChanges.keys()]) {
    const time = this.context.currentTime;
    for (const key of keys) {
      this.applyControl(key, undefined, time);
      this.controlChanges.delete(key);
    }
  }

  /** The bar of the song that plays, while the song does. */
  getSongBar(): number | undefined {
    return this.songPlayer.bar;
  }

  /** Plays a note out of a node that can preview notes, such as a clip, until stopPreview. */
  previewNote(nodeId: NodeId, note: number, velocity?: number) {
    this.hold(`preview ${nodeId}`, true);
    this.entries.get(nodeId)?.module.previewOn?.(note, this.context.currentTime, velocity);
  }

  stopPreview(nodeId: NodeId) {
    this.entries.get(nodeId)?.module.previewOff?.(this.context.currentTime);
    this.letGo(`preview ${nodeId}`);
  }

  getPattern(nodeId: NodeId): PatternState | undefined {
    return this.entries.get(nodeId)?.module.getPattern?.();
  }

  connect(connection: PatchConnection) {
    const source = this.entries.get(connection.source.nodeId);
    const target = this.entries.get(connection.target.nodeId);
    const port = source && flatPortsOf(source).outputs.find(({ id }) => id === connection.source.port);
    const wire = source && target && port && this.wire(port.type, connection, source, target);
    if (!wire) {
      throw new Error(`Cannot connect "${connection.id}"`);
    }
    this.wires.set(connection.id, wire);
  }

  disconnect(connectionId: string) {
    this.wires.get(connectionId)?.dispose();
    this.wires.delete(connectionId);
  }

  setConnectionAmount(connectionId: string, amount: number) {
    const wire = this.wires.get(connectionId);
    if (wire) {
      this.updateWire(wire, { ...wire.connection, amount });
    }
  }

  private updateWire(wire: Wire, connection: PatchConnection) {
    const time = this.context.currentTime;
    if ((wire.connection.amount ?? 1) !== (connection.amount ?? 1)) {
      wire.setAmount?.(connection.amount ?? 1, time);
    }
    wire.setChannel?.(connection, time);
    wire.connection = connection;
  }

  sync(patch: Patch) {
    this.patch = patch;
    if (patch.tempo !== this.transport.tempo) {
      this.transport.setTempo(patch.tempo);
    }
    const swing = patch.swing ?? DEFAULT_SWING;
    if (swing !== this.transport.swing) {
      this.transport.setSwing(swing);
    }
    const swingGrid = patch.swingGrid ?? DEFAULT_SWING_GRID;
    if (swingGrid !== this.transport.swingGrid) {
      this.transport.setSwingGrid(swingGrid);
    }
    const meter = patch.meter ?? DEFAULT_METER;
    if (!sameMeter(meter, this.transport.meter)) {
      this.transport.setMeter(meter);
    }
    if (patch.song !== this.song) {
      this.song = patch.song;
      if (patch.song) {
        this.songPlayer.update(patch.song);
      } else {
        this.songPlayer.stop();
      }
      const lanes = patch.song?.automation ?? {};
      this.releaseControls([...this.controlChanges.keys()].filter((key) => !(key in lanes) && !this.songPlayer.isHeld(key)));
    }
    const nodes = new Map(patch.nodes.map((node) => [node.id, node]));
    const connections = new Map(patch.connections.map((connection) => [connection.id, connection]));

    for (const [id, { connection }] of this.wires) {
      const wanted = connections.get(id);
      if (!wanted || !sameEndpoints(wanted, connection)) {
        this.disconnect(id);
      }
    }
    for (const [id, entry] of this.entries) {
      if (nodes.get(id)?.type !== entry.type) {
        this.removeModule(id);
      }
    }
    for (const node of patch.nodes) {
      const entry = this.entries.get(node.id);
      if (!entry) {
        this.createModule(node);
        continue;
      }
      for (const [name, value] of Object.entries(node.params)) {
        if (entry.params[name] !== value) {
          this.updateParameter(node.id, name, value);
        }
      }
      this.updatePatterns(entry, node.patterns ?? {});
    }
    for (const connection of patch.connections) {
      const wire = this.wires.get(connection.id);
      if (!wire) {
        this.connect(connection);
      } else if (!sameSettings(wire.connection, connection)) {
        this.updateWire(wire, connection);
      }
    }
  }

  getAnalyser(nodeId: NodeId): StereoAnalyser | undefined {
    return this.entries.get(nodeId)?.module.getAnalyser?.();
  }

  getProbe(nodeId: NodeId, connectionId: string): StereoAnalyser | undefined {
    return this.entries.get(nodeId)?.module.getProbe?.(connectionId);
  }

  getNotes(nodeId: NodeId): NoteActivity | undefined {
    return this.entries.get(nodeId)?.module.getNotes?.();
  }

  /**
   * How much the control cables add to a param right now, in the units they reach it in (cents for
   * a frequency), while the sound runs; undefined while it is stopped or nothing modulates it.
   */
  getModulation(nodeId: NodeId, port: string): number | undefined {
    const probe = this.modulations.get(paramKey(nodeId, port));
    if (!probe || this.state !== "running") {
      return undefined;
    }
    probe.analyser.getFloatTimeDomainData(probe.samples);
    return probe.samples[probe.samples.length - 1];
  }

  /** Where the transport is, in beats, while the sound runs; undefined while it is stopped. */
  getBeat(): number | undefined {
    return this.state === "running" ? this.transport.beatAt(this.context.currentTime) : undefined;
  }

  getPosition(nodeId: NodeId): number | undefined {
    return this.entries.get(nodeId)?.module.getPosition?.();
  }

  getKeyTranspose(nodeId: NodeId): number | undefined {
    return this.entries.get(nodeId)?.module.getKeyTranspose?.();
  }

  getInputStatus(nodeId: NodeId): InputStatus | undefined {
    return this.entries.get(nodeId)?.module.getInputStatus?.();
  }

  isOutputMuted(nodeId: NodeId): boolean {
    return this.entries.get(nodeId)?.module.isMuted?.() ?? false;
  }

  unmuteOutput(nodeId: NodeId) {
    this.entries.get(nodeId)?.module.unmute?.();
  }

  /** How many voices a subpatch has and the most its notes needed at once, by the Ins of notes of its first voice. */
  getVoiceUsage(nodeId: NodeId): VoiceUsage | undefined {
    const usages = [...this.entries]
      .filter(([id]) => id.startsWith(`${nodeId}/`) && !id.slice(nodeId.length + 1).includes("/"))
      .flatMap(([, { module }]) => module.getVoiceUsage?.() ?? []);
    if (usages.length === 0) {
      return undefined;
    }
    return { voices: usages[0].voices, needed: Math.max(...usages.map((usage) => usage.needed)) };
  }

  getSample(nodeId: NodeId): SamplerState | undefined {
    return this.entries.get(nodeId)?.module.getSample?.();
  }

  noteOn(note: number, velocity?: number) {
    this.hold(`note ${note}`);
    this.forEachNoteReceiver((receiver) => receiver.noteOn(note, this.context.currentTime, velocity));
  }

  noteOff(note: number) {
    this.forEachNoteReceiver((receiver) => receiver.noteOff(note, this.context.currentTime));
    this.letGo(`note ${note}`);
  }

  allNotesOff() {
    this.forEachNoteReceiver((receiver) => receiver.allNotesOff(this.context.currentTime));
    this.letGo(...[...this.held].filter((key) => key.startsWith("note ")));
  }

  private wire(
    type: PortType,
    connection: PatchConnection,
    source: Entry,
    target: Entry,
  ): Wire | undefined {
    const { source: from, target: to } = connection;
    switch (type) {
      case "audio": {
        const output = source.module.getAudioOutput(from.port);
        const input = output && this.openInput(target, to.port, connection.id);
        if (!output || !input) {
          return undefined;
        }
        output.connect(input);
        const module = target.module;
        const setChannel =
          module.setChannel &&
          ((next: PatchConnection, time: number) => module.setChannel!(connection.id, channelOf(next), time));
        setChannel?.(connection, this.context.currentTime);
        return {
          connection,
          dispose: () => {
            output.disconnect(input);
            target.module.closeInput?.(connection.id);
          },
          ...(setChannel && { setChannel }),
        };
      }
      case "control": {
        const output = source.module.getAudioOutput(from.port);
        const input = output && target.module.openInput?.(to.port, connection.id);
        const param = target.module.getAudioParam?.(to.port);
        const definition = moduleRegistry[target.type].params.find(({ id }) => id === to.port);
        const range = input ? 1 : definition?.kind === "number" ? definition.modulationRange : undefined;
        if (!output || !(input ?? param) || range === undefined) {
          return undefined;
        }
        const scaler = this.context.createGain();
        scaler.gain.value = range * (connection.amount ?? 1);
        output.connect(scaler);
        if (input) {
          scaler.connect(input);
        } else {
          scaler.connect(param!);
          scaler.connect(this.modulationProbe(to.nodeId, to.port));
        }
        return {
          connection,
          dispose: () => {
            output.disconnect(scaler);
            scaler.disconnect();
            if (input) {
              target.module.closeInput?.(connection.id);
            }
          },
          setAmount: (amount, time) => glide(scaler.gain, range * amount, time),
        };
      }
      case "trigger": {
        const output = source.module.getTriggerOutput?.(from.port);
        const input = output && (target.module.openTrigger?.(to.port, connection.id) ?? target.module.getTriggerInput?.(to.port));
        if (!output || !input) {
          return undefined;
        }
        output.connect(input);
        return {
          connection,
          dispose: () => {
            output.disconnect(input);
            target.module.closeTrigger?.(connection.id);
          },
        };
      }
      case "notes": {
        const output = source.module.getNoteOutput?.(from.port);
        const input = target.module.getNoteInput?.(to.port);
        if (!output || !input) {
          return undefined;
        }
        output.connect(input);
        return {
          connection,
          dispose: () => {
            output.disconnect(input);
            input.allNotesOff(this.context.currentTime);
          },
        };
      }
    }
  }

  private modulationProbe(nodeId: NodeId, port: string): AnalyserNode {
    const key = paramKey(nodeId, port);
    let probe = this.modulations.get(key);
    if (!probe) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = MODULATION_PROBE_SIZE;
      probe = { analyser, samples: new Float32Array(MODULATION_PROBE_SIZE) };
      this.modulations.set(key, probe);
    }
    return probe.analyser;
  }

  private openInput(target: Entry, port: string, connectionId: string) {
    return target.module.openInput?.(port, connectionId) ?? target.module.getAudioInput(port);
  }

  private forEachNoteReceiver(action: (receiver: NoteReceiver) => void) {
    for (const { module } of this.entries.values()) {
      if (isNoteReceiver(module)) {
        action(module);
      }
    }
  }
}
