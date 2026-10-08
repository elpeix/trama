export type ThemeChoice = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_KEY = "trama:theme";

const CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  return choice === "system" ? (systemDark ? "dark" : "light") : choice;
}

export function nextThemeChoice(choice: ThemeChoice): ThemeChoice {
  return CHOICES[(CHOICES.indexOf(choice) + 1) % CHOICES.length];
}

/** The theme chosen in this browser; the system's while none is, or it cannot be read. */
export function readThemeChoice(storage: ThemeStorage | undefined): ThemeChoice {
  try {
    const kept = storage?.getItem(THEME_KEY);
    return CHOICES.find((choice) => choice === kept) ?? "system";
  } catch {
    return "system";
  }
}

export function saveThemeChoice(storage: ThemeStorage | undefined, choice: ThemeChoice) {
  try {
    storage?.setItem(THEME_KEY, choice);
  } catch {
    return;
  }
}

/** Marks the page with the theme the styles follow, and tells the browser, for its scrollbars and fields. */
export function applyTheme(root: HTMLElement, theme: Theme) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
