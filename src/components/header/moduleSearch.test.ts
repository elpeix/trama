import { describe, expect, it } from "vitest";
import { moduleRegistry } from "../../patch/registry";
import type { NodeType } from "../../patch/types";
import { searchModules } from "./moduleSearch";

const all = Object.keys(moduleRegistry) as NodeType[];

describe("searchModules", () => {
  it("gives every module, in its order, without a query", () => {
    expect(searchModules("", all)).toEqual(all);
    expect(searchModules("   ", all)).toEqual(all);
  });

  it("puts first the names that start with the query, then the names with a word that does", () => {
    expect(searchModules("fil", all)).toEqual(["filter", "customFilter"]);
    expect(searchModules("rev", all)).toEqual(["reverb"]);
  });

  it("finds a module by what it does, after the ones found by name", () => {
    const found = searchModules("gate", all);

    expect(found).toContain("envelope");
    expect(found).toContain("clock");
    expect(found).not.toContain("oscillator");
    expect(searchModules("vca", all)).toEqual(["gain"]);
  });

  it("finds a module by its group", () => {
    expect(searchModules("modulation", all)).toEqual(
      all.filter((type) => moduleRegistry[type].category === "modulation"),
    );
  });

  it("needs every word of the query, in any case and with or without accents", () => {
    expect(searchModules("pitch shift", all)).toEqual(["pitchShifter"]);
    expect(searchModules("RÉV", all)).toEqual(["reverb"]);
  });

  it("searches only among the modules it is given", () => {
    expect(searchModules("keys", ["filter", "gain"])).toEqual([]);
    expect(searchModules("zzz", all)).toEqual([]);
  });
});
