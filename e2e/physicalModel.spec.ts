import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

const SILENCE = 0.001;

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("plucks a string with each key, and lets it fade", async ({ page }) => {
  await addModule(page, "Keyboard");
  await addModule(page, "Physical Model");
  await addModule(page, "Output");
  await node(page, "physicalModel-2").getByRole("combobox", { name: "Mode" }).selectOption("keyboard");
  await setParam(page, "physicalModel-2", "Decay", 0.3);
  await connect(page, ["keyboard-1", "pitch"], ["physicalModel-2", "detune"]);
  await connect(page, ["keyboard-1", "gate"], ["physicalModel-2", "gate"]);
  await connect(page, ["physicalModel-2", "audio"], ["output-3", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await page.keyboard.down("a");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
  await page.keyboard.up("a");

  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);
});

test("plays the example of plucked strings without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("12-plucked-strings"));
  await expect(node(page, "output-8")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
