/** What a sample needs to be drawn: an AudioBuffer, or anything with channels like it. */
export interface SampleChannels {
  readonly numberOfChannels: number;
  readonly length: number;
  getChannelData(channel: number): Float32Array;
}

export interface Peak {
  min: number;
  max: number;
}

/**
 * The lowest and the highest value of each of `columns` slices of a sample, over all its channels:
 * enough to draw its shape, however long it is.
 */
export function samplePeaks(sample: SampleChannels, columns: number): Peak[] {
  const channels = Array.from({ length: sample.numberOfChannels }, (_, channel) => sample.getChannelData(channel));
  return Array.from({ length: columns }, (_, column) => {
    const from = Math.floor((column * sample.length) / columns);
    const to = Math.max(from + 1, Math.floor(((column + 1) * sample.length) / columns));
    let min = 0;
    let max = 0;
    for (const data of channels) {
      for (let index = from; index < Math.min(to, sample.length); index++) {
        min = Math.min(min, data[index]);
        max = Math.max(max, data[index]);
      }
    }
    return { min: Math.max(-1, min), max: Math.min(1, max) };
  });
}
