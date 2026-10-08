import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("breaks the sound it gets into grains", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Granulator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["granulator-2", "audio"]);
  await connect(page, ["granulator-2", "audio"], ["output-3", "audio"]);

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);
});

test("plays the example of grains without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("18-grains"));
  await expect(node(page, "output-7")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
