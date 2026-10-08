import { CHORUS_PROCESSOR } from "../../worklets/names";
import { CHORUS_MAX_DELAY_MS, CHORUS_MAX_VOICES } from "../../../patch/effects";
import { Chorus, type ChorusSettings } from "./chorus";
import { registerStereoEffect } from "./stereoEffectProcessor";

registerStereoEffect<ChorusSettings>(
  CHORUS_PROCESSOR,
  [
    { name: "rate", defaultValue: 0.8, minValue: 0 },
    { name: "depth", defaultValue: 0.5, minValue: 0, maxValue: 1 },
    { name: "delay", defaultValue: 18, minValue: 0, maxValue: CHORUS_MAX_DELAY_MS },
    { name: "voices", defaultValue: 2, minValue: 1, maxValue: CHORUS_MAX_VOICES },
    { name: "mix", defaultValue: 0.5, minValue: 0, maxValue: 1 },
  ],
  (sampleRate, phase) => new Chorus(sampleRate, phase),
);
