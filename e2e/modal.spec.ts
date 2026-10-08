import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

const SILENCE = 0.001;

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("strikes a bell with each key, and lets it ring on after the key goes up", async ({ page }) => {
  await addModule(page, "Keyboard");
  await addModule(page, "Modal");
  await addModule(page, "Output");
  await node(page, "modal-2").getByRole("combobox", { name: "Mode", exact: true }).selectOption("keyboard");
  await connect(page, ["keyboard-1", "pitch"], ["modal-2", "detune"]);
  await connect(page, ["keyboard-1", "gate"], ["modal-2", "gate"]);
  await connect(page, ["modal-2", "audio"], ["output-3", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await page.keyboard.down("a");
  await page.keyboard.up("a");

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
});

test("plays the example of the Modal without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("48-modal"));
  await expect(node(page, "output-7")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
});
