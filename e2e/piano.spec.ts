import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

const SILENCE = 0.001;

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("plays a note for each key of the Keyboard, and damps it when the key goes up", async ({ page }) => {
  await addModule(page, "Keyboard");
  await addModule(page, "Piano");
  await addModule(page, "Output");
  await connect(page, ["keyboard-1", "notes"], ["piano-2", "notes"]);
  await connect(page, ["piano-2", "audio"], ["output-3", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await page.keyboard.down("a");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
  await page.keyboard.up("a");

  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);
});

test("plays the example of the Piano without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("50-piano"));
  await expect(node(page, "output-4")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
});

test("does not ring on from before a stop when the sound starts again", async ({ page }) => {
  await addModule(page, "Keyboard");
  await addModule(page, "Piano");
  await addModule(page, "Output");
  await connect(page, ["keyboard-1", "notes"], ["piano-2", "notes"]);
  await connect(page, ["piano-2", "audio"], ["output-3", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await page.keyboard.down("a");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);

  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);
  for (let read = 0; read < 5; read++) {
    await page.waitForTimeout(100);
    expect(await signalLevel(page)).toBeLessThan(SILENCE);
  }
  await page.keyboard.up("a");
});
