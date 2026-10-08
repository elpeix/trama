import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("sets a gain to what its operation gives", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Gain");
  await addModule(page, "Math");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["gain-2", "audio"]);
  await connect(page, ["math-3", "out"], ["gain-2", "gain"]);
  await connect(page, ["gain-2", "audio"], ["output-4", "audio"]);
  await setParam(page, "gain-2", "Gain", 0);
  await setParam(page, "math-3", "B", 0.8);
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.6);

  await node(page, "math-3").getByRole("combobox", { name: "Op" }).selectOption("multiply");

  await expect.poll(() => signalLevel(page)).toBeLessThan(0.01);
});

test("plays the example of the math without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("36-math"));
  await expect(node(page, "output-9")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
