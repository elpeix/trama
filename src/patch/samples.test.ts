import { describe, expect, it } from "vitest";
import { formatSampleList, fromBase64, MAX_SAMPLES, parseSampleList, sampleIds, toBase64 } from "./samples";
import type { Graph, PatchNode } from "./types";

const sampler = (id: string, sample: string): PatchNode => ({
  id,
  type: "sampler",
  position: { x: 0, y: 0 },
  params: { sample },
});

describe("sampleIds", () => {
  it("lists the samples of the samplers, inside subpatches too, each once and none for an empty one", () => {
    const graph: Graph = {
      nodes: [
        sampler("a", "0000000000000001"),
        sampler("b", ""),
        {
          id: "subpatch-1",
          type: "subpatch",
          position: { x: 0, y: 0 },
          params: { voices: 4 },
          patch: { nodes: [sampler("c", "0000000000000002"), sampler("d", "0000000000000001")], connections: [] },
        },
      ],
      connections: [],
    };

    expect(sampleIds(graph)).toEqual(["0000000000000001", "0000000000000002"]);
  });
});

describe("sampleIds of samplers with several samples", () => {
  it("lists every sample of each sampler, each once", () => {
    const graph: Graph = {
      nodes: [sampler("a", "0000000000000001 0000000000000002"), sampler("b", "0000000000000002 0000000000000003")],
      connections: [],
    };

    expect(sampleIds(graph)).toEqual(["0000000000000001", "0000000000000002", "0000000000000003"]);
  });
});

describe("parseSampleList and formatSampleList", () => {
  it("reads the samples of a sampler from its ids separated by spaces, none from nothing", () => {
    expect(parseSampleList("0000000000000001 0000000000000002")).toEqual(["0000000000000001", "0000000000000002"]);
    expect(parseSampleList("0000000000000001")).toEqual(["0000000000000001"]);
    expect(parseSampleList("")).toEqual([]);
  });

  it("gives undefined for what is not a list of sample ids, or a longer one than a sampler holds", () => {
    expect(parseSampleList("0000000000000001 nope")).toBeUndefined();
    expect(parseSampleList(Array(MAX_SAMPLES + 1).fill("0000000000000001").join(" "))).toBeUndefined();
  });

  it("writes them back separated by spaces", () => {
    expect(formatSampleList(["0000000000000001", "0000000000000002"])).toBe("0000000000000001 0000000000000002");
  });
});

describe("base64", () => {
  it("round trips any bytes, beyond what one call of fromCharCode takes", () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, index) => (index * 7) % 256);

    expect(new Uint8Array(fromBase64(toBase64(bytes.buffer)))).toEqual(bytes);
    expect(toBase64(new Uint8Array([104, 105]).buffer)).toBe("aGk=");
  });

  it("throws for what is not base64", () => {
    expect(() => fromBase64("***")).toThrow();
  });
});
