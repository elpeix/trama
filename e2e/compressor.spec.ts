import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("brings a loud sound down past its threshold, and back up with the makeup", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Compressor");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["compressor-2", "audio"]);
  await connect(page, ["compressor-2", "audio"], ["output-3", "audio"]);
  await setParam(page, "compressor-2", "Threshold", 0);
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.8);

  await setParam(page, "compressor-2", "Threshold", -40);
  await setParam(page, "compressor-2", "Ratio", 20);

  await expect.poll(() => signalLevel(page)).toBeLessThan(0.3);

  await setParam(page, "compressor-2", "Makeup", 12);

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.3);
});

test("plays the example of the compressor without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("39-compressor"));
  await expect(node(page, "output-10")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
