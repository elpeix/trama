import { describe, expect, it } from "vitest";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { PanModule } from "./PanModule";

const create = (pan = 0) => {
  const context = new FakeAudioContext();
  const module = new PanModule(context.asAudioContext(), { pan });
  return { context, module, panner: context.stereoPanners[0] };
};

describe("PanModule", () => {
  it("places the sound it gets between left and right", () => {
    const { module, panner } = create(-0.4);

    expect(module.getAudioInput("audio")).toBe(panner);
    expect(module.getAudioOutput("audio")).toBe(panner);
    expect(panner.pan.value).toBe(-0.4);
  });

  it("modulates and glides its pan", () => {
    const { module, panner } = create();

    expect(module.getAudioParam("pan")).toBe(panner.pan);
    module.setParameter("pan", 1, 2);

    expect(panner.pan.events).toEqual([{ type: "setTarget", value: 1, time: 2 }]);
    expect(() => module.setParameter("level", 1, 0)).toThrow(/Pan/);
  });

  it("disconnects on dispose", () => {
    const { context, module, panner } = create();
    panner.connect(context.destination);

    module.dispose();

    expect(panner.outputs.size).toBe(0);
  });
});
