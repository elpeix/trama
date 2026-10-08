import { expect, test, type Locator, type Page } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const startAudio = (page: Page) => page.getByRole("button", { name: "Start audio" }).click();

async function drawAcross(page: Page, curve: Locator, height: number) {
  const box = (await curve.boundingBox())!;
  const y = box.y + box.height * height;
  await page.mouse.move(box.x + 2, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 2, y, { steps: 12 });
  await page.mouse.up();
}

test("draws the wave of an oscillator without moving the node, as one undo step", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);
  const oscillator = node(page, "oscillator-1");
  await oscillator.getByRole("combobox", { name: "Wave" }).selectOption("drawn");
  const shape = oscillator.getByRole("img", { name: "Shape" });
  const line = shape.locator("polyline");
  const drawn = await line.getAttribute("points");
  const position = await oscillator.boundingBox();

  await drawAcross(page, shape, 0.25);

  await expect(line).not.toHaveAttribute("points", drawn!);
  expect(await oscillator.boundingBox()).toEqual(position);
  await startAudio(page);
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(line).toHaveAttribute("points", drawn!);
});

test("plays the harmonics drawn as bars", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);
  await node(page, "oscillator-1").getByRole("combobox", { name: "Wave" }).selectOption("harmonics");

  await expect(node(page, "oscillator-1").getByRole("img", { name: "Harmonics" }).locator("rect")).toHaveCount(16);
  await startAudio(page);
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);
});

test("cuts the sound where the response of a custom filter is drawn down", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Custom Filter");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["customFilter-2", "audio"]);
  await connect(page, ["customFilter-2", "audio"], ["output-3", "audio"]);
  await startAudio(page);
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.5);

  await drawAcross(page, node(page, "customFilter-2").getByRole("img", { name: "Response" }), 0.97);

  await expect.poll(() => signalLevel(page)).toBeLessThan(0.1);
});

test("plays the example of drawn waves without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("11-drawn-waves"));
  await expect(node(page, "output-12")).toBeVisible();

  await expect(node(page, "oscillator-2").getByRole("img", { name: "Harmonics" })).toBeVisible();
  await expect(node(page, "oscillator-6").getByRole("img", { name: "Shape" })).toBeVisible();
  await expect(node(page, "customFilter-7").getByRole("img", { name: "Response" })).toBeVisible();
  await startAudio(page);
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`draws a curve on a screen like the others in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await addModule(page, "Strings");
    const body = node(page, "strings-1").getByRole("img", { name: "Body" });
    const colors = await body.evaluate((curve) => {
      const probe = document.createElement("div");
      probe.style.color = "var(--lcd-bg)";
      probe.style.backgroundColor = "var(--lcd-text)";
      document.body.append(probe);
      const screen = getComputedStyle(probe).color;
      const ink = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        background: getComputedStyle(curve).backgroundColor,
        bar: getComputedStyle(curve.querySelector(".curve-bar")!).fill,
        screen,
        ink,
      };
    });

    expect(colors.background).toBe(colors.screen);
    expect(colors.bar).toBe(colors.ink);
  });
}
