import { expect, test, type Locator, type Page } from "@playwright/test";
import { addModule, connect, node, openApp } from "./support";

type Rgb = [number, number, number];

const channels = (color: string): Rgb => {
  const [r, g, b] = color.match(/[\d.]+/g)!.map(Number);
  return [r, g, b];
};

const luminance = ([r, g, b]: Rgb) => {
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

const contrast = (a: Rgb, b: Rgb) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** The first colour of the background of an element: its solid colour, or where its gradient starts. */
const background = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.backgroundImage !== "none" ? style.backgroundImage : style.backgroundColor;
  });

/** The colour the background of an element starts with, as red, green and blue: a mixed one too. */
const resolved = (locator: Locator) =>
  locator.evaluate((element): Rgb => {
    const style = getComputedStyle(element);
    const image = style.backgroundImage;
    const first = image === "none" ? style.backgroundColor : image.match(/(color\([^)]*\)|rgba?\([^)]*\)|#[0-9a-f]+)/i)![0];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = first;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
  });

const text = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).color);

async function build(page: Page, scheme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: scheme });
  await openApp(page);
  await addModule(page, "Filter");
}

for (const scheme of ["light", "dark"] as const) {
  test(`reads well on the ${scheme} theme`, async ({ page }) => {
    await build(page, scheme);
    const filter = node(page, "filter-1");
    const panel = channels(await background(filter.locator(".module")));
    const screen = filter.locator(".knob-value").first();
    const button = page.getByRole("button", { name: "Add module" });

    if (scheme === "light") {
      expect(luminance(panel)).toBeGreaterThan(0.5);
    } else {
      expect(luminance(panel)).toBeLessThan(0.1);
    }
    expect(contrast(channels(await text(screen)), channels(await background(screen)))).toBeGreaterThan(4.5);
    expect(contrast(channels(await text(button)), channels(await background(button)))).toBeGreaterThan(4.5);
    expect(
      contrast(channels(await text(filter.locator(".module-header"))), panel),
    ).toBeGreaterThan(4.5);
  });
}

test("makes the knobs aluminium on the light theme, with a pointer and a ring that stand out", async ({ page }) => {
  await build(page, "light");
  const knob = node(page, "filter-1").locator(".knob-face").first();
  const paint = (selector: string, property: "fill" | "stroke" | "stopColor") =>
    knob.locator(selector).first().evaluate((element, name) => getComputedStyle(element)[name], property);

  const cap = channels(await paint(".knob-cap-light", "stopColor"));
  const pointer = channels(await paint(".knob-pointer", "stroke"));
  const well = channels(await paint(".knob-body", "fill"));
  const ring = channels(await paint(".knob-arc", "stroke"));

  expect(luminance(cap)).toBeGreaterThan(0.5);
  expect(contrast(pointer, cap)).toBeGreaterThan(4.5);
  expect(contrast(ring, well)).toBeGreaterThan(4.5);
});

for (const scheme of ["light", "dark"] as const) {
  test(`lights what is on the screens with the green of a screen on the ${scheme} theme, and no blue`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await addModule(page, "Seq");
    const seq = node(page, "sequencer-1");
    const step = seq.locator(".step-cell-on").first();
    const panel = channels(await background(seq.locator(".module")));

    const [r, g, b] = channels(await step.evaluate((element) => getComputedStyle(element).backgroundColor));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
    expect(contrast([r, g, b], panel)).toBeGreaterThan(3);
  });
}

test("gives the colour of each kind of module a shade of its own on each theme", async ({ page }) => {
  const shade = () =>
    page
      .getByRole("button", { name: "Bank B" })
      .evaluate((element) => getComputedStyle(element.closest(".module")!).getPropertyValue("--category").trim());
  await page.emulateMedia({ colorScheme: "light" });
  await openApp(page);
  await addModule(page, "Seq");
  const light = await shade();

  await page.emulateMedia({ colorScheme: "dark" });

  await expect.poll(shade).not.toBe(light);
});

test("takes the theme chosen over the system's, and keeps it after a reload", async ({ page }) => {
  await build(page, "light");
  const panel = async () => luminance(channels(await background(node(page, "filter-1").locator(".module"))));
  expect(await panel()).toBeGreaterThan(0.5);

  await page.getByRole("button", { name: "Theme: system" }).click();
  await page.getByRole("button", { name: "Theme: light" }).click();

  await expect(page.getByRole("button", { name: "Theme: dark" })).toBeVisible();
  expect(await panel()).toBeLessThan(0.1);
  await expect(page.locator(".react-flow")).toHaveClass(/dark/);

  await page.reload();
  await expect(page.getByRole("button", { name: "Theme: dark" })).toBeVisible();
  expect(await panel()).toBeLessThan(0.1);

  await page.getByRole("button", { name: "Theme: dark" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(panel).toBeLessThan(0.1);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(panel).toBeGreaterThan(0.5);
});

for (const scheme of ["light", "dark"] as const) {
  test(`picks out the bank shown from the others on the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await addModule(page, "Seq");
    const bank = (letter: string) => node(page, "sequencer-1").getByRole("button", { name: `Bank ${letter}` });
    await bank("B").click();

    const shown = await resolved(bank("B"));
    for (const other of ["A", "C"]) {
      expect(contrast(shown, await resolved(bank(other)))).toBeGreaterThan(scheme === "dark" ? 2.5 : 1.1);
    }
    expect(contrast(channels(await text(bank("B"))), shown)).toBeGreaterThan(4.5);
  });
}

test("sets the light of the bank shown in a dark well on the dark theme, and leaves the others plain", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openApp(page);
  await addModule(page, "Seq");
  const bank = (letter: string) => node(page, "sequencer-1").getByRole("button", { name: `Bank ${letter}` });
  const well = (letter: string) =>
    bank(letter)
      .locator(".pattern-led")
      .evaluate((led) => {
        const style = getComputedStyle(led);
        return { color: style.outlineColor, width: style.outlineStyle === "none" ? 0 : parseFloat(style.outlineWidth) };
      });

  const shown = await well("A");
  const ringOnBank = await page.evaluate(
    ({ under, over }) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d")!;
      context.fillStyle = `rgb(${under.join(",")})`;
      context.fillRect(0, 0, 1, 1);
      context.fillStyle = over;
      context.fillRect(0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      return [r, g, b] as [number, number, number];
    },
    { under: await resolved(bank("A")), over: shown.color },
  );

  expect(shown.width).toBeGreaterThanOrEqual(1);
  expect(contrast(ringOnBank, await resolved(bank("A")))).toBeGreaterThan(1.5);
  expect((await well("B")).width).toBe(0);
});


test("draws the meters as rows of lights, the ones off still showing dim", async ({ page }) => {
  await openApp(page);
  await addModule(page, "Noise");
  await addModule(page, "Mixer");
  await addModule(page, "Output");
  await connect(page, ["noise-1", "audio"], ["mixer-2", "audio"]);
  const look = (locator: Locator) =>
    locator.evaluate((element) => {
      const lights = element.closest(".level-meter-bar, .meter-track")!;
      const cover = getComputedStyle(element).backgroundColor;
      const alpha = Number(cover.match(/rgba?\([^)]*,\s*([\d.]+)\)/)?.[1] ?? 1);
      return { segmented: getComputedStyle(lights).backgroundImage.includes("repeating-linear-gradient"), coverAlpha: alpha };
    });

  for (const cover of [
    node(page, "mixer-2").locator(".level-meter-cover").first(),
    node(page, "output-3").locator(".meter-cover").first(),
  ]) {
    const { segmented, coverAlpha } = await look(cover);
    expect(segmented).toBe(true);
    expect(coverAlpha).toBeGreaterThan(0.3);
    expect(coverAlpha).toBeLessThan(0.95);
  }
});

for (const scheme of ["light", "dark"] as const) {
  test(`dims the lights off of a meter towards the panel on the ${scheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await addModule(page, "Output");
    const colors = await node(page, "output-1")
      .locator(".meter-cover")
      .first()
      .evaluate((cover) => {
        const paint = (...layers: string[]) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d")!;
          for (const layer of layers) {
            context.fillStyle = layer;
            context.fillRect(0, 0, 1, 1);
          }
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return [r, g, b] as [number, number, number];
        };
        const lit = getComputedStyle(document.documentElement).getPropertyValue("--trigger").trim();
        return { lit: paint(lit), off: paint(lit, getComputedStyle(cover).backgroundColor) };
      });

    if (scheme === "light") {
      expect(luminance(colors.off)).toBeGreaterThan(luminance(colors.lit));
    } else {
      expect(luminance(colors.off)).toBeLessThan(luminance(colors.lit));
    }
    expect(contrast(colors.off, colors.lit)).toBeGreaterThan(2);
  });
}

test("sets Tap flush with the tempo display, the block as flat as the swing one", async ({ page }) => {
  await openApp(page);
  const tap = page.getByRole("button", { name: "Tap" });
  const shadow = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).boxShadow);

  expect(await shadow(tap)).not.toMatch(/\) 0px 1px 1px 0px(,|$)/);
  expect(await shadow(tap)).toContain("inset");
  expect(await shadow(page.locator(".tempo"))).toBe("none");
  expect(await shadow(page.locator(".tempo-screen").first())).toBe(await shadow(page.locator(".swing-screen")));
});
