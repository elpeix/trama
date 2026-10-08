import { describe, expect, it } from "vitest";
import type { Rect } from "./edgeGeometry";
import { NEW_NODE_SIZE, newNodePosition } from "./placement";

const viewport = { width: 1000, height: 600, transform: [0, 0, 1] as [number, number, number] };

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

const place = (existing: Rect[]): Rect => ({ ...newNodePosition(viewport, existing), ...NEW_NODE_SIZE });

const centred = {
  x: 500 - NEW_NODE_SIZE.width / 2,
  y: 300 - NEW_NODE_SIZE.height / 2,
};

describe("newNodePosition", () => {
  it("centres the node in an untouched viewport", () => {
    expect(newNodePosition(viewport, [])).toEqual(centred);
  });

  it("follows panning and zoom", () => {
    expect(newNodePosition({ width: 1000, height: 600, transform: [-200, -100, 2] }, [])).toEqual({
      x: 350 - NEW_NODE_SIZE.width / 2,
      y: 200 - NEW_NODE_SIZE.height / 2,
    });
  });

  it("prefers the right, following the signal flow", () => {
    const first = place([]);

    const placed = place([first]);

    expect(overlaps(placed, first)).toBe(false);
    expect(placed.x).toBeGreaterThan(first.x + first.width);
    expect(placed.y).toBe(first.y);
  });

  it("goes below when the right is taken", () => {
    const first = place([]);
    const right = place([first]);

    const placed = place([first, right]);

    expect(placed.x).toBe(first.x);
    expect(placed.y).toBeGreaterThan(first.y + first.height);
  });

  it("stays close to the centre", () => {
    const first = place([]);

    const placed = place([first]);

    expect(Math.hypot(placed.x - centred.x, placed.y - centred.y)).toBeLessThan(2 * NEW_NODE_SIZE.width);
  });

  it("never overlaps any of many existing nodes", () => {
    const existing: Rect[] = [];
    for (let i = 0; i < 12; i++) {
      existing.push(place(existing));
    }

    for (const [index, rect] of existing.entries()) {
      for (const other of existing.slice(index + 1)) {
        expect(overlaps(rect, other)).toBe(false);
      }
    }
  });
});
