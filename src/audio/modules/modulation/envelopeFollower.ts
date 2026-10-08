/**
 * Follows the level of a sound: the louder of its channels at each frame, smoothed on the way up
 * over `attack` seconds and on the way down over `release` seconds, and multiplied by `gain`.
 * Each time is how long it takes to go nearly two thirds of the way; with none, it follows at once.
 */
export class EnvelopeFollower {
  private readonly sampleRate: number;
  private level = 0;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  process(channels: Float32Array[], output: Float32Array, attack: number, release: number, gain: number) {
    const rising = this.keep(attack);
    const falling = this.keep(release);
    for (let index = 0; index < output.length; index++) {
      const peak = channels.reduce((louder, channel) => Math.max(louder, Math.abs(channel[index])), 0);
      const keep = peak > this.level ? rising : falling;
      this.level = peak + keep * (this.level - peak);
      output[index] = this.level * gain;
    }
  }

  private keep(seconds: number) {
    return seconds > 0 ? Math.exp(-1 / (seconds * this.sampleRate)) : 0;
  }
}
