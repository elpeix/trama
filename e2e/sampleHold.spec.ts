import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("moves a gain to a new random level on each step", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Gain");
  await addModule(page, "Sample & Hold");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["gain-2", "audio"]);
  await connect(page, ["sampleHold-3", "out"], ["gain-2", "gain"]);
  await connect(page, ["gain-2", "audio"], ["output-4", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0);

  const levels: number[] = [];
  for (let read = 0; read < 12; read++) {
    levels.push(await signalLevel(page));
    await page.waitForTimeout(80);
  }

  expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.1);
});

test("plays the example of the sample and hold without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("28-sample-hold"));
  await expect(node(page, "output-7")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
