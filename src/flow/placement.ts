import type { Position } from "../patch/types";
import type { Rect } from "./edgeGeometry";

interface Viewport {
  width: number;
  height: number;
  transform: [number, number, number];
}

export const NEW_NODE_SIZE = { width: 280, height: 200 };
const GAP = 30;
const MAX_RINGS = 8;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width + GAP &&
  a.x + a.width + GAP > b.x &&
  a.y < b.y + b.height + GAP &&
  a.y + a.height + GAP > b.y;

function* ring(radius: number) {
  const cells: [number, number][] = [];
  for (let column = -radius; column <= radius; column++) {
    for (let row = -radius; row <= radius; row++) {
      if (Math.max(Math.abs(column), Math.abs(row)) === radius) {
        cells.push([column, row]);
      }
    }
  }
  yield* cells.sort(
    ([columnA, rowA], [columnB, rowB]) =>
      Math.hypot(columnA, rowA) - Math.hypot(columnB, rowB) || columnB - columnA || rowB - rowA,
  );
}

export function newNodePosition(
  { width, height, transform: [x, y, zoom] }: Viewport,
  existing: Rect[],
): Position {
  const centre = {
    x: (width / 2 - x) / zoom - NEW_NODE_SIZE.width / 2,
    y: (height / 2 - y) / zoom - NEW_NODE_SIZE.height / 2,
  };
  for (let radius = 0; radius <= MAX_RINGS; radius++) {
    for (const [column, row] of ring(radius)) {
      const candidate = {
        x: centre.x + column * (NEW_NODE_SIZE.width + GAP),
        y: centre.y + row * (NEW_NODE_SIZE.height + GAP),
        ...NEW_NODE_SIZE,
      };
      if (!existing.some((rect) => overlaps(candidate, rect))) {
        return { x: candidate.x, y: candidate.y };
      }
    }
  }
  return centre;
}
