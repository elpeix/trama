import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("drives a quiet sound up to full scale", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Gain");
  await addModule(page, "Distortion");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["gain-2", "audio"]);
  await connect(page, ["gain-2", "audio"], ["distortion-3", "audio"]);
  await connect(page, ["distortion-3", "audio"], ["output-4", "audio"]);
  await setParam(page, "gain-2", "Gain", 0.1);
  await setParam(page, "distortion-3", "Drive", 40);
  await setParam(page, "distortion-3", "Tone", 20000);

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.9);
});

test("draws its curve only while drawn", async ({ page }) => {
  await addModule(page, "Distortion");
  const shape = node(page, "distortion-1").getByRole("img", { name: "Shape" });
  await expect(shape).toHaveCount(0);

  await node(page, "distortion-1").getByRole("combobox", { name: "Mode" }).selectOption("drawn");

  await expect(shape).toBeVisible();
});

test("plays the example of the distortion without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("27-distortion"));
  await expect(node(page, "output-8")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
