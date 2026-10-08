import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

const SILENCE = 0.001;

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("blows a note while a key of the Keyboard is down, and stops when it goes up", async ({ page }) => {
  await addModule(page, "Keyboard");
  await addModule(page, "Wind");
  await addModule(page, "Output");
  await connect(page, ["keyboard-1", "notes"], ["wind-2", "notes"]);
  await connect(page, ["wind-2", "audio"], ["output-3", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await page.keyboard.down("a");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
  await page.keyboard.up("a");

  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);
});

test("plays the example of the clarinet without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("53-wind"));
  await expect(node(page, "output-4")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
});

test("gives a Wind the settings of an instrument that comes with it", async ({ page }) => {
  await addModule(page, "Wind");
  await node(page, "wind-1").getByRole("button", { name: "Presets of Wind" }).click();
  const menu = page.getByRole("dialog", { name: "Presets of Wind" });

  await menu.getByRole("list", { name: "Built-in presets" }).getByRole("button", { name: "Oboe" }).click();

  await expect(node(page, "wind-1").getByRole("combobox", { name: "Exciter", exact: true })).toHaveValue("double reed");
  await expect(node(page, "wind-1").getByRole("combobox", { name: "Bore", exact: true })).toHaveValue("cone");
});
