import { describe, expect, it } from "vitest";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { NoiseModule } from "./NoiseModule";

describe("NoiseModule", () => {
  it("loops two seconds of white noise", () => {
    const context = new FakeAudioContext();
    const noise = new NoiseModule(context.asAudioContext());

    const [source] = context.bufferSources;
    const samples = source.buffer!.getChannelData();
    expect(source.loop).toBe(true);
    expect(source.started).toBe(true);
    expect(source.buffer!.length).toBe(2 * context.sampleRate);
    expect(samples.every((sample) => sample >= -1 && sample <= 1)).toBe(true);
    expect(new Set(samples).size).toBeGreaterThan(100);
    expect(noise.getAudioOutput("audio")).toBe(source);
  });

  it("stops on dispose", () => {
    const context = new FakeAudioContext();
    const noise = new NoiseModule(context.asAudioContext());

    noise.dispose();

    expect(context.bufferSources[0].stopped).toBe(true);
  });
});
