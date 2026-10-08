import { describe, expect, it } from "vitest";
import { FakeAudioContext } from "../test/fakeAudioContext";
import { Transport } from "./Transport";

describe("Transport pause", () => {
  it("goes on by default, pauses, and goes on again on a restart", () => {
    const transport = new Transport(new FakeAudioContext().asAudioContext());
    expect(transport.paused).toBe(false);

    transport.pause();
    expect(transport.paused).toBe(true);

    transport.restart();
    expect(transport.paused).toBe(false);
  });
});

describe("Transport swing", () => {
  const transport = (swing?: number) => {
    const created = new Transport(new FakeAudioContext().asAudioContext());
    if (swing !== undefined) {
      created.setSwing(swing);
    }
    return created;
  };

  it("keeps the grid straight by default", () => {
    expect(transport().swing).toBe(50);
    expect(transport().swingAt(0.25)).toBe(0);
  });

  it("holds back the sixteenths that fall between two eighths, a quarter of a sixteenth per 12.5 %", () => {
    expect(transport(75).swingAt(0.25)).toBe(0.125);
    expect(transport(75).swingAt(1.75)).toBe(0.125);
    expect(transport(62.5).swingAt(0.75)).toBe(0.0625);
  });

  it("leaves the eighths, and whatever is off the sixteenths, where they are", () => {
    expect(transport(75).swingAt(0)).toBe(0);
    expect(transport(75).swingAt(0.5)).toBe(0);
    expect(transport(75).swingAt(0.125)).toBe(0);
  });

  it("holds back a moment near a swung step as much as the step, when asked to go by how near", () => {
    expect(transport(75).swingAt(0.27, 1 / 32)).toBe(0.125);
    expect(transport(75).swingAt(0.23, 1 / 32)).toBe(0.125);
    expect(transport(75).swingAt(0.3, 1 / 32)).toBe(0);
    expect(transport(75).swingAt(0.27)).toBe(0);
  });

  it("swings the sixteenths until told to swing the eighths", () => {
    expect(transport().swingGrid).toBe("1/16");
  });

  it("holds back the eighths that fall between two beats when it swings the eighths, a quarter of an eighth per 12.5 %", () => {
    const eighths = transport(75);
    eighths.setSwingGrid("1/8");

    expect(eighths.swingGrid).toBe("1/8");
    expect(eighths.swingAt(0.5)).toBe(0.25);
    expect(eighths.swingAt(3.5)).toBe(0.25);
    expect(transport(66).swingAt(0.25)).toBeCloseTo(0.08);
  });

  it("leaves the beats, the sixteenths and whatever is off the eighths where they are when it swings the eighths", () => {
    const eighths = transport(75);
    eighths.setSwingGrid("1/8");

    expect(eighths.swingAt(0)).toBe(0);
    expect(eighths.swingAt(1)).toBe(0);
    expect(eighths.swingAt(0.25)).toBe(0);
    expect(eighths.swingAt(0.75)).toBe(0);
    expect(eighths.swingAt(1 / 3)).toBe(0);
  });
});

describe("Transport meter", () => {
  it("counts bars of four beats by default", () => {
    const transport = new Transport(new FakeAudioContext().asAudioContext());

    expect(transport.meter).toEqual([4]);
    expect(transport.beatsPerBar).toBe(4);
  });

  it("counts bars of the beats of all the groups of its meter", () => {
    const transport = new Transport(new FakeAudioContext().asAudioContext());

    transport.setMeter([3, 2]);

    expect(transport.meter).toEqual([3, 2]);
    expect(transport.beatsPerBar).toBe(5);
  });

  it("counts bars of a meter in eighths in quarters", () => {
    const transport = new Transport(new FakeAudioContext().asAudioContext());

    transport.setMeter({ eighths: [3, 3] });

    expect(transport.meter).toEqual({ eighths: [3, 3] });
    expect(transport.beatsPerBar).toBe(3);
  });
});
