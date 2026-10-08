import { describe, expect, it } from "vitest";
import { Fft } from "./fft";

const SIZE = 64;

const randomSignal = () => Float64Array.from({ length: SIZE }, (_, index) => Math.sin(index * 12.9898) * 43758.5453 % 1);

function naiveDft(real: Float64Array, imag: Float64Array) {
  const outReal = new Float64Array(real.length);
  const outImag = new Float64Array(real.length);
  for (let bin = 0; bin < real.length; bin++) {
    for (let index = 0; index < real.length; index++) {
      const angle = (-2 * Math.PI * bin * index) / real.length;
      outReal[bin] += real[index] * Math.cos(angle) - imag[index] * Math.sin(angle);
      outImag[bin] += real[index] * Math.sin(angle) + imag[index] * Math.cos(angle);
    }
  }
  return { outReal, outImag };
}

describe("Fft", () => {
  it("gives the same spectrum as the plain transform", () => {
    const real = randomSignal();
    const imag = randomSignal().reverse();
    const { outReal, outImag } = naiveDft(real, imag);

    new Fft(SIZE).forward(real, imag);

    real.forEach((value, bin) => expect(value).toBeCloseTo(outReal[bin], 9));
    imag.forEach((value, bin) => expect(value).toBeCloseTo(outImag[bin], 9));
  });

  it("gets the signal back with the inverse", () => {
    const signal = randomSignal();
    const real = Float64Array.from(signal);
    const imag = new Float64Array(SIZE);
    const fft = new Fft(SIZE);

    fft.forward(real, imag);
    fft.inverse(real, imag);

    real.forEach((value, index) => expect(value).toBeCloseTo(signal[index], 9));
    imag.forEach((value) => expect(value).toBeCloseTo(0, 9));
  });

  it("only takes sizes that are powers of two", () => {
    expect(() => new Fft(48)).toThrow();
  });
});
