import { describe, expect, it } from "vitest";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { MixerModule } from "./MixerModule";

const create = (level = 1) => {
  const context = new FakeAudioContext();
  const mixer = new MixerModule(context.asAudioContext(), { level });
  return { context, mixer, master: context.gains[0] };
};

const channel = (context: FakeAudioContext, index: number) => ({
  level: context.gains[1 + index * 3],
  gate: context.gains[2 + index * 3],
  pan: context.stereoPanners[index],
  meter: context.gains[3 + index * 3],
  probe: { left: context.analysers[index * 2], right: context.analysers[index * 2 + 1] },
});

describe("MixerModule", () => {
  it("sends everything through its level to its output", () => {
    const { mixer, master } = create(0.7);

    expect(mixer.getAudioOutput("audio")).toBe(master);
    expect(master.gain.value).toBe(0.7);
    expect(mixer.getAudioParam("level")).toBe(master.gain);
    expect(mixer.getAudioInput()).toBeUndefined();
  });

  it("meters each side of what it sends out, once asked for it", () => {
    const { context, mixer, master } = create();

    const analyser = mixer.getAnalyser();

    expect(analyser).toEqual({ left: context.analysers[0], right: context.analysers[1] });
    expect(master.outputs.has(context.gains[1])).toBe(true);
    expect(mixer.getAnalyser()).toBe(analyser);
    expect(context.analysers).toHaveLength(2);
  });

  it("gives each cable a channel of its own: a level, a pan, a stereo meter after them, and a gate", () => {
    const { context, mixer, master } = create();

    const input = mixer.openInput("audio", "c1");
    mixer.openInput("audio", "c2");

    const first = channel(context, 0);
    expect(input).toBe(first.level);
    expect(first.level.outputs.has(first.pan)).toBe(true);
    expect(first.pan.outputs.has(first.meter)).toBe(true);
    expect(first.pan.outputs.has(first.gate)).toBe(true);
    expect(first.gate.outputs.has(master)).toBe(true);
    expect(channel(context, 1).gate.outputs.has(master)).toBe(true);
    expect(mixer.getProbe("c1")).toEqual(first.probe);
    expect(mixer.openInput("level", "c3")).toBeUndefined();
  });

  it("glides a channel to its level", () => {
    const { context, mixer } = create();
    mixer.openInput("audio", "c1");

    mixer.setChannel("c1", { level: 0.4, pan: 0, mute: false, solo: false }, 2);

    expect(channel(context, 0).level.gain.events).toEqual([{ type: "setTarget", value: 0.4, time: 2 }]);
  });

  it("glides a channel to its pan", () => {
    const { context, mixer } = create();
    mixer.openInput("audio", "c1");

    mixer.setChannel("c1", { level: 1, pan: -0.5, mute: false, solo: false }, 2);

    expect(channel(context, 0).pan.pan.events).toEqual([{ type: "setTarget", value: -0.5, time: 2 }]);
  });

  it("silences a muted channel, after its meter", () => {
    const { context, mixer } = create();
    mixer.openInput("audio", "c1");
    mixer.openInput("audio", "c2");

    mixer.setChannel("c1", { level: 1, pan: 0, mute: true, solo: false }, 0);

    expect(channel(context, 0).gate.gain.value).toBe(0);
    expect(channel(context, 1).gate.gain.value).toBe(1);
  });

  it("plays only the channels in solo while there is one", () => {
    const { context, mixer } = create();
    for (const id of ["c1", "c2", "c3"]) {
      mixer.openInput("audio", id);
    }

    mixer.setChannel("c2", { level: 1, pan: 0, mute: false, solo: true }, 0);

    expect([0, 1, 2].map((index) => channel(context, index).gate.gain.value)).toEqual([0, 1, 0]);
  });

  it("keeps a muted channel silent even in solo", () => {
    const { context, mixer } = create();
    mixer.openInput("audio", "c1");
    mixer.openInput("audio", "c2");

    mixer.setChannel("c1", { level: 1, pan: 0, mute: true, solo: true }, 0);

    expect([0, 1].map((index) => channel(context, index).gate.gain.value)).toEqual([0, 0]);
  });

  it("lets the other channels play again when the last one in solo goes", () => {
    const { context, mixer } = create();
    mixer.openInput("audio", "c1");
    mixer.openInput("audio", "c2");
    mixer.setChannel("c2", { level: 1, pan: 0, mute: false, solo: true }, 0);

    mixer.closeInput("c2");

    expect(channel(context, 0).gate.gain.value).toBe(1);
    expect(channel(context, 1).gate.outputs.size).toBe(0);
    expect(mixer.getProbe("c2")).toBeUndefined();
  });

  it("glides to a new level", () => {
    const { mixer, master } = create();

    mixer.setParameter("level", 0.25, 3);

    expect(master.gain.events).toEqual([{ type: "setTarget", value: 0.25, time: 3 }]);
    expect(() => mixer.setParameter("pan", 0, 0)).toThrow(/Mixer/);
  });

  it("disconnects everything on dispose", () => {
    const { context, mixer, master } = create();
    mixer.openInput("audio", "c1");

    mixer.dispose();

    expect(master.outputs.size).toBe(0);
    expect(channel(context, 0).gate.outputs.size).toBe(0);
    expect(channel(context, 0).pan.outputs.size).toBe(0);
  });
});
