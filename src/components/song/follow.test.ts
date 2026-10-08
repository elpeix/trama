import { describe, expect, it } from "vitest";
import { followScroll } from "./follow";

const view = { scrollLeft: 0, width: 400, names: 100 };
const bar = (index: number) => ({ left: 100 + index * 28, width: 28 });

describe("followScroll", () => {
  it("leaves the grid where it is while the bar that plays can be seen", () => {
    expect(followScroll(view, bar(0))).toBeUndefined();
    expect(followScroll(view, bar(9))).toBeUndefined();
  });

  it("turns the page when the bar that plays goes past the right edge, leaving it just after the names", () => {
    expect(followScroll(view, bar(11))).toBe(11 * 28);
  });

  it("turns the page when the bar that plays is only partly seen", () => {
    expect(followScroll(view, bar(10))).toBe(10 * 28);
  });

  it("goes back when the bar that plays is hidden under the names, as when a loop goes round", () => {
    expect(followScroll({ ...view, scrollLeft: 280 }, bar(3))).toBe(3 * 28);
  });

  it("goes back when the bar that plays is past the left edge", () => {
    expect(followScroll({ ...view, scrollLeft: 1000 }, bar(0))).toBe(0);
  });

  it("leaves the grid where it is when the view is too narrow to show a whole bar and the bar starts in it", () => {
    expect(followScroll({ scrollLeft: 0, width: 110, names: 100 }, bar(0))).toBeUndefined();
  });
});
