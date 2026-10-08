import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("opens a gain slowly when what it gets jumps", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Gain");
  await addModule(page, "Math");
  await addModule(page, "Slew");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["gain-2", "audio"]);
  await connect(page, ["math-3", "out"], ["slew-4", "in"]);
  await connect(page, ["slew-4", "out"], ["gain-2", "gain"]);
  await connect(page, ["gain-2", "audio"], ["output-5", "audio"]);
  await setParam(page, "gain-2", "Gain", 0);
  await setParam(page, "slew-4", "Rise", 3);
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeLessThan(0.01);

  await setParam(page, "math-3", "B", 0.9);

  expect(await signalLevel(page)).toBeLessThan(0.5);
  await expect.poll(() => signalLevel(page), { timeout: 6000 }).toBeGreaterThan(0.8);
});

test("plays the example of the slew without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("37-slew"));
  await expect(node(page, "output-8")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
