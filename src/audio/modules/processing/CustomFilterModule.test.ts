import { beforeEach, describe, expect, it } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { CustomFilterModule } from "./CustomFilterModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
});

const response = (gains: number[]) => [...gains, ...Array(16 - gains.length).fill(0)].join(" ");

const create = (gains: number[] = []) =>
  new CustomFilterModule(context.asAudioContext(), { ...defaultParams("customFilter"), response: response(gains) });

describe("CustomFilterModule", () => {
  it("is a chain of 16 bands, from the first filter to the last", () => {
    const filter = create();

    expect(context.filters).toHaveLength(16);
    expect(filter.getAudioInput("audio")).toBe(context.filters[0]);
    expect(filter.getAudioOutput("audio")).toBe(context.filters[15]);
    context.filters.slice(0, -1).forEach((band, index) => {
      expect(band.outputs).toEqual(new Set([context.filters[index + 1]]));
    });
  });

  it("spreads the bands evenly over the octaves from 25 Hz to 20 kHz", () => {
    create();

    const frequencies = context.filters.map((band) => band.frequency.value);
    expect(frequencies[0]).toBeCloseTo(25);
    expect(frequencies[15]).toBeCloseTo(20000);
    const ratios = frequencies.slice(1).map((frequency, index) => frequency / frequencies[index]);
    ratios.forEach((ratio) => expect(ratio).toBeCloseTo(ratios[0]));
    expect(context.filters.every((band) => band.type === "peaking")).toBe(true);
  });

  it("gives each band the gain drawn for it", () => {
    create([6, -12]);

    expect(context.filters.map((band) => band.gain.value).slice(0, 3)).toEqual([6, -12, 0]);
  });

  it("glides the bands to a new curve", () => {
    const filter = create();

    filter.setParameter("response", response([3]), 2);

    expect(context.filters[0].gain.events).toEqual([{ type: "setTarget", value: 3, time: 2 }]);
    expect(context.filters[1].gain.events).toEqual([{ type: "setTarget", value: 0, time: 2 }]);
  });

  it("rejects a param it does not have", () => {
    expect(() => create().setParameter("Q", 1, 0)).toThrow(/Custom Filter/);
  });
});
