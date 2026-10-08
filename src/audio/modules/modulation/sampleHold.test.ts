import { describe, expect, it } from "vitest";
import { SampleHold } from "./sampleHold";

const block = (length = 8) => new Float32Array(length);
const ramp = (length = 8) => Float32Array.from({ length }, (_, index) => index / 10);

describe("SampleHold", () => {
  it("stays at 0 until the first sample", () => {
    const hold = new SampleHold();
    const output = block();

    hold.process(ramp(), output, 0);

    expect([...output]).toEqual(Array(8).fill(0));
  });

  it("takes the input at the frame of the sample and holds it until the next one", () => {
    const hold = new SampleHold();
    const output = block();
    hold.sample(6);
    hold.sample(2);

    hold.process(ramp(), output, 0);

    expect([...output].map((value) => Number(value.toFixed(2)))).toEqual([0, 0, 0.2, 0.2, 0.2, 0.2, 0.6, 0.6]);
  });

  it("keeps holding across blocks, and takes a sample due in a later one there", () => {
    const hold = new SampleHold();
    const first = block();
    const second = block();
    hold.sample(3);
    hold.sample(10);

    hold.process(ramp(), first, 0);
    hold.process(ramp(), second, 8);

    expect(Number(second[0].toFixed(2))).toBe(0.3);
    expect(Number(second[2].toFixed(2))).toBe(0.2);
  });

  it("takes a sample already past at the start of the block", () => {
    const hold = new SampleHold();
    const output = block();
    hold.sample(1);

    hold.process(block().fill(0.9), output, 16);

    expect(Number(output[0].toFixed(2))).toBe(0.9);
    expect(Number(output[7].toFixed(2))).toBe(0.9);
  });

  it("holds a random value from -1 to 1 without an input", () => {
    const values = [0.75, 0.1];
    const hold = new SampleHold(() => values.shift()!);
    const output = block();
    hold.sample(0);
    hold.sample(4);

    hold.process(undefined, output, 0);

    expect([...output].map((value) => Number(value.toFixed(2)))).toEqual([0.5, 0.5, 0.5, 0.5, -0.8, -0.8, -0.8, -0.8]);
  });
});
