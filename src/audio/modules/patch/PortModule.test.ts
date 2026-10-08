import { describe, expect, it } from "vitest";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { PortModule } from "./PortModule";

describe("PortModule", () => {
  it("lets sound and control through, as one node for its input and its output", () => {
    const context = new FakeAudioContext();
    const port = new PortModule(context.asAudioContext(), { value: 0 });
    const pass = context.gains[0];

    expect(port.getAudioInput("in")).toBe(pass);
    expect(port.openInput("in")).toBe(pass);
    expect(port.getAudioOutput("out")).toBe(pass);
    expect(port.getAudioInput("out")).toBeUndefined();
    expect(pass.gain.value).toBe(1);
  });

  it("adds its value to the control that goes through it, and glides to a new one", () => {
    const context = new FakeAudioContext();
    const port = new PortModule(context.asAudioContext(), { value: 0.25 });
    const [offset] = context.constantSources;

    expect(offset.offset.value).toBe(0.25);
    expect(offset.started).toBe(true);
    expect(offset.outputs.has(context.gains[0])).toBe(true);

    port.setParameter("value", -0.5, 2);
    expect(offset.offset.events).toEqual([{ type: "setTarget", value: -0.5, time: 2 }]);
  });

  it("passes the gates on", () => {
    const context = new FakeAudioContext();
    const port = new PortModule(context.asAudioContext(), { value: 0 });
    const received: number[] = [];
    port.getTriggerOutput("out")!.connect({ gateOn: (time) => received.push(time), gateOff: () => {} });

    port.getTriggerInput("in")!.gateOn(1.5);

    expect(received).toEqual([1.5]);
  });

  it("does not mind what signal it carries, which only shapes its ports", () => {
    const context = new FakeAudioContext();
    const port = new PortModule(context.asAudioContext(), { value: 0 });

    expect(() => port.setParameter("signal", "trigger", 0)).not.toThrow();
    expect(() => port.setParameter("level", 1, 0)).toThrow(/Port/);
  });

  describe("carrying notes", () => {
    const voiceOf = (params: Record<string, number>) => {
      const context = new FakeAudioContext();
      const port = new PortModule(context.asAudioContext(), { value: 0, ...params });
      const gate = { on: [] as number[], off: [] as number[] };
      port.getTriggerOutput("gate")!.connect({ gateOn: (time) => gate.on.push(time), gateOff: (time) => gate.off.push(time) });
      return { context, port, gate, notes: port.getNoteInput("in")!, pitch: context.constantSources[1] };
    };

    it("turns the notes it receives into a pitch, in octaves from middle C, and a gate", () => {
      const { port, gate, notes, pitch } = voiceOf({});

      expect(port.getAudioOutput("pitch")).toBe(pitch);
      expect(pitch.started).toBe(true);
      notes.noteOn(67, 2);
      notes.noteOff(67, 3);

      expect(pitch.offset.events).toEqual([{ type: "setValue", value: 7 / 12, time: 2 }]);
      expect(gate).toEqual({ on: [2], off: [3] });
    });

    it("outputs how hard the note of its voice is played, from 0 to 1", () => {
      const { port, notes, context } = voiceOf({});
      const velocity = context.constantSources[2];

      expect(port.getAudioOutput("velocity")).toBe(velocity);
      notes.noteOn(67, 2, 127);
      notes.noteOn(69, 3);

      expect(velocity.offset.events).toEqual([
        { type: "setValue", value: 1, time: 2 },
        { type: "setValue", value: 100 / 127, time: 3 },
      ]);
    });

    it("plays one note at a time on its own, the last one", () => {
      const { gate, notes, pitch } = voiceOf({});

      notes.noteOn(60, 1);
      notes.noteOn(64, 2);
      notes.noteOff(60, 3);
      notes.noteOff(64, 4);

      expect(pitch.offset.value).toBe(4 / 12);
      expect(gate).toEqual({ on: [1, 2], off: [4] });
    });

    it("plays only the notes that fall to its voice, of all the voices of the subpatch", () => {
      const { gate, notes, pitch } = voiceOf({ voice: 2, voices: 3 });

      notes.noteOn(60, 1);
      notes.noteOn(64, 2);
      notes.noteOn(67, 3);
      notes.noteOff(60, 4);
      notes.noteOff(64, 5);

      expect(pitch.offset.events).toEqual([{ type: "setValue", value: 4 / 12, time: 2 }]);
      expect(gate).toEqual({ on: [2], off: [5] });
    });

    it("glides the note of its voice into another one, with no new gate", () => {
      const { gate, notes, pitch } = voiceOf({ voice: 2, voices: 2 });
      notes.noteOn(60, 1);
      notes.noteOn(64, 1);

      notes.glide!(60, 62, 2, 0.3);
      notes.glide!(64, 67, 2, 0.3);
      notes.noteOff(67, 3);

      expect(pitch.offset.events).toEqual([
        { type: "setValue", value: 4 / 12, time: 1 },
        { type: "setTarget", value: 7 / 12, time: 2 },
      ]);
      expect(gate).toEqual({ on: [1], off: [3] });
    });

    it("jumps into the new note of a glide with no time", () => {
      const { notes, pitch } = voiceOf({});
      notes.noteOn(60, 1);

      notes.glide!(60, 64, 2, 0);

      expect(pitch.offset.events.at(-1)).toEqual({ type: "setValue", value: 4 / 12, time: 2 });
    });

    it("releases its note when all the notes stop", () => {
      const { gate, notes } = voiceOf({ voice: 1, voices: 2 });
      notes.noteOn(60, 1);

      notes.allNotesOff(2);
      notes.noteOff(60, 3);

      expect(gate.off).toEqual([2]);
    });

    it("releases its note and starts afresh when the number of voices changes", () => {
      const { port, gate, notes } = voiceOf({ voice: 1, voices: 2 });
      notes.noteOn(60, 1);

      port.setParameter("voices", 3, 2);
      notes.noteOn(64, 3);

      expect(gate).toEqual({ on: [1, 3], off: [2] });
    });

    describe("as notes", () => {
      const listen = (port: PortModule) => {
        const heard: string[] = [];
        port.getNoteOutput("notes")!.connect({
          noteOn: (note, time, velocity) => heard.push(`on ${note} ${time}${velocity === undefined ? "" : ` v${velocity}`}`),
          noteOff: (note, time) => heard.push(`off ${note} ${time}`),
          allNotesOff: (time) => heard.push(`all ${time}`),
          glide: (from, to, time) => heard.push(`glide ${from} ${to} ${time}`),
        });
        return heard;
      };

      it("sends on the notes that fall to its voice, for a module played by notes inside the subpatch", () => {
        const { port, notes } = voiceOf({ voice: 2, voices: 3 });
        const heard = listen(port);

        notes.noteOn(60, 1, 90);
        notes.noteOn(64, 2, 80);
        notes.noteOn(67, 3, 70);
        notes.noteOff(60, 4);
        notes.noteOff(64, 5);

        expect(heard).toEqual(["on 64 2 v80", "off 64 5"]);
      });

      it("ends the note of its voice before a note takes the voice from it", () => {
        const { port, notes } = voiceOf({ voice: 1, voices: 2 });
        const heard = listen(port);

        notes.noteOn(60, 1);
        notes.noteOn(64, 1);
        notes.noteOn(67, 2);

        expect(heard).toEqual(["on 60 1 v100", "off 60 2", "on 67 2.005 v100"]);
      });

      it("glides the note of its voice", () => {
        const { port, notes } = voiceOf({ voice: 2, voices: 2 });
        const heard = listen(port);
        notes.noteOn(60, 1);
        notes.noteOn(64, 1);

        notes.glide!(64, 67, 2, 0.3);

        expect(heard).toEqual(["on 64 1 v100", "glide 64 67 2"]);
      });

      it("passes every note on as it comes when it is the only voice, so that a module inside slurs as it would outside", () => {
        const { port, notes } = voiceOf({});
        const heard = listen(port);

        notes.noteOn(60, 1);
        notes.noteOn(64, 2);
        notes.noteOff(60, 3);
        notes.glide!(64, 65, 3.5, 0.1);
        notes.noteOff(65, 4);

        expect(heard).toEqual(["on 60 1 v100", "on 64 2 v100", "off 60 3", "glide 64 65 3.5", "off 65 4"]);
      });

      it("lets go of the notes when all the notes stop, or the number of voices changes", () => {
        const { port, notes } = voiceOf({ voice: 1, voices: 2 });
        const heard = listen(port);
        notes.noteOn(60, 1);

        notes.allNotesOff(2);
        port.setParameter("voices", 3, 3);

        expect(heard).toEqual(["on 60 1 v100", "all 2", "all 3"]);
      });
    });

    it("stops its pitch on dispose", () => {
      const { port, pitch } = voiceOf({});

      port.dispose();

      expect(pitch.stopped).toBe(true);
    });
  });

  describe("taking a voice that still sounds", () => {
    const voiceWithOut = (voices = 2) => {
      const context = new FakeAudioContext();
      const inlet = new PortModule(context.asAudioContext(), { value: 0, signal: "notes", voice: 1, voices, release: 2, group: "synth/" });
      const outlet = new PortModule(context.asAudioContext(), { value: 0, signal: "audio", group: "synth/" });
      const other = new PortModule(context.asAudioContext(), { value: 0, signal: "audio", group: "synth#2/" });
      const gate = { on: [] as number[] };
      inlet.getTriggerOutput("gate")!.connect({ gateOn: (time) => gate.on.push(time), gateOff: () => {} });
      const fader = (port: PortModule) => (port.getAudioOutput("out") as unknown as { gain: { events: unknown[] } }).gain.events;
      return { inlet, outlet, other, gate, notes: inlet.getNoteInput("in")!, fader, pitch: context.constantSources[1] };
    };

    it("fades the Out of its voice in a few milliseconds, and starts the new note right after", () => {
      const { outlet, other, gate, notes, fader, pitch } = voiceWithOut();
      notes.noteOn(60, 0);
      notes.noteOn(62, 0);
      notes.noteOff(60, 1);
      notes.noteOff(62, 1);

      notes.noteOn(64, 1.5);

      expect(fader(outlet)).toEqual([
        { type: "setValue", value: 1, time: 1.5 },
        { type: "linearRamp", value: 0, time: 1.505 },
        { type: "setValue", value: 1, time: 1.505 },
      ]);
      expect(fader(other)).toEqual([]);
      expect(gate.on).toEqual([0, 1.505]);
      expect(pitch.offset.events.at(-1)).toEqual({ type: "setValue", value: 4 / 12, time: 1.505 });
    });

    it("leaves a single voice to take each note at once, as a synth of one voice does", () => {
      const { outlet, gate, notes, fader } = voiceWithOut(1);
      notes.noteOn(60, 0);

      notes.noteOn(64, 0.5);

      expect(fader(outlet)).toEqual([]);
      expect(gate.on).toEqual([0, 0.5]);
    });

    it("starts a note at once on a voice that rings no more", () => {
      const { outlet, gate, notes, fader } = voiceWithOut();
      notes.noteOn(60, 0);
      notes.noteOn(62, 0);
      notes.noteOff(60, 1);
      notes.noteOff(62, 1);

      notes.noteOn(64, 4);

      expect(fader(outlet)).toEqual([]);
      expect(gate.on).toEqual([0, 4]);
    });

    it("tells the most voices its notes needed at once", () => {
      const { inlet, notes } = voiceWithOut();
      notes.noteOn(60, 0);
      notes.noteOn(62, 0);
      notes.noteOff(60, 1);
      notes.noteOff(62, 1);
      notes.noteOn(64, 1.5);

      expect(inlet.getVoiceUsage()).toEqual({ voices: 2, needed: 3 });
    });
  });

  it("disconnects on dispose", () => {
    const context = new FakeAudioContext();
    const port = new PortModule(context.asAudioContext(), { value: 0 });
    context.gains[0].connect(context.destination);

    port.dispose();

    expect(context.gains[0].outputs.size).toBe(0);
    expect(context.constantSources[0].stopped).toBe(true);
  });
});
