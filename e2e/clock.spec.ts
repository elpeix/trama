import { expect, test, type Page } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

/** An oscillator through a gain opened by an envelope, whose gate comes from `port` of the clock. */
async function buildVoice(page: Page, port: string) {
  await addModule(page, "Clock");
  await addModule(page, "ADSR");
  await addModule(page, "Oscillator");
  await addModule(page, "Gain");
  await addModule(page, "Output");
  await connect(page, ["clock-1", port], ["envelope-2", "gate"]);
  await connect(page, ["oscillator-3", "audio"], ["gain-4", "audio"]);
  await connect(page, ["envelope-2", "out"], ["gain-4", "gain"]);
  await connect(page, ["gain-4", "audio"], ["output-5", "audio"]);
  await setParam(page, "gain-4", "Gain", 0);
  await setParam(page, "envelope-2", "R", 0.01);
}

async function levelsFor(page: Page, milliseconds: number) {
  const levels: number[] = [];
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 50) {
    levels.push(await signalLevel(page));
    await page.waitForTimeout(50);
  }
  return levels;
}

test("opens a gate on each bar of the grid, and closes it halfway", async ({ page }) => {
  await buildVoice(page, "bar");

  await page.getByRole("button", { name: "Start audio" }).click();
  const levels = await levelsFor(page, 2500);

  expect(Math.max(...levels)).toBeGreaterThan(0.3);
  expect(levels.slice(levels.findIndex((level) => level > 0.3)).some((level) => level < 0.01)).toBe(true);
});

test("lets through one of every two keys once they reach its gate", async ({ page }) => {
  await buildVoice(page, "sixteenth");
  await addModule(page, "Keyboard");
  await expect(node(page, "clock-1")).toContainText("1/16 out");
  await connect(page, ["keyboard-6", "gate"], ["clock-1", "gate"]);
  await expect(node(page, "clock-1")).toContainText("÷2 out");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  const peaks: number[] = [];
  for (let key = 0; key < 3; key++) {
    await page.keyboard.down("a");
    peaks.push(Math.max(...(await levelsFor(page, 300))));
    await page.keyboard.up("a");
    await page.waitForTimeout(300);
  }

  expect(peaks[0]).toBeGreaterThan(0.3);
  expect(peaks[1]).toBeLessThan(0.01);
  expect(peaks[2]).toBeGreaterThan(0.3);
});

test("plays the example of the clock without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("30-clock"));
  await expect(node(page, "output-7")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
