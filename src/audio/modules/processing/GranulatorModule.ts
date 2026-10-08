import type { Params, ParamValue } from "../../../patch/types";
import { GRANULATOR_PROCESSOR, type ProcessorMessage } from "../../worklets/names";
import { glide, unknownParameter, type AudioModule } from "../AudioModule";

const GLIDED = ["position", "size", "density", "pitch", "spread", "mix"];
const MODULATED = ["position", "pitch", "spread"];

const frozen = (value: ParamValue) => (value === "on" ? 1 : 0);

export class GranulatorModule implements AudioModule {
  private readonly node: AudioWorkletNode;

  constructor(context: BaseAudioContext, params: Params) {
    this.node = new AudioWorkletNode(context, GRANULATOR_PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      parameterData: {
        ...Object.fromEntries(GLIDED.map((name) => [name, Number(params[name])])),
        freeze: frozen(params.freeze),
      },
    });
  }

  getAudioInput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioOutput(port: string) {
    return port === "audio" ? this.node : undefined;
  }

  getAudioParam(port: string) {
    return MODULATED.includes(port) ? this.param(port) : undefined;
  }

  setParameter(name: string, value: ParamValue, time: number) {
    if (GLIDED.includes(name)) {
      return glide(this.param(name), value, time);
    }
    if (name === "freeze") {
      this.param(name).setValueAtTime(frozen(value), time);
      return;
    }
    unknownParameter("Granulator", name);
  }

  dispose() {
    this.node.disconnect();
    this.post({ type: "stop" });
  }

  private param(name: string) {
    return this.node.parameters.get(name)!;
  }

  private post(message: ProcessorMessage) {
    this.node.port.postMessage(message);
  }
}
