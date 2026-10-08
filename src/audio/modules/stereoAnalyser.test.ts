import { describe, expect, it } from "vitest";
import { FakeAudioContext } from "../../test/fakeAudioContext";
import { createStereoAnalyser } from "./stereoAnalyser";

describe("createStereoAnalyser", () => {
  it("splits what it is fed into a left and a right analyser", () => {
    const context = new FakeAudioContext();

    const { input, analyser } = createStereoAnalyser(context.asAudioContext(), 1024);

    const [splitter] = context.splitters;
    const [left, right] = context.analysers;
    expect(input).toBe(context.gains[0]);
    expect(context.gains[0].outputs.has(splitter)).toBe(true);
    expect(splitter.numberOfOutputs).toBe(2);
    expect(splitter.routes).toEqual([
      { output: 0, destination: left },
      { output: 1, destination: right },
    ]);
    expect(analyser).toEqual({ left, right });
    expect([left.fftSize, right.fftSize]).toEqual([1024, 1024]);
  });

  it("spreads a mono signal on both sides, so it shows on the left and the right alike", () => {
    const context = new FakeAudioContext();

    createStereoAnalyser(context.asAudioContext(), 1024);

    expect(context.gains[0]).toMatchObject({ channelCount: 2, channelCountMode: "explicit", channelInterpretation: "speakers" });
  });
});
