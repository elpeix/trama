import { beforeEach, describe, expect, it } from "vitest";
import { moveLegacyKeys } from "./legacy";

beforeEach(() => {
  localStorage.clear();
});

describe("moveLegacyKeys", () => {
  it("moves what was kept when the app was called audiojac to its new keys", () => {
    localStorage.setItem("audiojac:patch", "patch");
    localStorage.setItem("audiojac:patch:backup", "backup");
    localStorage.setItem("audiojac:theme", "dark");

    moveLegacyKeys(localStorage);

    expect(localStorage.getItem("trama:patch")).toBe("patch");
    expect(localStorage.getItem("trama:patch:backup")).toBe("backup");
    expect(localStorage.getItem("trama:theme")).toBe("dark");
    expect(localStorage.getItem("audiojac:patch")).toBeNull();
    expect(localStorage.getItem("audiojac:patch:backup")).toBeNull();
    expect(localStorage.getItem("audiojac:theme")).toBeNull();
  });

  it("keeps what is already under a new key, and drops the old one", () => {
    localStorage.setItem("audiojac:theme", "dark");
    localStorage.setItem("trama:theme", "light");

    moveLegacyKeys(localStorage);

    expect(localStorage.getItem("trama:theme")).toBe("light");
    expect(localStorage.getItem("audiojac:theme")).toBeNull();
  });

  it("leaves the keys of anything else", () => {
    localStorage.setItem("other:patch", "other");
    localStorage.setItem("audiojacket", "coat");

    moveLegacyKeys(localStorage);

    expect(localStorage.getItem("other:patch")).toBe("other");
    expect(localStorage.getItem("audiojacket")).toBe("coat");
  });

  it("does nothing without a storage, or with one that cannot be used", () => {
    const broken = {
      get length(): number {
        throw new DOMException("Blocked");
      },
    } as Storage;

    expect(() => moveLegacyKeys(undefined)).not.toThrow();
    expect(() => moveLegacyKeys(broken)).not.toThrow();
  });
});
