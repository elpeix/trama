/**
 * Holds the value of its input at the frames it is told to sample, until the next one; without an
 * input, a random value from -1 to 1.
 */
export class SampleHold {
  private readonly random: () => number;
  private readonly frames: number[] = [];
  private held = 0;

  constructor(random = Math.random) {
    this.random = random;
  }

  sample(frame: number) {
    const index = this.frames.findIndex((pending) => pending > frame);
    this.frames.splice(index === -1 ? this.frames.length : index, 0, frame);
  }

  process(input: Float32Array | undefined, output: Float32Array, startFrame: number) {
    for (let index = 0; index < output.length; index++) {
      while (this.frames.length > 0 && this.frames[0] <= startFrame + index) {
        this.frames.shift();
        this.held = input ? input[index] : this.random() * 2 - 1;
      }
      output[index] = this.held;
    }
  }
}
