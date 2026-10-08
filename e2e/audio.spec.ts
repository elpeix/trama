import { expect, test, type Page } from "@playwright/test";
import { addModule, audioState, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

const SILENCE = 0.001;

const startAudio = (page: Page) => page.getByRole("button", { name: "Start audio" }).click();

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("stays silent until the user starts the audio", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);

  await expect.poll(() => audioState(page)).toBe("suspended");
  await expect(page.getByRole("button", { name: "Start audio" })).toBeVisible();
});

test("stays stopped when a module is added after a stop", async ({ page }) => {
  await addModule(page, "Output");
  await startAudio(page);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect.poll(() => audioState(page)).toBe("suspended");

  await addModule(page, "Oscillator");

  await expect.poll(() => audioState(page)).toBe("suspended");
  await expect(page.getByRole("button", { name: "Start audio" })).toBeVisible();
});

test("starts and stops the audio with the transport button", async ({ page }) => {
  await addModule(page, "Output");

  await startAudio(page);
  await expect.poll(() => audioState(page)).toBe("running");

  await page.getByRole("button", { name: "Stop" }).click();
  await expect.poll(() => audioState(page)).toBe("suspended");
});

test("starts and stops the audio with the space bar", async ({ page }) => {
  await addModule(page, "Output");
  await page.locator(".react-flow__pane").click({ position: { x: 20, y: 20 } });

  await page.keyboard.press("Space");
  await expect.poll(() => audioState(page)).toBe("running");
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

  await page.keyboard.press("Space");
  await expect.poll(() => audioState(page)).toBe("suspended");
});

test("sounds when an oscillator reaches the output", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await startAudio(page);
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);
});

test("goes silent when the oscillator is removed", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);
  await startAudio(page);
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);

  await node(page, "oscillator-1").getByRole("button", { name: "Remove Oscillator" }).click();

  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);
});

test("plays a note from the computer keyboard", async ({ page }) => {
  await loadPatchFile(page, example("01-basic-synth"));
  await expect(node(page, "output-6")).toBeVisible();
  await startAudio(page);
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await page.keyboard.down("a");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);

  await page.keyboard.up("a");
  await expect.poll(() => signalLevel(page), { timeout: 5000 }).toBeLessThan(SILENCE);
});
