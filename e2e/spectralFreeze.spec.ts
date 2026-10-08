import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

const SILENCE = 0.001;

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("holds the sound it gets while a key is down, after the sound has stopped", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Gain");
  await addModule(page, "Spectral Freeze");
  await addModule(page, "Keyboard");
  await addModule(page, "Output");
  await setParam(page, "spectralFreeze-3", "Mix", 1);
  await setParam(page, "spectralFreeze-3", "Release", 0.05);
  await connect(page, ["oscillator-1", "audio"], ["gain-2", "audio"]);
  await connect(page, ["gain-2", "audio"], ["spectralFreeze-3", "audio"]);
  await connect(page, ["keyboard-4", "gate"], ["spectralFreeze-3", "gate"]);
  await connect(page, ["spectralFreeze-3", "audio"], ["output-5", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await page.keyboard.down("a");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);
  await setParam(page, "gain-2", "Gain", 0);
  await page.waitForTimeout(300);
  expect(await signalLevel(page)).toBeGreaterThan(0.1);

  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await page.keyboard.up("a");
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);
});

test("plays the example of the frozen pads without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("14-frozen-pads"));
  await expect(node(page, "output-8")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
