import chorus from "../modules/processing/chorus.worklet.ts?worker&url";
import flanger from "../modules/processing/flanger.worklet.ts?worker&url";
import phaser from "../modules/processing/phaser.worklet.ts?worker&url";
import envelopeFollower from "../modules/modulation/envelopeFollower.worklet.ts?worker&url";
import granulator from "../modules/processing/granulator.worklet.ts?worker&url";
import math from "../modules/modulation/math.worklet.ts?worker&url";
import slew from "../modules/modulation/slew.worklet.ts?worker&url";
import sampleHold from "../modules/modulation/sampleHold.worklet.ts?worker&url";
import physicalModel from "../modules/sources/physicalModel.worklet.ts?worker&url";
import pitchShifter from "../modules/processing/pitchShifter.worklet.ts?worker&url";
import spectralFreeze from "../modules/processing/spectralFreeze.worklet.ts?worker&url";
import vco from "../modules/sources/vco.worklet.ts?worker&url";
import ladder from "../modules/processing/ladder.worklet.ts?worker&url";
import modal from "../modules/sources/modal.worklet.ts?worker&url";
import piano from "../modules/sources/piano.worklet.ts?worker&url";
import wind from "../modules/sources/wind.worklet.ts?worker&url";
import strings from "../modules/sources/strings.worklet.ts?worker&url";
import outputLimiter from "../modules/output/limiter.worklet.ts?worker&url";

export async function loadWorklets(context: BaseAudioContext) {
  await Promise.all(
    [physicalModel, pitchShifter, spectralFreeze, granulator, sampleHold, math, slew, envelopeFollower, chorus, flanger, phaser, vco, ladder, modal, piano, wind, strings, outputLimiter].map((url) => context.audioWorklet.addModule(url)),
  );
}
