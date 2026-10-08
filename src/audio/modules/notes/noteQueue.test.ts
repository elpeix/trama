import { describe, expect, it } from "vitest";
import { NoteQueue } from "./noteQueue";

const listen = () => {
  const heard: string[] = [];
  const queue = new NoteQueue();
  queue.output.connect({
    noteOn: (note, time) => heard.push(`on ${note} ${time}`),
    noteOff: (note, time) => heard.push(`off ${note} ${time}`),
    allNotesOff: (time) => heard.push(`all ${time}`),
    glide: (from, to, time) => heard.push(`glide ${from}>${to} ${time}`),
  });
  return { queue, heard };
};

describe("NoteQueue", () => {
  it("sends the notes that start before a moment, in order", () => {
    const { queue, heard } = listen();
    queue.play(64, 0.5, 1);
    queue.play(60, 0, 1);

    queue.send(0.4);

    expect(heard).toEqual(["on 60 0"]);
  });

  it("sends a note off only once its moment comes", () => {
    const { queue, heard } = listen();
    queue.play(60, 0, 1);
    queue.send(0.5);

    queue.send(1.5);

    expect(heard).toEqual(["on 60 0", "off 60 1"]);
  });

  it("ends a note before another one starts at the same moment", () => {
    const { queue, heard } = listen();
    queue.play(60, 0, 1);
    queue.play(60, 1, 2);

    queue.send(1.5);

    expect(heard).toEqual(["on 60 0", "off 60 1", "on 60 1"]);
  });

  it("takes moments a rounding error apart as the same one", () => {
    const { queue, heard } = listen();
    queue.play(60, 0, 0.1 + 0.2);
    queue.play(60, 0.3, 1);

    queue.send(0.5);

    expect(heard.slice(1)).toEqual([`off 60 ${0.1 + 0.2}`, "on 60 0.3"]);
  });

  it("sends a glide at its moment, after the notes that end and before those that start then", () => {
    const { queue, heard } = listen();
    queue.on(60, 0);
    queue.on(72, 1);
    queue.glide(60, 64, 1, 0.1);
    queue.off(67, 1);
    queue.off(64, 2);

    queue.send(1.5);

    expect(heard).toEqual(["on 60 0", "off 67 1", "glide 60>64 1", "on 72 1"]);
  });

  it("stops every note and forgets the ones to come", () => {
    const { queue, heard } = listen();
    queue.play(60, 0, 1);
    queue.play(64, 2, 3);
    queue.send(0.5);

    queue.stop(0.6);
    queue.send(4);

    expect(heard).toEqual(["on 60 0", "all 0.6"]);
  });
});
