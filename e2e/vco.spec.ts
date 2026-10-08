import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, sideLevels, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("sounds on its own, and in both channels with several voices", async ({ page }) => {
  await addModule(page, "VCO");
  await addModule(page, "Output");
  await connect(page, ["vco-1", "audio"], ["output-2", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);

  await setParam(page, "vco-1", "Voices", 7);
  await setParam(page, "vco-1", "Spread", 40);
  await expect.poll(async () => Math.min(...Object.values(await sideLevels(page)))).toBeGreaterThan(0.05);
});

test("takes a sound into its sync input", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "VCO");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["vco-2", "sync"]);
  await connect(page, ["vco-2", "audio"], ["output-3", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
  await expect(node(page, "vco-2")).toBeVisible();
});

test("plays the example of the VCO without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("46-vco"));
  await expect(node(page, "output-16")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
