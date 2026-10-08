import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("lets a sound through, shifted and mixed", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Pitch Shifter");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["pitchShifter-2", "audio"]);
  await connect(page, ["pitchShifter-2", "audio"], ["output-3", "audio"]);

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.3);
});

test("plays the example of the harmonizer without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("13-harmonizer"));
  await expect(node(page, "output-7")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
