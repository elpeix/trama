import { describe, expect, it } from "vitest";
import { PatchFormatError } from "./formatError";
import { migrate, PATCH_MIGRATIONS, PRESETS_MIGRATIONS, type Migration } from "./migrations";
import { PATCH_VERSION, PRESETS_VERSION } from "./serialization";

const steps: Record<number, Migration> = {
  1: ({ tempo, ...file }) => ({ ...file, bpm: tempo }),
  2: ({ bpm, ...file }) => ({ ...file, tempo: { value: bpm } }),
};

const format = { what: "patch" as const, current: 3, migrations: steps };

describe("migrate", () => {
  it("leaves a file of the current version as it is", () => {
    const file = { version: 3, tempo: { value: 90 } };

    expect(migrate(file, format)).toBe(file);
  });

  it("takes an older file to the current version one step at a time", () => {
    expect(migrate({ version: 1, tempo: 90, nodes: [] }, format)).toEqual({ version: 3, tempo: { value: 90 }, nodes: [] });
    expect(migrate({ version: 2, bpm: 80 }, format)).toEqual({ version: 3, tempo: { value: 80 } });
  });

  it("tells a file saved by a newer Trama apart", () => {
    expect(() => migrate({ version: 4 }, format)).toThrow(
      new PatchFormatError("This patch was saved by a newer version of Trama (format 4); this one opens up to format 3"),
    );
  });

  it.each([
    ["a missing version", {}],
    ["a version that is not a number", { version: "1" }],
    ["a version below 1", { version: 0 }],
    ["a fractional version", { version: 1.5 }],
  ])("rejects %s", (_name, file) => {
    expect(() => migrate(file, format)).toThrow(PatchFormatError);
    expect(() => migrate(file, format)).toThrow(/^Unsupported patch version/);
  });

  it("rejects an older file it has no step for", () => {
    expect(() => migrate({ version: 1 }, { ...format, migrations: { 2: steps[2] } })).toThrow(
      new PatchFormatError("Unsupported patch version: 1"),
    );
  });

  it.each([
    ["patches", PATCH_MIGRATIONS, PATCH_VERSION],
    ["presets", PRESETS_MIGRATIONS, PRESETS_VERSION],
  ])("has a step from every older version of %s", (_name, migrations, current) => {
    const older = Array.from({ length: current - 1 }, (_, index) => index + 1);

    expect(Object.keys(migrations).map(Number)).toEqual(older);
  });
});
