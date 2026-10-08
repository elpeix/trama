import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { THEME_KEY } from "./theme";
import { useTheme } from "./useTheme";

class FakeQuery extends EventTarget {
  matches: boolean;

  constructor(matches: boolean) {
    super();
    this.matches = matches;
  }

  flip(matches: boolean) {
    this.matches = matches;
    this.dispatchEvent(Object.assign(new Event("change"), { matches }));
  }
}

const asQuery = (query: FakeQuery) => query as unknown as MediaQueryList;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe("useTheme", () => {
  it("follows the system while nothing is chosen, and marks the page", () => {
    const query = new FakeQuery(true);
    const { result } = renderHook(() => useTheme(asQuery(query)));

    expect(result.current).toMatchObject({ choice: "system", theme: "dark" });
    expect(document.documentElement.dataset.theme).toBe("dark");

    act(() => query.flip(false));
    expect(result.current.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("goes through light, dark and the system, keeping the choice", () => {
    const query = new FakeQuery(false);
    const { result } = renderHook(() => useTheme(asQuery(query)));

    act(() => result.current.cycle());
    expect(result.current).toMatchObject({ choice: "light", theme: "light" });
    act(() => result.current.cycle());
    expect(result.current).toMatchObject({ choice: "dark", theme: "dark" });
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");

    act(() => query.flip(false));
    expect(result.current.theme).toBe("dark");
  });

  it("starts from the theme kept", () => {
    localStorage.setItem(THEME_KEY, "light");

    const { result } = renderHook(() => useTheme(asQuery(new FakeQuery(true))));

    expect(result.current).toMatchObject({ choice: "light", theme: "light" });
  });

  it("takes the light theme for the system where it cannot be asked", () => {
    const { result } = renderHook(() => useTheme(undefined));

    expect(result.current.theme).toBe("light");
  });
});
