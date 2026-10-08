import { describe, expect, it } from "vitest";
import { STOP } from "../../patch/patterns";
import { PatternBank } from "./PatternBank";

const ids = ["steps", "length"];
const params = { steps: "A", length: 16, division: "1/8" };
const patterns = { A2: { steps: "B", length: 8 }, A3: { steps: "C", length: 16 }, A4: { steps: "D", length: 16 } };

const bank = () => new PatternBank(ids, params, patterns);

describe("PatternBank", () => {
  it("plays pattern A to start with, and has nothing waiting", () => {
    expect(bank().state()).toEqual({ playing: "A1" });
  });

  it("holds the values of every pattern, and changes them one by one", () => {
    const patternBank = bank();

    expect(patternBank.values("A2")).toEqual({ steps: "B", length: 8 });
    patternBank.set("A1", "steps", "A2");
    patternBank.set("A3", "length", 4);

    expect(patternBank.values("A1")).toEqual({ steps: "A2", length: 16 });
    expect(patternBank.values("A3")).toEqual({ steps: "C", length: 4 });
  });

  it("switches right away on the next step with now", () => {
    const patternBank = bank();
    patternBank.launch("A2");

    expect(patternBank.state()).toEqual({ playing: "A1", queued: "A2" });
    expect(patternBank.switchAt("now", 1.5, 5, 4)).toEqual({ steps: "B", length: 8 });
    expect(patternBank.state()).toEqual({ playing: "A2" });
  });

  it("waits for the first beat of a bar with bar", () => {
    const patternBank = bank();
    patternBank.launch("A3");

    expect(patternBank.switchAt("bar", 3.5, 7, 4)).toBeUndefined();
    expect(patternBank.switchAt("bar", 5, 10, 4)).toBeUndefined();
    expect(patternBank.switchAt("bar", 8, 0, 4)).toEqual({ steps: "C", length: 16 });
  });

  it("waits for the first beat of a bar of the meter with bar", () => {
    const patternBank = bank();
    patternBank.launch("A3");

    expect(patternBank.switchAt("bar", 4, 8, 5)).toBeUndefined();
    expect(patternBank.switchAt("bar", 5, 10, 5)).toEqual({ steps: "C", length: 16 });
  });

  it("waits for the pattern playing to start over with end", () => {
    const patternBank = bank();
    patternBank.launch("A4");

    expect(patternBank.switchAt("end", 4, 8, 4)).toBeUndefined();
    expect(patternBank.switchAt("end", 8, 0, 4)).toEqual({ steps: "D", length: 16 });
  });

  it("takes over from the place it is launched for, in beats into the pattern", () => {
    const patternBank = bank();
    patternBank.launch("A2", "bar", 8);

    expect(patternBank.switchAt("bar", 4, 0, 4)).toEqual({ steps: "B", length: 8 });
    expect(patternBank.into).toBe(8);
  });

  it("has no place for a pattern launched without one, which goes on from where the grid is", () => {
    const patternBank = bank();
    patternBank.launch("A2", "bar", 8);
    patternBank.switchAt("bar", 4, 0, 4);
    patternBank.launch("A3");
    patternBank.switchAt("now", 5, 1, 4);

    expect(patternBank.into).toBeUndefined();
  });

  it("starts the pattern playing over when it is launched for a place", () => {
    const patternBank = bank();
    patternBank.launch("A1", "now", 0);

    expect(patternBank.state()).toEqual({ playing: "A1", queued: "A1" });
    expect(patternBank.switchAt("now", 3, 6, 4)).toEqual({ steps: "A", length: 16 });
    expect(patternBank.into).toBe(0);
  });

  it("tells how many steps the grid is ahead of the pattern that took over on a step", () => {
    const patternBank = bank();
    expect(patternBank.stepsAhead(12, 0.5)).toBe(0);

    patternBank.launch("A2", "bar", 4);
    patternBank.switchAt("bar", 8, 0, 4);

    expect(patternBank.stepsAhead(16, 0.5)).toBe(8);
  });

  it("forgets the pattern waiting when the one playing is launched again", () => {
    const patternBank = bank();
    patternBank.launch("A2");
    patternBank.launch("A1");

    expect(patternBank.state()).toEqual({ playing: "A1" });
    expect(patternBank.switchAt("now", 0, 0, 4)).toBeUndefined();
  });

  it("takes over when told by the launch, whatever the mode of the node", () => {
    const patternBank = bank();
    patternBank.launch("A2", "bar");

    expect(patternBank.launchMode("now")).toBe("bar");
    expect(patternBank.switchAt(patternBank.launchMode("now"), 1.5, 5, 4)).toBeUndefined();
    expect(patternBank.switchAt(patternBank.launchMode("now"), 4, 0, 4)).toEqual({ steps: "B", length: 8 });
    expect(patternBank.launchMode("now")).toBe("now");
  });

  it("follows the mode of the node again after a launch without one", () => {
    const patternBank = bank();
    patternBank.launch("A2", "bar");
    patternBank.launch("A3");

    expect(patternBank.launchMode("end")).toBe("end");
  });

  it("stops when the stop launched is due, and plays nothing new until a pattern is launched", () => {
    const patternBank = bank();
    patternBank.launch(STOP, "bar");

    expect(patternBank.state()).toEqual({ playing: "A1", queued: STOP });
    expect(patternBank.switchAt("bar", 1.5, 3, 4)).toBeUndefined();
    expect(patternBank.stopped).toBe(false);
    expect(patternBank.switchAt("bar", 4, 0, 4)).toBeUndefined();
    expect(patternBank.stopped).toBe(true);
    expect(patternBank.state()).toEqual({ playing: "A1", stopped: true });
  });

  it("plays again the pattern it stopped on when launched", () => {
    const patternBank = bank();
    patternBank.launch(STOP, "now");
    patternBank.switchAt("now", 0, 0, 4);
    patternBank.launch("A1", "now");

    expect(patternBank.state()).toEqual({ playing: "A1", queued: "A1", stopped: true });
    expect(patternBank.switchAt("now", 0.5, 1, 4)).toEqual({ steps: "A", length: 16 });
    expect(patternBank.stopped).toBe(false);
    expect(patternBank.state()).toEqual({ playing: "A1" });
  });

  it("forgets a stop launched once stopped", () => {
    const patternBank = bank();
    patternBank.launch(STOP, "now");
    patternBank.switchAt("now", 0, 0, 4);
    patternBank.launch(STOP, "now");

    expect(patternBank.state()).toEqual({ playing: "A1", stopped: true });
  });
});
