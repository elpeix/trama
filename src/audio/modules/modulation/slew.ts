/**
 * Follows its input at no more than a steady rate: 1 up in `rise` seconds and 1 down in `fall`
 * seconds, jumping at once with none. It starts at the first value it gets; without an input, it
 * slides to 0.
 */
export class Slew {
  private readonly sampleRate: number;
  private value: number | undefined;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  process(input: Float32Array | undefined, output: Float32Array, rise: number, fall: number) {
    const up = rise > 0 ? 1 / (rise * this.sampleRate) : Infinity;
    const down = fall > 0 ? 1 / (fall * this.sampleRate) : Infinity;
    for (let index = 0; index < output.length; index++) {
      const target = input ? input[index] : 0;
      const current = this.value ?? target;
      this.value = target > current ? Math.min(target, current + up) : Math.max(target, current - down);
      output[index] = this.value;
    }
  }
}
