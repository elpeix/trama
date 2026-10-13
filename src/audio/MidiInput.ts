/** Whether the MIDI devices can be heard: waiting for permission, listening, blocked, or not in this browser. */
export type MidiStatus = "asking" | "on" | "denied" | "unavailable";

/** What the MIDI input is doing, and the names of the devices connected to it. */
export interface MidiState {
  status: MidiStatus;
  devices: string[];
}

export interface MidiListener {
  /** A message from any of the devices. */
  message(data: Uint8Array): void;
  /** A device went away, maybe in the middle of a note, which then never ends. */
  lost(): void;
}

type RequestAccess = () => Promise<MIDIAccess>;

const BLOCKED = ["NotAllowedError", "SecurityError"];

const browserRequest = (): RequestAccess | undefined => {
  const navigator = globalThis.navigator;
  return navigator?.requestMIDIAccess ? () => navigator.requestMIDIAccess() : undefined;
};

/**
 * The MIDI devices connected to the computer, heard all together. It asks for them only when
 * opened, the first time a module needs them, so a patch without MIDI never asks; devices
 * plugged in later are heard too.
 */
export class MidiInput {
  private readonly request: RequestAccess | undefined;
  private status: MidiStatus | undefined;
  private access: MIDIAccess | undefined;
  private readonly inputs = new Set<MIDIInput>();
  private readonly listeners = new Set<MidiListener>();

  constructor(request: RequestAccess | undefined = browserRequest()) {
    this.request = request;
  }

  get state(): MidiState {
    return {
      status: this.status ?? "asking",
      devices: [...this.inputs].filter((input) => input.state === "connected").map((input) => input.name ?? "MIDI device"),
    };
  }

  /** Asks for the devices, once. */
  open() {
    if (this.status !== undefined) {
      return;
    }
    if (!this.request) {
      this.status = "unavailable";
      return;
    }
    this.status = "asking";
    this.request().then(
      (access) => this.listen(access),
      (error: unknown) => {
        this.status = error instanceof DOMException && BLOCKED.includes(error.name) ? "denied" : "unavailable";
      },
    );
  }

  subscribe(listener: MidiListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private listen(access: MIDIAccess) {
    this.access = access;
    this.status = "on";
    access.inputs.forEach((input) => this.attach(input));
    access.addEventListener("statechange", this.onStateChange);
  }

  private attach(input: MIDIInput) {
    if (this.inputs.has(input)) {
      return;
    }
    this.inputs.add(input);
    input.addEventListener("midimessage", this.onMessage);
  }

  private readonly onMessage = (event: Event) => {
    const { data } = event as MIDIMessageEvent;
    if (data) {
      this.listeners.forEach((listener) => listener.message(data));
    }
  };

  private readonly onStateChange = (event: Event) => {
    const { port } = event as MIDIConnectionEvent;
    if (port?.type !== "input") {
      return;
    }
    if (port.state === "connected") {
      this.attach(this.access?.inputs.get(port.id) ?? (port as MIDIInput));
    } else {
      this.listeners.forEach((listener) => listener.lost());
    }
  };
}
