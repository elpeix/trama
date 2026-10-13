import { describe, expect, it } from "vitest";
import { parseMidiMessage } from "./midiMessage";

describe("parseMidiMessage", () => {
  it("reads a note on, with its channel from 1 and its velocity", () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: "noteOn", channel: 1, note: 60, velocity: 100 });
    expect(parseMidiMessage([0x9f, 61, 1])).toEqual({ type: "noteOn", channel: 16, note: 61, velocity: 1 });
  });

  it("reads a note off, and a note on with velocity 0 as one", () => {
    expect(parseMidiMessage([0x82, 60, 64])).toEqual({ type: "noteOff", channel: 3, note: 60 });
    expect(parseMidiMessage([0x90, 60, 0])).toEqual({ type: "noteOff", channel: 1, note: 60 });
  });

  it("reads a control change", () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toEqual({ type: "control", channel: 1, control: 64, value: 127 });
  });

  it("reads the pitch wheel from -1 down to 1 up, 0 in the middle", () => {
    expect(parseMidiMessage([0xe0, 0, 0])).toEqual({ type: "bend", channel: 1, amount: -1 });
    expect(parseMidiMessage([0xe0, 0, 64])).toEqual({ type: "bend", channel: 1, amount: 0 });
    expect(parseMidiMessage([0xe0, 127, 127])).toEqual({ type: "bend", channel: 1, amount: 1 });
  });

  it("leaves out the messages of the system, the ones it does not use, and the ones too short", () => {
    expect(parseMidiMessage([0xf8])).toBeUndefined();
    expect(parseMidiMessage([0xf0, 1, 2, 0xf7])).toBeUndefined();
    expect(parseMidiMessage([0xc0, 5, 0])).toBeUndefined();
    expect(parseMidiMessage([0x90, 60])).toBeUndefined();
    expect(parseMidiMessage([60, 100])).toBeUndefined();
    expect(parseMidiMessage([])).toBeUndefined();
  });
});
