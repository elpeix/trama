import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";
import favicon from "../../../public/favicon.svg?raw";

const paintOf = (element: Element | null) => {
  const style = element?.getAttribute("style") ?? "";
  const declared = /(?:^|;)\s*(?:fill|stroke)\s*:\s*(url\([^)]+\))/.exec(style)?.[1];
  const attribute = [element?.getAttribute("fill"), element?.getAttribute("stroke")].find((value) => value?.startsWith("url("));
  return declared ?? attribute ?? "";
};

const shapesOf = (root: ParentNode) => {
  const [jack, cable] = root.querySelectorAll("svg svg path, .logo-mark path");
  return { jack, cable };
};

const flat = (path: string | null | undefined) => (path ?? "").replace(/\s+/g, " ").trim();

describe("Logo", () => {
  it("draws the jack and its thread in one piece, the other thread of the weave, and the name", () => {
    const { container } = render(<Logo />);

    expect(container.querySelectorAll(".logo-jack")).toHaveLength(1);
    expect(container.querySelectorAll(".logo-cable")).toHaveLength(1);
    expect(container.querySelector(".logo-name")).toHaveTextContent("trama");
  });

  it("draws both threads in one colour, like the segments of a screen, with no gradient", () => {
    const { container } = render(<Logo />);

    expect(container.querySelectorAll("linearGradient")).toHaveLength(0);
    for (const shape of container.querySelectorAll(".logo-mark path")) {
      expect(paintOf(shape)).toBe("");
    }
  });

  it("cuts the hole of the jack out of its piece, so what is behind it shows through", () => {
    const { container } = render(<Logo />);
    const jack = container.querySelector(".logo-jack");

    expect(flat(jack?.getAttribute("d")).match(/[Mm]/g)).toHaveLength(2);
    expect(container.querySelector(".logo-hole")).toBeNull();
  });

  it("keeps the mark small, no taller than the line of the name, with the proportions of its drawing", () => {
    const { container } = render(<Logo />);
    const mark = container.querySelector(".logo-mark");
    const [, , boxWidth, boxHeight] = (mark?.getAttribute("viewBox") ?? "").split(" ").map(Number);
    const width = Number(mark?.getAttribute("width"));
    const height = Number(mark?.getAttribute("height"));

    expect(height).toBeLessThanOrEqual(20);
    expect(width / height).toBeCloseTo(boxWidth / boxHeight, 1);
  });
});

describe("favicon", () => {
  const icon = new DOMParser().parseFromString(favicon, "image/svg+xml");

  it("draws the same jack and threads as the logo, inside a rounded square", () => {
    const { container } = render(<Logo />);
    const logo = shapesOf(container);
    const drawn = shapesOf(icon);

    expect(icon.querySelector("rect")?.getAttribute("rx")).not.toBeNull();
    expect(flat(drawn.jack?.getAttribute("d"))).toBe(flat(logo.jack?.getAttribute("d")));
    expect(flat(drawn.cable?.getAttribute("d"))).toBe(flat(logo.cable?.getAttribute("d")));
  });

  it("draws them in one colour, the ink of a screen, on the screen itself", () => {
    const { jack, cable } = shapesOf(icon);

    expect(icon.querySelectorAll("linearGradient")).toHaveLength(0);
    expect(icon.querySelector("rect")?.getAttribute("fill")).toBe("#c7d3bd");
    expect(jack?.getAttribute("fill")).toBe("#10301d");
    expect(cable?.getAttribute("stroke")).toBe("#10301d");
  });
});
