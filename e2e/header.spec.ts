import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { brightness, expectBrighterOnHover, expectLitWhileTyping, openApp } from "./support";

const PARTS = [
  ".logo",
  ".patch-file",
  '[role="group"][aria-label="History"]',
  ".module-menu-trigger",
  ".piece-info",
  ".source-control",
  ".app-header-transport > .hw-song",
  ".tempo",
  ".swing-screen",
  ".meter-screen",
  ".record",
  ".hw-transport",
  ".stopped-sound",
  ".theme-button",
];

type Box = { name: string; x: number; y: number; width: number; height: number };

async function boxes(page: Page) {
  const found: Box[] = [];
  for (const name of PARTS) {
    const box = await page.locator(".app-header").locator(name).first().boundingBox();
    expect(box, name).not.toBeNull();
    found.push({ name, ...box! });
  }
  return found;
}

const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

async function nameThePiece(page: Page, title: string) {
  await page.getByRole("button", { name: /^Piece:/ }).click();
  await page.getByRole("dialog", { name: "Piece" }).getByLabel("Title").fill(title);
  await page.keyboard.press("Escape");
}

for (const width of [1600, 1280, 1100, 1000, 900]) {
  test(`keeps every part of the bar apart and in view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openApp(page);
    await nameThePiece(page, "Vespra sobre els cingles de Siurana (Strings)");

    const found = await boxes(page);

    for (const box of found) {
      expect(box.x, box.name).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, box.name).toBeLessThanOrEqual(width);
    }
    for (const [index, a] of found.entries()) {
      for (const b of found.slice(index + 1)) {
        expect(overlap(a, b), `${a.name} and ${b.name}`).toBe(false);
      }
    }
  });
}

test("sets the piece in the middle of a wide bar", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 800 });
  await openApp(page);

  const piece = (await page.locator(".piece-info").boundingBox())!;

  expect(piece.x + piece.width / 2).toBeCloseTo(800, -1);
});

for (const width of [1000, 900]) {
  test(`sets the piece at the right end of a narrow bar at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openApp(page);

    const header = (await page.locator(".app-header").boundingBox())!;
    const piece = (await page.locator(".piece-info").boundingBox())!;

    expect(header.x + header.width - (piece.x + piece.width)).toBeCloseTo(16, 0);
  });
}

for (const width of [1600, 1280, 1000]) {
  test(`leaves room between the logo and the file keys at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openApp(page);

    const logo = page.locator(".app-header .logo-button");
    const name = logo.locator(".logo-name");
    const mark = (await ((await name.isVisible()) ? name : logo.locator(".logo-mark")).boundingBox())!;
    const file = (await page.locator(".app-header .patch-file").boundingBox())!;

    expect(file.x - (mark.x + mark.width)).toBeGreaterThanOrEqual(16);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`sets the bar on the panel colours of the hardware in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openApp(page);

    const colours = await page.locator(".app-header").evaluate((header) => {
      const probe = document.createElement("div");
      probe.style.background = "var(--hw-surface)";
      probe.style.borderColor = "var(--hw-border)";
      header.append(probe);
      const panel = getComputedStyle(probe);
      const found = { background: panel.backgroundColor, border: panel.borderTopColor };
      probe.remove();
      const bar = getComputedStyle(header);
      return { bar: { background: bar.backgroundColor, border: bar.borderBottomColor }, panel: found };
    });

    expect(colours.bar).toEqual(colours.panel);
  });
}

const KEYS = [".module-menu-trigger", ".tempo-tap", ".hw-transport", ".theme-button", ".app-header-transport > .hw-song"];
const QUIET_KEYS = ['[role="group"][aria-label="History"] button:disabled', '.source-control [aria-pressed="true"]'];
const SCREENS = [".tempo .tempo-screen", ".swing-screen"];

async function surfaceOnHover(page: Page, name: string) {
  const part = page.locator(".app-header").locator(name).first();
  const surface = () =>
    part.evaluate((element) => {
      const style = getComputedStyle(element);
      return `${style.backgroundImage} ${style.backgroundColor}`;
    });
  await page.mouse.move(0, 700);
  const before = await surface();
  await part.hover({ force: true });
  return { before, after: surface };
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`lights up the keys and the screens under the pointer in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openApp(page);

    for (const name of [...KEYS, ...SCREENS]) {
      const { before, after } = await surfaceOnHover(page, name);
      await expect.poll(after, { message: name }).not.toBe(before);
    }
  });

  test(`leaves the disabled and the pressed keys still under the pointer in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openApp(page);

    for (const name of QUIET_KEYS) {
      const { before, after } = await surfaceOnHover(page, name);
      await page.waitForTimeout(150);
      expect(await after(), name).toBe(before);
    }
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`lights the screen of the logo up under the pointer and while the audio runs in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openApp(page);
    const screen = page.locator(".app-header .logo-mark");

    await expectBrighterOnHover(page, screen, "the logo under the pointer");

    await page.mouse.move(0, 700);
    await page.waitForTimeout(200);
    const off = await brightness(screen);
    await page.getByRole("button", { name: "Start audio" }).click();
    await page.mouse.move(0, 700);
    await expect.poll(() => brightness(screen), { message: "the logo while the audio runs" }).toBeGreaterThan(off + 5);
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`engraves the name on the panel in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openApp(page);

    const look = await page.locator(".app-header .logo-name").evaluate((name) => {
      const probe = document.createElement("span");
      probe.style.color = "var(--engrave-ink)";
      probe.style.textShadow = "0 1px 0 var(--engrave-light), 0 -1px 0 var(--engrave-shade)";
      name.append(probe);
      const engraved = { color: getComputedStyle(probe).color, shadow: getComputedStyle(probe).textShadow };
      probe.remove();
      return { name: { color: getComputedStyle(name).color, shadow: getComputedStyle(name).textShadow }, engraved };
    });

    expect(look.engraved.shadow).not.toBe("none");
    expect(look.name).toEqual(look.engraved);
  });
}

test("draws the favicon with the screen and the ink of the light theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openApp(page);
  const favicon = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");

  const colours = await page.evaluate((source) => {
    const icon = new DOMParser().parseFromString(source, "image/svg+xml");
    const probe = document.createElement("div");
    document.body.append(probe);
    const resolve = (colour: string) => {
      probe.style.color = colour;
      return getComputedStyle(probe).color;
    };
    const drawn = {
      screen: resolve(icon.querySelector("rect")!.getAttribute("fill")!),
      jack: resolve(icon.querySelector(".jack")!.getAttribute("fill")!),
      cable: resolve(icon.querySelector(".cable")!.getAttribute("stroke")!),
    };
    const theme = { screen: resolve("var(--lcd-bg)"), jack: resolve("var(--lcd-text)"), cable: resolve("var(--lcd-text)") };
    probe.remove();
    return { drawn, theme };
  }, favicon);

  expect(colours.drawn).toEqual(colours.theme);
});

const DISPLAYS = { Tempo: ".tempo .tempo-screen", Swing: ".swing-screen" };

for (const colorScheme of ["light", "dark"] as const) {
  test(`lights the whole screen of the tempo and the swing under the pointer and while typed in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openApp(page);
    const header = page.locator(".app-header");

    for (const [name, selector] of Object.entries(DISPLAYS)) {
      const screen = header.locator(selector);
      const value = screen.getByRole("spinbutton", { name });
      await expectBrighterOnHover(page, value, name, screen);
      await expectLitWhileTyping(page, value, screen.getByRole("textbox", { name }), name, screen);
      await page.keyboard.press("Escape");
    }
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`lights the whole screen of the meter under the pointer in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await openApp(page);
    const screen = page.locator(".app-header .meter-screen");

    await expectBrighterOnHover(page, screen.getByRole("combobox", { name: "Meter" }), "Meter", screen);
  });
}
