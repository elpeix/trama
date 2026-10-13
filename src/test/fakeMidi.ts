/** A MIDI keyboard, plugged in or not, that sends the bytes it is given. */
export class FakeMidiInput extends EventTarget {
  readonly type = "input";
  state: "connected" | "disconnected" = "connected";
  readonly id: string;
  readonly name: string;

  constructor(id: string, name: string) {
    super();
    this.id = id;
    this.name = name;
  }

  send(...data: number[]) {
    this.dispatchEvent(Object.assign(new Event("midimessage"), { data: new Uint8Array(data) }));
  }
}

/** The MIDI devices of the computer, where keyboards can be plugged in and out. */
export class FakeMidiAccess extends EventTarget {
  readonly inputs = new Map<string, FakeMidiInput>();

  plug(input: FakeMidiInput) {
    input.state = "connected";
    this.inputs.set(input.id, input);
    this.dispatchEvent(Object.assign(new Event("statechange"), { port: input }));
  }

  unplug(input: FakeMidiInput) {
    input.state = "disconnected";
    this.dispatchEvent(Object.assign(new Event("statechange"), { port: input }));
  }

  asMidiAccess() {
    return this as unknown as MIDIAccess;
  }
}

/** Lets the promise of the access settle. */
export const settle = () => new Promise((resolve) => setTimeout(resolve));
