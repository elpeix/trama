import { PatchFormatError } from "./formatError";

type Json = Record<string, unknown>;

/** Takes a file of one version to the next one, without its version, which `migrate` sets. */
export type Migration = (file: Json) => Json;

interface Format {
  what: "patch" | "presets";
  current: number;
  /** The step from each older version, by the version it starts from. */
  migrations: Readonly<Record<number, Migration>>;
}

export const PATCH_MIGRATIONS: Readonly<Record<number, Migration>> = {};

export const PRESETS_MIGRATIONS: Readonly<Record<number, Migration>> = {};

const SAVED = { patch: "This patch was", presets: "These presets were" };

/** The file taken to the current version step by step; throws a PatchFormatError for a version it cannot open. */
export function migrate(file: Json, { what, current, migrations }: Format): Json {
  const version = file.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new PatchFormatError(`Unsupported ${what} version: ${String(version)}`);
  }
  if (version > current) {
    throw new PatchFormatError(
      `${SAVED[what]} saved by a newer version of Trama (format ${version}); this one opens up to format ${current}`,
    );
  }
  let migrated = file;
  for (let from = version; from < current; from++) {
    const step = migrations[from];
    if (!step) {
      throw new PatchFormatError(`Unsupported ${what} version: ${version}`);
    }
    migrated = { ...step(migrated), version: from + 1 };
  }
  return migrated;
}
