import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { defaultParams } from "../../../patch/registry";
import type { Params } from "../../../patch/types";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { MidiInput } from "../../MidiInput";
import { parseMidiMessage } from "../../midiMessage";
import type { NoteReceiver } from "../AudioModule";
import { MidiModule } from "./MidiModule";

let context: FakeAudioContext;
let midi: MidiInput;
let module: MidiModule;
let gate: { gateOn: Mock<(time: number) => void>; gateOff: Mock<(time: number) => void> };
let notes: { noteOn: Mock<NoteReceiver["noteOn"]>; noteOff: Mock<NoteReceiver["noteOff"]>; allNotesOff: Mock<NoteReceiver["allNotesOff"]> };

const create = (params: Params = {}) => {
  module = new MidiModule(context.asAudioContext(), { ...defaultParams("midiInput"), ...params }, midi);
  gate = { gateOn: vi.fn(), gateOff: vi.fn() };
  notes = { noteOn: vi.fn(), noteOff: vi.fn(), allNotesOff: vi.fn() };
  module.getTriggerOutput("gate")!.connect(gate);
  module.getNoteOutput("notes")!.connect(notes);
};

beforeEach(() => {
  context = new FakeAudioContext();
  midi = new MidiInput(undefined);
  create();
});

/** Sends the bytes of a MIDI message to the module, at `time`. */
const send = (time: number, ...data: number[]) => module.receiveMidi(parseMidiMessage(data)!, time);

const [keysPitch, velocity, bend, mod, pedal] = [0, 1, 2, 3, 4].map((index) => () => context.constantSources[index]);

describe("MidiModule", () => {
  it("opens the MIDI input, and shows what it is doing", () => {
    expect(module.getMidiState()).toEqual({ status: "unavailable", devices: [] });
  });

  it("plays the notes of the devices on pitch, gate, velocity and notes, the last key held sounding", () => {
    send(1, 0x90, 67, 127);
    send(2, 0x90, 60, 64);
    send(3, 0x80, 60, 0);

    expect(keysPitch().offset.events).toEqual([
      { type: "setValue", value: 7 / 12, time: 1 },
      { type: "setValue", value: 0, time: 2 },
      { type: "setValue", value: 7 / 12, time: 3 },
    ]);
    expect(velocity().offset.value).toBe(1);
    expect(gate.gateOn).toHaveBeenCalledTimes(2);
    expect(gate.gateOff).not.toHaveBeenCalled();
    expect(notes.noteOn.mock.calls).toEqual([
      [67, 1, 127],
      [60, 2, 64],
    ]);
    expect(notes.noteOff).toHaveBeenCalledWith(60, 3);
    expect(module.getNotes()).toEqual({ notes: [67], playing: 67 });
  });

  it("sums the pitch of the keys and the pitch wheel on pitch", () => {
    const [pitch] = context.gains;

    expect(module.getAudioOutput("pitch")).toBe(pitch);
    expect(keysPitch().outputs.has(pitch)).toBe(true);
    expect(bend().outputs.has(pitch)).toBe(true);
  });

  it("bends by Bend semitones each way, also when Bend changes with the wheel moved", () => {
    send(1, 0xe0, 127, 127);
    expect(bend().offset.value).toBeCloseTo(2 / 12);

    module.setParameter("bend", 12, 2);
    expect(bend().offset.value).toBeCloseTo(1);

    send(3, 0xe0, 0, 0);
    expect(bend().offset.value).toBeCloseTo(-1);
  });

  it("transposes the notes, ending each one with the note it started", () => {
    module.setParameter("transpose", -12, 0);
    send(1, 0x90, 60, 100);
    module.setParameter("transpose", 5, 2);
    send(3, 0x80, 60, 0);

    expect(notes.noteOn).toHaveBeenCalledWith(48, 1, 100);
    expect(notes.noteOff).toHaveBeenCalledWith(48, 3);
  });

  it("hears one channel only when set to it, and ends its notes when it changes", () => {
    create({ channel: "2" });

    send(1, 0x90, 60, 100);
    send(1, 0x91, 62, 100);
    expect(notes.noteOn.mock.calls).toEqual([[62, 1, 100]]);

    module.setParameter("channel", "all", 2);
    expect(notes.allNotesOff).toHaveBeenCalledWith(2);
    send(3, 0x90, 60, 100);
    expect(notes.noteOn).toHaveBeenCalledWith(60, 3, 100);
  });

  it("puts out the mod wheel and the sustain pedal from 0 to 1", () => {
    send(1, 0xb0, 1, 127);
    send(2, 0xb0, 64, 127);

    expect(module.getAudioOutput("mod")).toBe(mod());
    expect(module.getAudioOutput("pedal")).toBe(pedal());
    expect(mod().offset.value).toBe(1);
    expect(pedal().offset.value).toBe(1);
  });

  it("holds the notes let go while the pedal is down, until it comes up", () => {
    send(1, 0xb0, 64, 127);
    send(2, 0x90, 60, 100);
    send(3, 0x80, 60, 0);
    expect(notes.noteOff).not.toHaveBeenCalled();
    expect(gate.gateOff).not.toHaveBeenCalled();

    send(4, 0xb0, 64, 0);
    expect(notes.noteOff).toHaveBeenCalledWith(60, 4);
    expect(gate.gateOff).toHaveBeenCalledWith(4);
  });

  it("keeps a held note sounding when the pedal comes up, though it was held before", () => {
    send(1, 0xb0, 64, 127);
    send(2, 0x90, 60, 100);
    send(3, 0x80, 60, 0);
    send(4, 0x90, 60, 90);
    send(5, 0xb0, 64, 0);

    expect(notes.noteOff).not.toHaveBeenCalled();
    expect(module.getNotes().notes).toEqual([60]);
  });

  it("ends every note on all notes off, all sound off, or a device gone", () => {
    for (const [time, end] of [
      [1, () => send(1, 0xb0, 123, 0)],
      [2, () => send(2, 0xb0, 120, 0)],
      [3, () => module.releaseMidi(3)],
    ] as const) {
      send(time, 0x90, 60, 100);
      end();
      expect(notes.allNotesOff).toHaveBeenLastCalledWith(time);
      expect(module.getNotes().notes).toEqual([]);
    }
  });

  it("is not played by the computer keys", () => {
    expect("noteOn" in module).toBe(false);
  });

  it("stops and disconnects its sources when disposed", () => {
    module.dispose();

    expect(context.constantSources.every((source) => source.stopped && source.outputs.size === 0)).toBe(true);
  });
});
