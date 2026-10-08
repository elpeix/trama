import { MODULE_CATEGORIES, moduleRegistry } from "../../patch/registry";
import type { NodeType } from "../../patch/types";

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const categoryLabel = (type: NodeType) =>
  MODULE_CATEGORIES.find(({ id }) => id === moduleRegistry[type].category)?.label ?? "";

/** Something the menu of modules offers: a module, or a subpatch saved as a module of its own. */
export interface Searchable {
  title: string;
  description: string;
  group: string;
}

/**
 * The entries with every word of the query in their name, what they do or their group, those
 * whose name starts with it first, then those with a word of the name that does, then the rest;
 * all of them, in their order, without a query.
 */
export function searchEntries<T extends Searchable>(query: string, entries: readonly T[]): T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [...entries];
  }
  const whole = words.join(" ");
  const rank = (entry: T) => {
    const title = normalize(entry.title);
    if (title.startsWith(whole)) {
      return 0;
    }
    return title.split(/\s+/).some((word) => word.startsWith(words[0])) ? 1 : 2;
  };
  return entries
    .filter((entry) => {
      const text = normalize(`${entry.title} ${entry.description} ${entry.group}`);
      return words.every((word) => text.includes(word));
    })
    .map((entry, index) => ({ entry, index, rank: rank(entry) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ entry }) => entry);
}

/** The modules that match a query, as `searchEntries` ranks them. */
export function searchModules(query: string, types: readonly NodeType[]): NodeType[] {
  const entries = types.map((type) => ({ type, ...moduleRegistry[type], group: categoryLabel(type) }));
  return searchEntries(query, entries).map(({ type }) => type);
}
