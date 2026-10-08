import { FLANGER_PROCESSOR } from "../../worklets/names";
import { FLANGER_MAX_DELAY_MS } from "../../../patch/effects";
import { Flanger, type FlangerSettings } from "./flanger";
import { registerStereoEffect } from "./stereoEffectProcessor";

registerStereoEffect<FlangerSettings>(
  FLANGER_PROCESSOR,
  [
    { name: "rate", defaultValue: 0.3, minValue: 0 },
    { name: "depth", defaultValue: 0.7, minValue: 0, maxValue: 1 },
    { name: "delay", defaultValue: 2, minValue: 0, maxValue: FLANGER_MAX_DELAY_MS },
    { name: "feedback", defaultValue: 0.5, minValue: -0.95, maxValue: 0.95 },
    { name: "mix", defaultValue: 0.5, minValue: 0, maxValue: 1 },
  ],
  (sampleRate, phase) => new Flanger(sampleRate, phase),
);
