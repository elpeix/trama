import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeMidiAccess, FakeMidiInput, settle } from "../test/fakeMidi";
import { MidiInput } from "./MidiInput";

let access: FakeMidiAccess;
let keyboard: FakeMidiInput;
let request: ReturnType<typeof vi.fn<() => Promise<MIDIAccess>>>;

beforeEach(() => {
  access = new FakeMidiAccess();
  keyboard = new FakeMidiInput("a", "Keystation");
  access.inputs.set(keyboard.id, keyboard);
  request = vi.fn(() => Promise.resolve(access.asMidiAccess()));
});

const listen = (midi: MidiInput) => {
  const listener = { message: vi.fn<(data: Uint8Array) => void>(), lost: vi.fn() };
  midi.subscribe(listener);
  return listener;
};

describe("MidiInput", () => {
  it("does not ask for the devices until opened, and asks only once", async () => {
    const midi = new MidiInput(request);
    expect(request).not.toHaveBeenCalled();

    midi.open();
    midi.open();
    expect(midi.state).toEqual({ status: "asking", devices: [] });
    await settle();

    expect(request).toHaveBeenCalledTimes(1);
    expect(midi.state).toEqual({ status: "on", devices: ["Keystation"] });
  });

  it("passes on the messages of every device", async () => {
    const midi = new MidiInput(request);
    const listener = listen(midi);
    midi.open();
    await settle();

    keyboard.send(0x90, 60, 100);

    expect(listener.message).toHaveBeenCalledWith(new Uint8Array([0x90, 60, 100]));
  });

  it("hears a device plugged in later, once, and says when one goes away", async () => {
    const midi = new MidiInput(request);
    const listener = listen(midi);
    midi.open();
    await settle();
    const pads = new FakeMidiInput("b", "Pads");

    access.plug(pads);
    access.plug(pads);
    pads.send(0x99, 36, 90);
    expect(listener.message).toHaveBeenCalledTimes(1);
    expect(midi.state.devices).toEqual(["Keystation", "Pads"]);

    access.unplug(keyboard);
    expect(listener.lost).toHaveBeenCalledTimes(1);
    expect(midi.state.devices).toEqual(["Pads"]);
  });

  it("stops passing messages on to a listener that unsubscribed", async () => {
    const midi = new MidiInput(request);
    const listener = { message: vi.fn(), lost: vi.fn() };
    const unsubscribe = midi.subscribe(listener);
    midi.open();
    await settle();

    unsubscribe();
    keyboard.send(0x90, 60, 100);

    expect(listener.message).not.toHaveBeenCalled();
  });

  it("is denied when the browser blocks MIDI, and unavailable when it has none or fails", async () => {
    const blocked = new MidiInput(() => Promise.reject(new DOMException("no", "NotAllowedError")));
    const failing = new MidiInput(() => Promise.reject(new Error("broken")));
    const missing = new MidiInput(undefined);

    [blocked, failing, missing].forEach((midi) => midi.open());
    await settle();

    expect(blocked.state.status).toBe("denied");
    expect(failing.state.status).toBe("unavailable");
    expect(missing.state.status).toBe("unavailable");
  });
});
