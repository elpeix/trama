import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("sounds, with its harmonics drawn as bars and its macros modulated", async ({ page }) => {
  await addModule(page, "Harmonics");
  await addModule(page, "LFO");
  await addModule(page, "Output");
  const harmonics = node(page, "harmonics-1");
  await expect(harmonics.getByRole("img", { name: "Harmonics" }).locator("rect")).toHaveCount(16);
  await connect(page, ["lfo-2", "out"], ["harmonics-1", "brightness"]);
  await connect(page, ["harmonics-1", "audio"], ["output-3", "audio"]);

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);
  await expect(harmonics.locator(".knob-modulation")).not.toHaveCount(0);
});

test("plays the example of harmonics without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("17-harmonics"));
  await expect(node(page, "output-7")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
