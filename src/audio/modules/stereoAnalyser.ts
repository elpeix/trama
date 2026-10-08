/** The two sides of a signal, each with an analyser of its own, to meter or draw them apart. */
export interface StereoAnalyser {
  left: AnalyserNode;
  right: AnalyserNode;
}

/**
 * An analyser for each side of what reaches `input`. A mono signal is spread on both sides first,
 * as the speakers would play it, so it shows the same on the left and the right.
 */
export function createStereoAnalyser(context: BaseAudioContext, fftSize: number): { input: GainNode; analyser: StereoAnalyser } {
  const input = context.createGain();
  input.channelCount = 2;
  input.channelCountMode = "explicit";
  input.channelInterpretation = "speakers";
  const splitter = context.createChannelSplitter(2);
  const left = context.createAnalyser();
  const right = context.createAnalyser();
  left.fftSize = fftSize;
  right.fftSize = fftSize;
  input.connect(splitter);
  splitter.connect(left, 0);
  splitter.connect(right, 1);
  return { input, analyser: { left, right } };
}
