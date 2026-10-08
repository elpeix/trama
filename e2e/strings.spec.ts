import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

const SILENCE = 0.001;

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("bows a note while a key of the Keyboard is down, and stops when it goes up", async ({ page }) => {
  await addModule(page, "Keyboard");
  await addModule(page, "Strings");
  await addModule(page, "Output");
  await connect(page, ["keyboard-1", "notes"], ["strings-2", "notes"]);
  await connect(page, ["strings-2", "audio"], ["output-3", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await page.keyboard.down("a");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
  await page.keyboard.up("a");

  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);
});

test("plays the example of the strings without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("54-strings"));
  await expect(node(page, "output-5")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
});

test("gives a Strings the settings of an instrument that comes with it", async ({ page }) => {
  await addModule(page, "Strings");
  await node(page, "strings-1").getByRole("button", { name: "Presets of Strings" }).click();
  const menu = page.getByRole("dialog", { name: "Presets of Strings" });

  await menu.getByRole("list", { name: "Built-in presets" }).getByRole("button", { name: "Cello" }).click();

  await expect(node(page, "strings-1").getByRole("slider", { name: "Attack", exact: true })).toHaveAttribute("aria-valuenow", "0.4");
});
