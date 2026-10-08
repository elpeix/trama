import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { KeyboardModule } from "./KeyboardModule";

let context: FakeAudioContext;
let keyboard: KeyboardModule;
let gate: { gateOn: Mock<(time: number) => void>; gateOff: Mock<(time: number) => void> };

beforeEach(() => {
  context = new FakeAudioContext();
  keyboard = new KeyboardModule(context.asAudioContext(), { transpose: 0 });
  gate = { gateOn: vi.fn(), gateOff: vi.fn() };
  keyboard.getTriggerOutput("gate")!.connect(gate);
});

const pitch = () => context.constantSources[0].offset;

describe("KeyboardModule", () => {
  it("outputs a started pitch source at middle C", () => {
    expect(keyboard.getAudioOutput("pitch")).toBe(context.constantSources[0]);
    expect(context.constantSources[0].started).toBe(true);
    expect(pitch().value).toBe(0);
  });

  it("sets the pitch in octaves from middle C and opens the gate", () => {
    keyboard.noteOn(67, 2);

    expect(pitch().events).toEqual([{ type: "setValue", value: 7 / 12, time: 2 }]);
    expect(gate.gateOn).toHaveBeenCalledWith(2);
  });

  it("transposes the pitch by semitones", () => {
    keyboard.setParameter("transpose", 7);
    keyboard.noteOn(60, 0);

    expect(pitch().value).toBe(7 / 12);
  });

  it("retriggers on a new note", () => {
    keyboard.noteOn(60, 0);
    keyboard.noteOn(64, 1);

    expect(pitch().value).toBe(4 / 12);
    expect(gate.gateOn).toHaveBeenCalledTimes(2);
  });

  it("outputs how hard the note sounding was played, from 0 to 1, going back with the key held before", () => {
    const velocity = context.constantSources[1];
    expect(keyboard.getAudioOutput("velocity")).toBe(velocity);

    keyboard.noteOn(60, 0, 127);
    keyboard.noteOn(64, 1);
    keyboard.noteOff(64, 2);

    expect(velocity.offset.events).toEqual([
      { type: "setValue", value: 1, time: 0 },
      { type: "setValue", value: 100 / 127, time: 1 },
      { type: "setValue", value: 1, time: 2 },
    ]);
  });

  it("falls back to the previous held note without closing the gate", () => {
    keyboard.noteOn(60, 0);
    keyboard.noteOn(64, 1);

    keyboard.noteOff(64, 2);

    expect(pitch().value).toBe(0);
    expect(gate.gateOff).not.toHaveBeenCalled();
  });

  it("closes the gate when the last note is released", () => {
    keyboard.noteOn(60, 0);

    keyboard.noteOff(60, 1);

    expect(gate.gateOff).toHaveBeenCalledWith(1);
  });

  it("ignores releasing a note that is not held", () => {
    keyboard.noteOff(60, 1);

    expect(gate.gateOff).not.toHaveBeenCalled();
  });

  it("releases every note at once", () => {
    keyboard.noteOn(60, 0);
    keyboard.noteOn(64, 0);

    keyboard.allNotesOff(1);
    keyboard.noteOff(60, 2);

    expect(gate.gateOff).toHaveBeenCalledTimes(1);
    expect(gate.gateOff).toHaveBeenCalledWith(1);
  });

  it("stops notifying a disconnected gate", () => {
    keyboard.getTriggerOutput("gate")!.disconnect(gate);

    keyboard.noteOn(60, 0);

    expect(gate.gateOn).not.toHaveBeenCalled();
  });

  it("throws on an unknown parameter", () => {
    expect(() => keyboard.setParameter("nope", 1)).toThrow();
  });

  it("stops on dispose", () => {
    keyboard.dispose();

    expect(context.constantSources[0].stopped).toBe(true);
  });

  describe("notes", () => {
    const receiver = () => ({ noteOn: vi.fn(), noteOff: vi.fn(), allNotesOff: vi.fn() });

    it("sends every key on, transposed, for the voices of a subpatch", () => {
      const voices = receiver();
      keyboard.getNoteOutput("notes")!.connect(voices);
      keyboard.setParameter("transpose", 2);

      keyboard.noteOn(60, 1);
      keyboard.noteOn(64, 2, 40);

      expect(voices.noteOn.mock.calls).toEqual([
        [62, 1, 100],
        [66, 2, 40],
      ]);
    });

    it("releases the note it sent, even when the transpose changed since", () => {
      const voices = receiver();
      keyboard.getNoteOutput("notes")!.connect(voices);
      keyboard.noteOn(60, 1);

      keyboard.setParameter("transpose", 5);
      keyboard.noteOff(60, 2);
      keyboard.noteOff(60, 3);

      expect(voices.noteOff.mock.calls).toEqual([[60, 2]]);
    });

    it("stops every note at once", () => {
      const voices = receiver();
      keyboard.getNoteOutput("notes")!.connect(voices);
      keyboard.noteOn(60, 1);

      keyboard.allNotesOff(4);

      expect(voices.allNotesOff).toHaveBeenCalledWith(4);
    });

    it("stops sending to a disconnected receiver", () => {
      const voices = receiver();
      const notes = keyboard.getNoteOutput("notes")!;
      notes.connect(voices);
      notes.disconnect(voices);

      keyboard.noteOn(60, 1);

      expect(voices.noteOn).not.toHaveBeenCalled();
      expect(keyboard.getNoteOutput("pitch")).toBeUndefined();
    });
  });

  it("tells the keys held and the one sounding, the last one pressed", () => {
    keyboard.setParameter("transpose", 2);
    expect(keyboard.getNotes()).toEqual({ notes: [] });

    keyboard.noteOn(60, 0);
    keyboard.noteOn(64, 0);
    expect(keyboard.getNotes()).toEqual({ notes: [62, 66], playing: 66 });

    keyboard.noteOff(64, 1);
    expect(keyboard.getNotes()).toEqual({ notes: [62], playing: 62 });
  });
});
