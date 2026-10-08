import { beforeEach, describe, expect, it } from "vitest";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { FilterModule } from "./FilterModule";

let context: FakeAudioContext;
let filter: FilterModule;

beforeEach(() => {
  context = new FakeAudioContext();
  filter = new FilterModule(context.asAudioContext(), { type: "lowpass", frequency: 400, Q: 4 });
});

describe("FilterModule", () => {
  it("modulates the frequency exponentially through the detune", () => {
    expect(filter.getAudioParam("frequency")).toBe(context.filters[0].detune);
  });

  it("modulates the Q linearly", () => {
    expect(filter.getAudioParam("Q")).toBe(context.filters[0].Q);
  });

  it("keeps the base frequency on the Freq param", () => {
    filter.setParameter("frequency", 800, 1);

    expect(context.filters[0].frequency.value).toBe(800);
    expect(context.filters[0].detune.value).toBe(0);
  });
});
