import { beforeEach, describe, expect, it } from "vitest";
import { defaultParams } from "../../../patch/registry";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { MIDDLE_C_HZ } from "../../../patch/pitch";
import { OscillatorModule } from "./OscillatorModule";

let context: FakeAudioContext;

beforeEach(() => {
  context = new FakeAudioContext();
});

const create = (mode: string, frequency = 486) =>
  new OscillatorModule(context.asAudioContext(), {
    ...defaultParams("oscillator"),
    mode,
    frequency,
  });

describe("OscillatorModule", () => {
  it("uses the Freq param in free mode", () => {
    create("free");

    expect(context.oscillators[0].frequency.value).toBe(486);
  });

  it("starts at middle C in keyboard mode", () => {
    create("keyboard");

    expect(MIDDLE_C_HZ).toBeCloseTo(261.626, 3);
    expect(context.oscillators[0].frequency.value).toBe(MIDDLE_C_HZ);
  });

  it("switches to middle C when entering keyboard mode", () => {
    const oscillator = create("free");

    oscillator.setParameter("mode", "keyboard", 1);

    expect(context.oscillators[0].frequency.events).toEqual([
      { type: "setTarget", value: MIDDLE_C_HZ, time: 1 },
    ]);
  });

  it("keeps Freq changes for later while in keyboard mode", () => {
    const oscillator = create("keyboard");

    oscillator.setParameter("frequency", 1000, 1);
    expect(context.oscillators[0].frequency.value).toBe(MIDDLE_C_HZ);

    oscillator.setParameter("mode", "free", 2);
    expect(context.oscillators[0].frequency.value).toBe(1000);
  });

  it("modulates the frequency exponentially through the detune", () => {
    const oscillator = create("free");

    expect(oscillator.getAudioParam("frequency")).toBe(context.oscillators[0].detune);
    expect(oscillator.getAudioParam("detune")).toBe(context.oscillators[0].detune);
  });

  describe("drawn and harmonic waves", () => {
    const harmonics = "0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0";
    const createWith = (params: Record<string, string>) =>
      new OscillatorModule(context.asAudioContext(), { ...defaultParams("oscillator"), ...params });
    const wave = () => context.oscillators[0].periodicWave;

    it("plays the shape it is drawn", () => {
      createWith({ waveform: "drawn" });

      expect(context.oscillators[0].type).toBe("custom");
      expect(wave()?.imag[1]).toBeCloseTo(1);
    });

    it("plays the harmonics it is given", () => {
      createWith({ waveform: "harmonics", harmonics });

      expect([...wave()!.imag.slice(0, 4)]).toEqual([0, 0, 1, 0]);
    });

    it("follows the shape while it is drawn", () => {
      const oscillator = createWith({ waveform: "drawn" });

      oscillator.setParameter("shape", Array.from({ length: 64 }, (_, index) => (index < 32 ? "1" : "-1")).join(" "), 1);

      expect(wave()?.imag[1]).toBeCloseTo(4 / Math.PI, 1);
      expect(wave()?.imag[2]).toBeCloseTo(0);
    });

    it("keeps the shape and harmonics for later while playing a classic waveform", () => {
      const oscillator = createWith({ waveform: "sine" });

      oscillator.setParameter("harmonics", harmonics, 1);
      expect(wave()).toBeUndefined();
      expect(context.oscillators[0].type).toBe("sine");

      oscillator.setParameter("waveform", "harmonics", 2);
      expect(wave()?.imag[2]).toBe(1);
    });

    it("goes back to a classic waveform", () => {
      const oscillator = createWith({ waveform: "drawn" });

      oscillator.setParameter("waveform", "square", 1);

      expect(context.oscillators[0].type).toBe("square");
    });
  });
});
