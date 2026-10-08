import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STOP } from "../patch/patterns";
import type { Song } from "../patch/types";
import { FakeAudioContext } from "../test/fakeAudioContext";
import { SongPlayer } from "./SongPlayer";
import { Transport } from "./Transport";

let context: FakeAudioContext;
let transport: Transport;
let launches: [number, string, string, string][];
let places: [string, string, number | undefined][];
let ended: number[];
let controls: [string, number | undefined, number][];
let fades: [number, number][];
let player: SongPlayer;

const advance = (seconds: number) => {
  const end = Math.round((context.currentTime + seconds) * 1000);
  for (let ms = Math.round(context.currentTime * 1000) + 5; ms <= end; ms += 5) {
    context.currentTime = ms / 1000;
    vi.advanceTimersByTime(5);
  }
};

/** At 120 BPM a bar lasts 2 s. */
const song: Song = { bars: 4, rows: { "seq-1": "A1 - A2 A2", "sub-2/clip-3": "- A3 - A4" } };

beforeEach(() => {
  vi.useFakeTimers();
  context = new FakeAudioContext();
  transport = new Transport(context.asAudioContext());
  launches = [];
  places = [];
  ended = [];
  controls = [];
  fades = [];
  player = new SongPlayer(
    context.asAudioContext(),
    transport,
    (path, slot, mode, at) => {
      launches.push([context.currentTime, path, slot, mode]);
      places.push([path, slot, at]);
    },
    () => ended.push(context.currentTime),
    (key, value, time) => controls.push([key, value, time]),
    (gain, time) => fades.push([gain, time]),
  );
});

afterEach(() => {
  player.stop();
  vi.useRealTimers();
});

describe("SongPlayer", () => {
  it("launches the patterns of the first bar at once, to take over on the first step whenever the clocks join", () => {
    player.start(song, 0);

    expect(launches).toEqual([[0, "seq-1", "A1", "now"]]);
    expect(player.bar).toBe(0);
  });

  it("launches what sounds on the bar it starts on, from the letters before it", () => {
    player.start(song, 1);

    expect(launches).toEqual([
      [0, "seq-1", "A1", "now"],
      [0, "sub-2/clip-3", "A3", "now"],
    ]);
  });

  it("launches the letters of each bar half a bar before it, and nothing on a dash", () => {
    player.start(song, 0);
    advance(5.5);

    expect(launches).toEqual([
      [0, "seq-1", "A1", "now"],
      [1, "sub-2/clip-3", "A3", "bar"],
      [3, "seq-1", "A2", "bar"],
      [5, "seq-1", "A2", "bar"],
      [5, "sub-2/clip-3", "A4", "bar"],
    ]);
  });

  it("launches each letter for the first beat of its pattern, and a stop for no place", () => {
    player.start({ bars: 3, rows: { "seq-1": "A1 A1 ." } }, 0);
    advance(3.5);

    expect(places).toEqual([
      ["seq-1", "A1", 0],
      ["seq-1", "A1", 0],
      ["seq-1", STOP, undefined],
    ]);
  });

  it("launches what sounds on the bar it starts on for the place it has got to, in beats", () => {
    player.start({ bars: 4, rows: { "seq-1": "A1 - - A2", "sub-2/clip-3": "- A3 - -" } }, 2);

    expect(places).toEqual([
      ["seq-1", "A1", 8],
      ["sub-2/clip-3", "A3", 4],
    ]);
  });

  it("launches what sounds at the start of the loop for the place it has got to, each time round", () => {
    player.start({ bars: 4, rows: { "sub-2/clip-3": "A3 - - -" }, loop: { start: 1, length: 2 } }, 1);
    advance(5.5);

    expect(places).toEqual([
      ["sub-2/clip-3", "A3", 4],
      ["sub-2/clip-3", "A3", 4],
    ]);
  });

  it("launches a stop on a dot, and on the bars after it when it starts there", () => {
    const stopping: Song = { bars: 3, rows: { "seq-1": "A1 . -" } };
    player.start(stopping, 0);
    advance(1.5);

    expect(launches).toEqual([
      [0, "seq-1", "A1", "now"],
      [1, "seq-1", STOP, "bar"],
    ]);

    launches = [];
    player.start(stopping, 2);
    expect(launches).toEqual([[1.5, "seq-1", STOP, "now"]]);
  });

  it("tells the bar of the song that plays", () => {
    player.start(song, 1);
    advance(1.5);
    expect(player.bar).toBe(1);

    advance(1);
    expect(player.bar).toBe(2);
  });

  it("tells the bar that plays as soon as it starts, between the ticks of its timer", () => {
    player.start(song, 1);
    advance(1.995);
    context.currentTime = 2.001;

    expect(player.bar).toBe(2);
  });

  it("ends when the last bar is over", () => {
    player.start(song, 2);
    advance(3.9);
    expect(ended).toEqual([]);

    advance(0.2);
    expect(ended).toEqual([4]);
    expect(player.bar).toBeUndefined();
  });

  it("goes round the loop without ending, launching at its start what sounds there", () => {
    player.start({ ...song, loop: { start: 2, length: 2 } }, 2);
    advance(10);

    expect(ended).toEqual([]);
    expect(launches.filter(([, path]) => path === "sub-2/clip-3").map(([time, , slot]) => [time, slot])).toEqual([
      [0, "A3"],
      [1, "A4"],
      [3, "A3"],
      [5, "A4"],
      [7, "A3"],
      [9, "A4"],
    ]);
  });

  it("plays the changes made to the song while it plays", () => {
    player.start(song, 0);
    advance(0.5);

    player.update({ ...song, rows: { "seq-1": "A1 A4 - -" } });
    advance(1);

    expect(launches.at(-1)).toEqual([1, "seq-1", "A4", "bar"]);
  });

  it("launches again the bar already launched when it changes", () => {
    player.start(song, 0);
    advance(1.5);

    player.update({ ...song, rows: { "seq-1": "A1 A3 - -" } });

    expect(launches.at(-1)).toEqual([1.5, "seq-1", "A3", "bar"]);
  });

  it("launches nothing more once stopped", () => {
    player.start(song, 0);
    player.stop();
    advance(4);

    expect(launches).toHaveLength(1);
    expect(player.bar).toBeUndefined();
  });

  it("follows the transport from where it is when started late", () => {
    advance(0.4);
    transport.restart();
    player.start(song, 0);
    advance(1.5);

    expect(launches.at(-1)).toEqual([1.4, "sub-2/clip-3", "A3", "bar"]);
  });

});

describe("SongPlayer controls", () => {
  const automated: Song = { bars: 4, rows: {}, automation: { "filter-1.cutoff": "0:100 1:200 5:300 13:400" } };

  it("sets each point of a lane at its time, a little ahead", () => {
    player.start(automated, 0);
    advance(0.45);
    expect(controls).toEqual([
      ["filter-1.cutoff", 100, 0],
      ["filter-1.cutoff", 200, 0.5],
    ]);

    advance(2.2);
    expect(controls.at(-1)).toEqual(["filter-1.cutoff", 300, 2.5]);
  });

  it("starts from the value the lane has on the bar it starts on", () => {
    player.start(automated, 1);

    expect(controls).toEqual([["filter-1.cutoff", 200, 0]]);
    advance(0.6);
    expect(controls).toEqual([
      ["filter-1.cutoff", 200, 0],
      ["filter-1.cutoff", 300, 0.5],
    ]);
  });

  it("goes along a ramp in small steps, from the value it starts on", () => {
    player.start({ bars: 4, rows: {}, automation: { "filter-1.cutoff": "0:100 8~300" } }, 1);
    advance(0.3);

    expect(controls.slice(0, 3)).toEqual([
      ["filter-1.cutoff", 200, 0],
      ["filter-1.cutoff", 201.5625, 0.03125],
      ["filter-1.cutoff", 203.125, 0.0625],
    ]);
  });

  it("sets the value of the patch where the lane has none yet", () => {
    player.start({ bars: 4, rows: {}, automation: { "osc-2.detune": "8:5" } }, 0);

    expect(controls).toEqual([["osc-2.detune", undefined, 0]]);
  });

  it("goes back to the value at the start of the loop when it goes round", () => {
    player.start({ ...automated, loop: { start: 1, length: 2 } }, 1);
    advance(4.2);

    expect(controls.filter(([, , time]) => time === 4)).toEqual([["filter-1.cutoff", 200, 4]]);
  });

  it("leaves alone a control held by hand, and follows it again once let go", () => {
    player.start(automated, 0);
    player.hold("filter-1.cutoff");
    advance(2.6);
    expect(controls).toEqual([["filter-1.cutoff", 100, 0]]);

    player.release("filter-1.cutoff");
    advance(4);
    expect(controls.at(-1)).toEqual(["filter-1.cutoff", 400, 6.5]);
  });

  it("tells where in the song it is, in beats", () => {
    player.start(automated, 2);
    advance(1.25);

    expect(player.position).toBeCloseTo(10.5);
    player.stop();
    expect(player.position).toBeUndefined();
  });
});

describe("SongPlayer fade", () => {
  const gainAt = (time: number) => fades.findLast(([, at]) => at <= time + 1e-9)?.[0];

  it("fades the sound out over the last bars, down to nothing at the end", () => {
    player.start({ ...song, fade: 2 }, 0);
    advance(7.9);

    expect(gainAt(3.9)).toBe(1);
    expect(gainAt(6)).toBeCloseTo(0.25, 1);
    expect(gainAt(7.95)).toBeLessThan(0.01);
  });

  it("starts quieter on a bar inside the fade", () => {
    player.start({ ...song, fade: 2 }, 3);

    expect(fades[0][0]).toBeLessThan(0.3);
  });

  it("keeps the volume whole without a fade, or while a loop goes round", () => {
    player.start(song, 0);
    advance(7.9);
    player.start({ ...song, fade: 2, loop: { start: 0, length: 4 } }, 0);
    advance(7.9);

    expect(fades.length).toBeGreaterThan(0);
    expect(fades.every(([gain]) => gain === 1)).toBe(true);
  });

  it("follows a fade changed while it plays", () => {
    player.start(song, 0);
    advance(5);

    player.update({ ...song, fade: 2 });
    advance(1);

    expect(gainAt(6)).toBeLessThan(0.3);
  });
});

describe("SongPlayer in bars of three beats", () => {
  beforeEach(() => {
    transport.setMeter([3]);
  });

  it("launches the letters of each bar half a bar before it", () => {
    player.start(song, 0);
    advance(4);

    expect(launches).toEqual([
      [0, "seq-1", "A1", "now"],
      [0.75, "sub-2/clip-3", "A3", "bar"],
      [2.25, "seq-1", "A2", "bar"],
      [3.75, "seq-1", "A2", "bar"],
      [3.75, "sub-2/clip-3", "A4", "bar"],
    ]);
  });

  it("launches what sounds on the bar it starts on for the place it has got to", () => {
    player.start({ bars: 4, rows: { "seq-1": "A1 - - A2" } }, 2);

    expect(places).toEqual([["seq-1", "A1", 6]]);
  });

  it("ends when the last bar is over", () => {
    player.start(song, 2);
    advance(2.9);
    expect(ended).toEqual([]);

    advance(0.2);
    expect(ended).toEqual([3]);
  });

  it("sets the points of the lanes on the beats of its bars", () => {
    player.start({ bars: 4, rows: {}, automation: { "filter-1.cutoff": "0:100 3:200 4.5:300" } }, 0);
    advance(2.3);

    expect(controls).toEqual([
      ["filter-1.cutoff", 100, 0],
      ["filter-1.cutoff", 200, 1.5],
      ["filter-1.cutoff", 300, 2.25],
    ]);
  });

  it("tells where in the song it is, in beats", () => {
    player.start(song, 2);
    advance(1.25);

    expect(player.position).toBeCloseTo(8.5);
  });

  it("fades the sound out over the last bars", () => {
    const gainAt = (time: number) => fades.findLast(([, at]) => at <= time + 1e-9)?.[0];
    player.start({ ...song, fade: 2 }, 0);
    advance(5.9);

    expect(gainAt(2.9)).toBe(1);
    expect(gainAt(4.5)).toBeCloseTo(0.25, 1);
    expect(gainAt(5.95)).toBeLessThan(0.01);
  });
});
