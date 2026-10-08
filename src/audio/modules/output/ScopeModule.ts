import { unknownParameter, type AudioModule } from "../AudioModule";
import { createStereoAnalyser, type StereoAnalyser } from "../stereoAnalyser";

const FFT_SIZE = 32768;
const INPUTS = new Set(["audio", "control"]);

/** Gives every incoming connection its own analyser for each side, so each one is drawn as a separate trace. */
export class ScopeModule implements AudioModule {
  private readonly context: BaseAudioContext;
  private readonly probes = new Map<string, StereoAnalyser>();

  constructor(context: BaseAudioContext) {
    this.context = context;
  }

  getAudioInput() {
    return undefined;
  }

  getAudioOutput() {
    return undefined;
  }

  openInput(port: string, connectionId: string) {
    if (!INPUTS.has(port)) {
      return undefined;
    }
    const { input, analyser } = createStereoAnalyser(this.context, FFT_SIZE);
    this.probes.set(connectionId, analyser);
    return input;
  }

  closeInput(connectionId: string) {
    this.probes.delete(connectionId);
  }

  getProbe(connectionId: string) {
    return this.probes.get(connectionId);
  }

  setParameter(name: string) {
    // Time, range and the reference trace are all drawn by the display, not heard.
    if (name !== "time" && name !== "range" && name !== "trigger") {
      unknownParameter("Scope", name);
    }
  }

  dispose() {
    this.probes.clear();
  }
}
