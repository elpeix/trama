/** A radix-2 fast Fourier transform, in place, for one size that is a power of two. */
export class Fft {
  private readonly size: number;
  private readonly reversed: Uint32Array;
  private readonly cosines: Float64Array;
  private readonly sines: Float64Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`The size of an FFT must be a power of two, not ${size}`);
    }
    this.size = size;
    const bits = Math.log2(size);
    this.reversed = Uint32Array.from({ length: size }, (_, index) => {
      let reversed = 0;
      for (let bit = 0; bit < bits; bit++) {
        reversed = (reversed << 1) | ((index >> bit) & 1);
      }
      return reversed;
    });
    this.cosines = Float64Array.from({ length: size / 2 }, (_, index) => Math.cos((2 * Math.PI * index) / size));
    this.sines = Float64Array.from({ length: size / 2 }, (_, index) => Math.sin((2 * Math.PI * index) / size));
  }

  forward(real: Float64Array, imag: Float64Array) {
    this.transform(real, imag, -1);
  }

  inverse(real: Float64Array, imag: Float64Array) {
    this.transform(real, imag, 1);
    for (let index = 0; index < this.size; index++) {
      real[index] /= this.size;
      imag[index] /= this.size;
    }
  }

  private transform(real: Float64Array, imag: Float64Array, sign: number) {
    const size = this.size;
    for (let index = 0; index < size; index++) {
      const other = this.reversed[index];
      if (other > index) {
        const swappedReal = real[index];
        real[index] = real[other];
        real[other] = swappedReal;
        const swappedImag = imag[index];
        imag[index] = imag[other];
        imag[other] = swappedImag;
      }
    }
    for (let span = 2; span <= size; span *= 2) {
      const half = span / 2;
      const stride = size / span;
      for (let start = 0; start < size; start += span) {
        for (let offset = 0; offset < half; offset++) {
          const cos = this.cosines[offset * stride];
          const sin = sign * this.sines[offset * stride];
          const even = start + offset;
          const odd = even + half;
          const oddReal = real[odd] * cos - imag[odd] * sin;
          const oddImag = real[odd] * sin + imag[odd] * cos;
          real[odd] = real[even] - oddReal;
          imag[odd] = imag[even] - oddImag;
          real[even] += oddReal;
          imag[even] += oddImag;
        }
      }
    }
  }
}
