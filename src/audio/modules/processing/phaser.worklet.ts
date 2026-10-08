import { PHASER_PROCESSOR } from "../../worklets/names";
import { PHASER_MAX_STAGES } from "../../../patch/effects";
import { Phaser, type PhaserSettings } from "./phaser";
import { registerStereoEffect } from "./stereoEffectProcessor";

registerStereoEffect<PhaserSettings>(
  PHASER_PROCESSOR,
  [
    { name: "rate", defaultValue: 0.5, minValue: 0 },
    { name: "depth", defaultValue: 0.7, minValue: 0, maxValue: 1 },
    { name: "frequency", defaultValue: 700, minValue: 20, maxValue: 20000 },
    { name: "stages", defaultValue: 4, minValue: 2, maxValue: PHASER_MAX_STAGES },
    { name: "feedback", defaultValue: 0.3, minValue: -0.95, maxValue: 0.95 },
    { name: "mix", defaultValue: 0.5, minValue: 0, maxValue: 1 },
  ],
  (sampleRate, phase) => new Phaser(sampleRate, phase),
);
