import { unknownParameter, type AudioModule } from "../AudioModule";

const LENGTH_SECONDS = 2;

export class NoiseModule implements AudioModule {
  private readonly source: AudioBufferSourceNode;

  constructor(context: BaseAudioContext) {
    const buffer = context.createBuffer(1, LENGTH_SECONDS * context.sampleRate, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.random() * 2 - 1;
    }
    this.source = context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.start();
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.source : undefined;
  }

  setParameter(name: string) {
    unknownParameter("Noise", name);
  }

  dispose() {
    this.source.stop();
    this.source.disconnect();
  }
}
