import { describe, expect, it } from "vitest";
import { EXAMPLE_CATEGORIES, EXAMPLES, loadExample } from "./exampleCatalog";
import { parsePatch } from "./serialization";
import { allNodes } from "./subpatch";

const files = Object.keys(import.meta.glob("../../examples/*.json")).map((path) => path.replace(/^.*\/(.*)\.json$/, "$1"));

describe("the catalog of examples", () => {
  it("lists every example patch once", () => {
    expect(EXAMPLES.map(({ id }) => id).sort()).toEqual([...files].sort());
  });

  it("puts each example in a category, those of a category together and the categories in their order", () => {
    const categories = EXAMPLES.map(({ category }) => EXAMPLE_CATEGORIES.findIndex(({ id }) => id === category));

    expect(categories).not.toContain(-1);
    expect(categories).toEqual([...categories].sort((a, b) => a - b));
    expect(new Set(categories).size).toBe(EXAMPLE_CATEGORIES.length);
  });

  it("starts with the first steps", () => {
    expect(EXAMPLES[0]).toMatchObject({ id: "01-basic-synth", category: EXAMPLE_CATEGORIES[0].id });
  });

  it("gives each one a title of its own and a line on what it does", () => {
    expect(new Set(EXAMPLES.map(({ title }) => title)).size).toBe(EXAMPLES.length);
    EXAMPLES.forEach(({ title, description }) => {
      expect(title.trim()).not.toBe("");
      expect(description.trim()).not.toBe("");
    });
  });

  it("marks the examples played from the keys, the one that listens to the microphone, and the one played from MIDI", async () => {
    const needs = await Promise.all(
      EXAMPLES.map(async ({ id }) => {
        const nodes = allNodes(parsePatch(await loadExample(id)));
        if (nodes.some((node) => node.type === "audioInput")) {
          return "microphone";
        }
        if (nodes.some((node) => node.type === "midiInput")) {
          return "midi";
        }
        const keys = nodes.some(
          (node) => node.type === "keyboard" || (node.type === "arpeggiator" && node.params.source === "keys"),
        );
        return keys ? "keys" : undefined;
      }),
    );

    expect(EXAMPLES.map((example) => example.needs)).toEqual(needs);
  });

  it("loads the file of an example as a patch", async () => {
    const file = await loadExample("09-sequencer");

    expect(parsePatch(file).nodes.some((node) => node.type === "sequencer")).toBe(true);
  });

  it("rejects an example it does not have", async () => {
    await expect(loadExample("99-nope")).rejects.toThrow(/99-nope/);
  });
});
