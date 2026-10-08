const DECAY_DB = 60;
const CHANNELS = 2;

/** The response of a room: noise on each side that fades out 60 dB over `decay` seconds. */
export function reverbImpulse(decay: number, sampleRate: number, random = Math.random): Float32Array[] {
  const length = Math.round(decay * sampleRate);
  const fall = (DECAY_DB / 20) * Math.LN10 / (decay * sampleRate);
  return Array.from({ length: CHANNELS }, () =>
    Float32Array.from({ length }, (_, index) => (random() * 2 - 1) * Math.exp(-fall * index)),
  );
}
