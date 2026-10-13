import type { PatchNode } from "../../patch/types";
import type { SampleLibrary } from "../../samples/sampleLibrary";
import { MidiInput } from "../MidiInput";
import type { Transport } from "../Transport";
import type { AudioModule } from "./AudioModule";
import { CustomFilterModule } from "./processing/CustomFilterModule";
import { DelayModule } from "./processing/DelayModule";
import { DistortionModule } from "./processing/DistortionModule";
import { EnvelopeModule } from "./modulation/EnvelopeModule";
import { FilterModule } from "./processing/FilterModule";
import { GainModule } from "./processing/GainModule";
import { GranulatorModule } from "./processing/GranulatorModule";
import { HarmonicsModule } from "./sources/HarmonicsModule";
import { ArpeggiatorModule } from "./notes/ArpeggiatorModule";
import { ClipModule } from "./notes/ClipModule";
import { DrumsModule } from "./notes/DrumsModule";
import { KeyboardModule } from "./notes/KeyboardModule";
import { MidiModule } from "./notes/MidiModule";
import { LfoModule } from "./modulation/LfoModule";
import { MixerModule } from "./processing/MixerModule";
import { NoiseModule } from "./sources/NoiseModule";
import { AudioInputModule } from "./sources/AudioInputModule";
import { SamplerModule } from "./sources/SamplerModule";
import { OscillatorModule } from "./sources/OscillatorModule";
import { OutputModule } from "./output/OutputModule";
import { PortModule } from "./patch/PortModule";
import { PanModule } from "./processing/PanModule";
import { LadderModule } from "./processing/LadderModule";
import { VcoModule } from "./sources/VcoModule";
import { PianoModule } from "./sources/PianoModule";
import { ModalModule } from "./sources/ModalModule";
import { WindModule } from "./sources/WindModule";
import { StringsModule } from "./sources/StringsModule";
import { PhysicalModelModule } from "./sources/PhysicalModelModule";
import { PitchShifterModule } from "./processing/PitchShifterModule";
import { ChorusModule, FlangerModule, PhaserModule } from "./processing/StereoEffectModule";
import { CompressorModule } from "./processing/CompressorModule";
import { ReverbModule } from "./processing/ReverbModule";
import { ClockModule } from "./modulation/ClockModule";
import { MathModule } from "./modulation/MathModule";
import { QuantizerModule } from "./modulation/QuantizerModule";
import { EnvelopeFollowerModule } from "./modulation/EnvelopeFollowerModule";
import { SlewModule } from "./modulation/SlewModule";
import { SampleHoldModule } from "./modulation/SampleHoldModule";
import { ScopeModule } from "./output/ScopeModule";
import { SequencerModule } from "./notes/SequencerModule";
import { SpectralFreezeModule } from "./processing/SpectralFreezeModule";

export function createAudioModule(
  context: BaseAudioContext,
  node: PatchNode,
  transport: Transport,
  recording: AudioNode,
  samples: SampleLibrary,
  midi: MidiInput = new MidiInput(),
): AudioModule {
  switch (node.type) {
    case "oscillator":
      return new OscillatorModule(context, node.params);
    case "vco":
      return new VcoModule(context, node.params);
    case "harmonics":
      return new HarmonicsModule(context, node.params);
    case "piano":
      return new PianoModule(context, node.params);
    case "wind":
      return new WindModule(context, node.params);
    case "strings":
      return new StringsModule(context, node.params);
    case "modal":
      return new ModalModule(context, node.params);
    case "physicalModel":
      return new PhysicalModelModule(context, node.params);
    case "noise":
      return new NoiseModule(context);
    case "audioInput":
      return new AudioInputModule(context, node.params);
    case "sampler":
      return new SamplerModule(context, node.params, samples);
    case "filter":
      return new FilterModule(context, node.params);
    case "ladder":
      return new LadderModule(context, node.params);
    case "customFilter":
      return new CustomFilterModule(context, node.params);
    case "pitchShifter":
      return new PitchShifterModule(context, node.params);
    case "granulator":
      return new GranulatorModule(context, node.params);
    case "spectralFreeze":
      return new SpectralFreezeModule(context, node.params);
    case "gain":
      return new GainModule(context, node.params);
    case "delay":
      return new DelayModule(context, node.params, transport);
    case "distortion":
      return new DistortionModule(context, node.params);
    case "reverb":
      return new ReverbModule(context, node.params);
    case "compressor":
      return new CompressorModule(context, node.params);
    case "chorus":
      return new ChorusModule(context, node.params);
    case "flanger":
      return new FlangerModule(context, node.params);
    case "phaser":
      return new PhaserModule(context, node.params);
    case "lfo":
      return new LfoModule(context, node.params, transport);
    case "envelope":
      return new EnvelopeModule(context, node.params);
    case "sampleHold":
      return new SampleHoldModule(context, node.params, transport);
    case "clock":
      return new ClockModule(context, node.params, transport);
    case "quantizer":
      return new QuantizerModule(context, node.params);
    case "math":
      return new MathModule(context, node.params);
    case "slew":
      return new SlewModule(context, node.params);
    case "envelopeFollower":
      return new EnvelopeFollowerModule(context, node.params);
    case "keyboard":
      return new KeyboardModule(context, node.params);
    case "midiInput":
      return new MidiModule(context, node.params, midi);
    case "arpeggiator":
      return new ArpeggiatorModule(context, node.params, transport, undefined, node.patterns);
    case "sequencer":
      return new SequencerModule(context, node.params, transport, node.patterns);
    case "clip":
      return new ClipModule(context, node.params, transport, node.patterns);
    case "drums":
      return new DrumsModule(context, node.params, transport, node.patterns);
    case "mixer":
      return new MixerModule(context, node.params);
    case "pan":
      return new PanModule(context, node.params);
    case "inlet":
    case "outlet":
      return new PortModule(context, node.params);
    case "subpatch":
      throw new Error("A subpatch is flattened before it reaches the engine");
    case "output":
      return new OutputModule(context, node.params, recording);
    case "scope":
      return new ScopeModule(context);
  }
}
