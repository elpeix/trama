import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("lets a sound through the room alone, with the mix all wet", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Reverb");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["reverb-2", "audio"]);
  await connect(page, ["reverb-2", "audio"], ["output-3", "audio"]);
  await setParam(page, "reverb-2", "Mix", 1);

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});

test("plays the example of the reverb without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("26-reverb"));
  await expect(node(page, "output-7")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
