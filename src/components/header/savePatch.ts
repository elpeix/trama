import { fileNameOf } from "../../patch/meta";
import { sampleIds } from "../../patch/samples";
import { serializePatch } from "../../patch/serialization";
import type { Patch } from "../../patch/types";
import type { SampleLibrary, SampleRecord } from "../../samples/sampleLibrary";
import { downloadFile } from "./download";

/** Downloads the patch as a file, with the samples it plays that the library has. */
export async function savePatch(patch: Patch, samples?: Pick<SampleLibrary, "get">) {
  const records = samples ? await Promise.all(sampleIds(patch).map((id) => samples.get(id))) : [];
  const kept = records.filter((record): record is SampleRecord => record !== undefined);
  const json = JSON.stringify(serializePatch(patch, kept), null, 2);
  downloadFile(new Blob([json], { type: "application/json" }), fileNameOf(patch.meta));
}
