import type { PatchMeta } from "./types";

export const META_LIMITS: Record<keyof PatchMeta, number> = { title: 80, author: 80, description: 500, link: 300 };

const APP_NAME = "Trama";
const DEFAULT_FILE_NAME = "trama-patch.json";

export const META_FIELDS = Object.keys(META_LIMITS) as (keyof PatchMeta)[];

/** The meta with the fields given changed, trimmed and cut to their length; undefined once all are empty. */
export function withMeta(meta: PatchMeta | undefined, changes: Partial<PatchMeta>): PatchMeta | undefined {
  const merged = { ...meta, ...changes };
  const kept = META_FIELDS.flatMap((field) => {
    const value = merged[field]?.trim().slice(0, META_LIMITS[field]);
    return value ? [[field, value] as const] : [];
  });
  return kept.length > 0 ? Object.fromEntries(kept) : undefined;
}

/** Whether a link can be opened safely: a web page, and never a script or data of its own. */
export function isSafeLink(link: string): boolean {
  try {
    const { protocol } = new URL(link);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** The name a piece is saved under: its title, plain, in lowercase and with dashes. */
export function fileNameOf(meta: PatchMeta | undefined): string {
  const slug = (meta?.title ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `${slug}.json` : DEFAULT_FILE_NAME;
}

export function documentTitle(meta: PatchMeta | undefined): string {
  return meta?.title ? `${meta.title} — ${APP_NAME}` : APP_NAME;
}
