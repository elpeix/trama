export type AutomationEvent =
  | { type: "setTarget"; value: number; time: number }
  | { type: "setValue"; value: number; time: number }
  | { type: "linearRamp"; value: number; time: number }
  | { type: "cancel"; time: number };

export class FakeAudioParam {
  value: number;
  readonly events: AutomationEvent[] = [];

  constructor(value: number) {
    this.value = value;
  }

  setTargetAtTime(value: number, time: number) {
    this.events.push({ type: "setTarget", value, time });
    this.value = value;
    return this;
  }

  setValueAtTime(value: number, time: number) {
    this.events.push({ type: "setValue", value, time });
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ type: "linearRamp", value, time });
    this.value = value;
    return this;
  }

  cancelScheduledValues(time: number) {
    this.events.push({ type: "cancel", time });
    return this;
  }
}

type Destination = FakeAudioNode | FakeAudioParam;

export class FakeAudioNode {
  readonly outputs = new Set<Destination>();
  channelCount = 2;
  channelCountMode: ChannelCountMode = "max";
  channelInterpretation: ChannelInterpretation = "speakers";

  connect(destination: Destination) {
    this.outputs.add(destination);
    return destination;
  }

  disconnect(destination?: Destination) {
    if (destination === undefined) {
      this.outputs.clear();
      return;
    }
    if (!this.outputs.delete(destination)) {
      throw new DOMException("not connected", "InvalidAccessError");
    }
  }
}

class FakeScheduledSourceNode extends FakeAudioNode {
  started = false;
  stopped = false;
  startTime: number | undefined;
  stopTime: number | undefined;
  onended: (() => void) | null = null;

  start(time = 0) {
    this.started = true;
    this.startTime = time;
  }

  stop(time = 0) {
    this.stopped = true;
    this.stopTime = time;
  }
}

export class FakePeriodicWave {
  readonly real: Float32Array;
  readonly imag: Float32Array;

  constructor(real: Float32Array, imag: Float32Array) {
    this.real = real;
    this.imag = imag;
  }
}

export class FakeOscillatorNode extends FakeScheduledSourceNode {
  type = "sine";
  readonly frequency = new FakeAudioParam(440);
  readonly detune = new FakeAudioParam(0);
  periodicWave: FakePeriodicWave | undefined;

  setPeriodicWave(wave: FakePeriodicWave) {
    this.periodicWave = wave;
    this.type = "custom";
  }
}

export class FakeConstantSourceNode extends FakeScheduledSourceNode {
  readonly offset = new FakeAudioParam(1);
}

export class FakeAudioBuffer {
  readonly length: number;
  readonly sampleRate: number;
  private readonly channels: Float32Array[];

  constructor(length: number, sampleRate: number, numberOfChannels = 1) {
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  get numberOfChannels() {
    return this.channels.length;
  }

  get duration() {
    return this.length / this.sampleRate;
  }

  getChannelData(channel = 0) {
    return this.channels[channel];
  }
}

export class FakeAudioBufferSourceNode extends FakeScheduledSourceNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly detune = new FakeAudioParam(0);
  readonly playbackRate = new FakeAudioParam(1);
  offset: number | undefined;
  duration: number | undefined;

  start(time = 0, offset?: number, duration?: number) {
    super.start(time);
    this.offset = offset;
    this.duration = duration;
  }
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  type = "lowpass";
  readonly frequency = new FakeAudioParam(350);
  readonly Q = new FakeAudioParam(1);
  readonly gain = new FakeAudioParam(0);
  readonly detune = new FakeAudioParam(0);
}

export class FakeConvolverNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  normalize = true;
}

export class FakeWaveShaperNode extends FakeAudioNode {
  curve: Float32Array | null = null;
  oversample: OverSampleType = "none";
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {
  readonly threshold = new FakeAudioParam(-24);
  readonly knee = new FakeAudioParam(30);
  readonly ratio = new FakeAudioParam(12);
  readonly attack = new FakeAudioParam(0.003);
  readonly release = new FakeAudioParam(0.25);
  reduction = 0;
}

export class FakeStereoPannerNode extends FakeAudioNode {
  readonly pan = new FakeAudioParam(0);
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam(1);
}

export class FakeDelayNode extends FakeAudioNode {
  readonly delayTime = new FakeAudioParam(0);
  readonly maxDelayTime: number;

  constructor(maxDelayTime: number) {
    super();
    this.maxDelayTime = maxDelayTime;
  }
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  readonly context: FakeAudioContext;
  samples = new Float32Array(0);

  constructor(context: FakeAudioContext) {
    super();
    this.context = context;
  }

  getFloatTimeDomainData(array: Float32Array) {
    array.fill(0);
    const tail = this.samples.subarray(Math.max(0, this.samples.length - array.length));
    array.set(tail, array.length - tail.length);
  }
}

/** Splits its channels, each to what its output is connected to: `routes` keeps which output goes where. */
export class FakeChannelSplitterNode extends FakeAudioNode {
  readonly numberOfOutputs: number;
  readonly routes: { output: number; destination: Destination }[] = [];

  constructor(numberOfOutputs: number) {
    super();
    this.numberOfOutputs = numberOfOutputs;
    this.channelCount = numberOfOutputs;
    this.channelCountMode = "explicit";
    this.channelInterpretation = "discrete";
  }

  connect(destination: Destination, output = 0) {
    this.routes.push({ output, destination });
    return super.connect(destination);
  }
}

export class FakeMessagePort {
  readonly messages: unknown[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;

  postMessage(message: unknown) {
    this.messages.push(message);
  }

  /** Delivers a message from the processor, as the audio thread would. */
  receive(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

/** Stands in for the global AudioWorkletNode: stub it with `vi.stubGlobal("AudioWorkletNode", FakeAudioWorkletNode)`. */
export class FakeAudioWorkletNode extends FakeAudioNode {
  readonly name: string;
  readonly options: AudioWorkletNodeOptions;
  readonly parameters: Map<string, FakeAudioParam>;
  readonly port = new FakeMessagePort();

  constructor(context: FakeAudioContext, name: string, options: AudioWorkletNodeOptions = {}) {
    super();
    this.name = name;
    this.options = options;
    this.parameters = new Map(
      Object.entries(options.parameterData ?? {}).map(([param, value]) => [param, new FakeAudioParam(value)]),
    );
    context.workletNodes.push(this);
  }
}

export class FakeMediaStreamAudioSourceNode extends FakeAudioNode {
  readonly mediaStream: MediaStream;

  constructor(mediaStream: MediaStream) {
    super();
    this.mediaStream = mediaStream;
  }
}

export class FakeMediaStreamAudioDestinationNode extends FakeAudioNode {
  readonly stream = { id: "recording" } as unknown as MediaStream;
}

export class FakeAudioContext extends EventTarget {
  currentTime = 0;
  readonly sampleRate = 48000;
  state: AudioContextState = "suspended";
  readonly destination = new FakeAudioNode();
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly constantSources: FakeConstantSourceNode[] = [];
  readonly bufferSources: FakeAudioBufferSourceNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly delays: FakeDelayNode[] = [];
  readonly analysers: FakeAnalyserNode[] = [];
  readonly splitters: FakeChannelSplitterNode[] = [];
  readonly mediaStreamDestinations: FakeMediaStreamAudioDestinationNode[] = [];
  readonly mediaStreamSources: FakeMediaStreamAudioSourceNode[] = [];
  readonly workletNodes: FakeAudioWorkletNode[] = [];
  readonly stereoPanners: FakeStereoPannerNode[] = [];
  readonly convolvers: FakeConvolverNode[] = [];
  readonly waveShapers: FakeWaveShaperNode[] = [];
  readonly compressors: FakeDynamicsCompressorNode[] = [];

  createOscillator() {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  }

  createPeriodicWave(real: Float32Array, imag: Float32Array) {
    return new FakePeriodicWave(Float32Array.from(real), Float32Array.from(imag));
  }

  createConstantSource() {
    const node = new FakeConstantSourceNode();
    this.constantSources.push(node);
    return node;
  }

  createBuffer(channels: number, length: number, sampleRate: number) {
    return new FakeAudioBuffer(length, sampleRate, channels);
  }

  /** Decodes a file of the length its first byte gives, in tenths of a second; rejects an empty one. */
  async decodeAudioData(data: ArrayBuffer) {
    const bytes = new Uint8Array(data);
    if (bytes.length === 0) {
      throw new DOMException("Unable to decode audio data", "EncodingError");
    }
    return new FakeAudioBuffer((bytes[0] * this.sampleRate) / 10, this.sampleRate);
  }

  createBufferSource() {
    const node = new FakeAudioBufferSourceNode();
    this.bufferSources.push(node);
    return node;
  }

  createBiquadFilter() {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createConvolver() {
    const node = new FakeConvolverNode();
    this.convolvers.push(node);
    return node;
  }

  createWaveShaper() {
    const node = new FakeWaveShaperNode();
    this.waveShapers.push(node);
    return node;
  }

  createDynamicsCompressor() {
    const node = new FakeDynamicsCompressorNode();
    this.compressors.push(node);
    return node;
  }

  createStereoPanner() {
    const node = new FakeStereoPannerNode();
    this.stereoPanners.push(node);
    return node;
  }

  createGain() {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createDelay(maxDelayTime = 1) {
    const node = new FakeDelayNode(maxDelayTime);
    this.delays.push(node);
    return node;
  }

  createChannelSplitter(numberOfOutputs = 6) {
    const node = new FakeChannelSplitterNode(numberOfOutputs);
    this.splitters.push(node);
    return node;
  }

  createAnalyser() {
    const node = new FakeAnalyserNode(this);
    this.analysers.push(node);
    return node;
  }

  createMediaStreamSource(mediaStream: MediaStream) {
    const node = new FakeMediaStreamAudioSourceNode(mediaStream);
    this.mediaStreamSources.push(node);
    return node;
  }

  createMediaStreamDestination() {
    const node = new FakeMediaStreamAudioDestinationNode();
    this.mediaStreamDestinations.push(node);
    return node;
  }

  async resume() {
    this.changeState("running");
  }

  async suspend() {
    this.changeState("suspended");
  }

  changeState(state: AudioContextState) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }

  asAudioContext() {
    return this as unknown as AudioContext;
  }
}
