import { SAMPLE_ID_PATTERN } from "../samples/sampleLibrary";
import { moduleRegistry } from "./registry";
import { allNodes } from "./subpatch";
import type { Graph } from "./types";

/** The most samples a sampler holds. */
export const MAX_SAMPLES = 8;

/** The samples of a sampler, from their ids separated by spaces; undefined for what is not one. */
export function parseSampleList(text: string): string[] | undefined {
  const ids = text.split(" ").filter(Boolean);
  return ids.length <= MAX_SAMPLES && ids.every((id) => SAMPLE_ID_PATTERN.test(id)) ? ids : undefined;
}

export function formatSampleList(ids: readonly string[]): string {
  return ids.join(" ");
}

/** The samples the samplers of a graph play, those inside its subpatches too, each once. */
export function sampleIds(graph: Graph): string[] {
  const ids = allNodes(graph).flatMap((node) =>
    moduleRegistry[node.type].params
      .filter((param) => param.kind === "sample")
      .flatMap((param) => parseSampleList(String(node.params[param.id] ?? "")) ?? []),
  );
  return [...new Set(ids)];
}

/** Enough bytes at a time for `String.fromCharCode` not to run out of arguments. */
const CHUNK = 0x8000;

export function toBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

/** The bytes a base64 text stands for; throws when it is not base64. */
export function fromBase64(text: string): ArrayBuffer {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
