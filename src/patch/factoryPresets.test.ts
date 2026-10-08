import { describe, expect, it } from "vitest";
import { FACTORY_PRESETS, factoryPresetsOf } from "./factoryPresets";
import { parsePresetNode, serializePresetNode } from "./serialization";
import { formatCurve } from "./sequence";
import { STRING_INSTRUMENTS } from "./stringInstruments";
import { WIND_INSTRUMENTS } from "./windInstruments";

describe("the factory presets", () => {
  it("give the Wind the five instruments of the quintet, in their order, and then the others", () => {
    expect(factoryPresetsOf("wind").map(({ name }) => name)).toEqual(["Flute", "Oboe", "Clarinet", "Horn", "Bassoon", "Alto sax", "Alto recorder", "Pan flute", "Flabiol", "Tible", "Tenora", "Fiscorn", "Trumpet", "Trombone"]);
  });

  it("give each instrument its settings, and leave how it is played to the patch", () => {
    const named = { Flute: "flute", Oboe: "oboe", Clarinet: "clarinet", Horn: "horn", Bassoon: "bassoon", "Alto sax": "sax", "Alto recorder": "recorder", "Pan flute": "pan", Flabiol: "flabiol", Tible: "tible", Tenora: "tenora", Fiscorn: "fiscorn", Trumpet: "trumpet", Trombone: "trombone" } as const;
    factoryPresetsOf("wind").forEach(({ name, node }) => {
      const { body, ...rest } = WIND_INSTRUMENTS[named[name as keyof typeof named]];

      expect(node.params, name).toEqual({ ...rest, body: formatCurve(body, 0.5) });
      expect(node.params, name).not.toHaveProperty("breath");
    });
  });

  it("give the Strings the four instruments of the string family, from the highest", () => {
    expect(factoryPresetsOf("strings").map(({ name }) => name)).toEqual(["Violin", "Viola", "Cello", "Double bass"]);
  });

  it("give each string instrument its settings, and leave how it is played to the patch", () => {
    const named = { Violin: "violin", Viola: "viola", Cello: "cello", "Double bass": "bass" } as const;
    factoryPresetsOf("strings").forEach(({ name, node }) => {
      const { body, ...rest } = STRING_INSTRUMENTS[named[name as keyof typeof named]];

      expect(node.params, name).toEqual({ ...rest, body: formatCurve(body, 0.5) });
      expect(node.params, name).not.toHaveProperty("bow");
      expect(node.params, name).not.toHaveProperty("play");
    });
  });

  it("are valid presets of their modules, read back with nothing lost", () => {
    FACTORY_PRESETS.forEach(({ name, node }) => {
      expect(parsePresetNode(serializePresetNode(node)), name).toMatchObject(node);
    });
  });

  it("name each preset of a module only once", () => {
    const keys = FACTORY_PRESETS.map(({ name, node }) => `${node.type}/${name.toLowerCase()}`);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("have none for a module that has no instruments of its own", () => {
    expect(factoryPresetsOf("filter")).toEqual([]);
  });
});
