import { describe, expect, it } from "vitest";
import { applyTheme, nextThemeChoice, readThemeChoice, resolveTheme, saveThemeChoice, THEME_KEY } from "./theme";

class MemoryStorage {
  items = new Map<string, string>();
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

describe("resolveTheme", () => {
  it("follows the system unless a theme is chosen", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("nextThemeChoice", () => {
  it("goes from the system to light, to dark and back", () => {
    expect(nextThemeChoice("system")).toBe("light");
    expect(nextThemeChoice("light")).toBe("dark");
    expect(nextThemeChoice("dark")).toBe("system");
  });
});

describe("readThemeChoice and saveThemeChoice", () => {
  it("keeps the theme chosen", () => {
    const storage = new MemoryStorage();

    saveThemeChoice(storage, "dark");

    expect(storage.items.get(THEME_KEY)).toBe("dark");
    expect(readThemeChoice(storage)).toBe("dark");
  });

  it("follows the system with nothing kept, something else kept, or no storage", () => {
    const storage = new MemoryStorage();
    expect(readThemeChoice(storage)).toBe("system");

    storage.setItem(THEME_KEY, "purple");
    expect(readThemeChoice(storage)).toBe("system");
    expect(readThemeChoice(undefined)).toBe("system");
  });

  it("goes on when the storage fails", () => {
    const failing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(readThemeChoice(failing)).toBe("system");
    expect(() => saveThemeChoice(failing, "light")).not.toThrow();
  });
});

describe("applyTheme", () => {
  it("marks the page with the theme, and tells the browser for its own controls", () => {
    const root = document.createElement("html");

    applyTheme(root, "dark");

    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });
});
