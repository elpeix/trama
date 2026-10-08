export interface WaveCoefficients {
  real: Float32Array;
  imag: Float32Array;
}

/**
 * The harmonics of one cycle drawn as evenly spaced points, as many as half the points: the
 * cosines in `real` and the sines in `imag`, without the offset.
 */
export function shapeWave(samples: readonly number[]): WaveCoefficients {
  const count = samples.length;
  const harmonics = Math.floor(count / 2);
  const real = new Float32Array(harmonics);
  const imag = new Float32Array(harmonics);
  for (let harmonic = 1; harmonic < harmonics; harmonic++) {
    let cosines = 0;
    let sines = 0;
    samples.forEach((sample, index) => {
      const phase = (2 * Math.PI * harmonic * index) / count;
      cosines += sample * Math.cos(phase);
      sines += sample * Math.sin(phase);
    });
    real[harmonic] = (2 * cosines) / count;
    imag[harmonic] = (2 * sines) / count;
  }
  return { real, imag };
}

/** A sine for each level, from the fundamental up. */
export function harmonicsWave(levels: readonly number[]): WaveCoefficients {
  const imag = new Float32Array(levels.length + 1);
  imag.set(levels, 1);
  return { real: new Float32Array(levels.length + 1), imag };
}
