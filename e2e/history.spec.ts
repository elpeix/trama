import { expect, test } from "@playwright/test";
import { addModule, connect, edge, edgeIds, node, openApp, signalLevel } from "./support";

const UNDO = "ControlOrMeta+z";
const REDO = "ControlOrMeta+Shift+z";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("undoes and redoes adding a module", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
  await addModule(page, "Gain");

  await page.keyboard.press(UNDO);
  await expect(node(page, "gain-1")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Redo" })).toBeEnabled();

  await page.keyboard.press(REDO);
  await expect(node(page, "gain-1")).toBeVisible();
});

test("undoes a Backspace deletion in one step, cables included", async ({ page }) => {
  for (const title of ["Oscillator", "Filter", "Output"]) {
    await addModule(page, title);
  }
  await connect(page, ["oscillator-1", "audio"], ["filter-2", "audio"]);
  await connect(page, ["filter-2", "audio"], ["output-3", "audio"]);
  await node(page, "filter-2").locator(".module-header").click();

  await page.keyboard.press("Backspace");
  await expect(node(page, "filter-2")).toHaveCount(0);
  expect(await edgeIds(page)).toEqual([]);

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(node(page, "filter-2")).toBeVisible();
  await expect.poll(() => edgeIds(page)).toEqual([
    "oscillator-1:audio->filter-2:audio",
    "filter-2:audio->output-3:audio",
  ]);
});

test("brings the sound back when undoing a deletion", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);

  await node(page, "oscillator-1").getByRole("button", { name: "Remove Oscillator" }).click();
  await expect.poll(() => signalLevel(page)).toBeLessThan(0.001);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);
});

test("undoes a whole knob drag in one step", async ({ page }) => {
  await addModule(page, "Gain");
  const knob = node(page, "gain-1").getByRole("slider", { name: "Gain" });
  const box = (await knob.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 10 });
  await page.mouse.up();
  await expect(node(page, "gain-1").locator(".knob-value")).not.toHaveText("0.50");

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(node(page, "gain-1").locator(".knob-value")).toHaveText("0.50");
  await expect(node(page, "gain-1")).toBeVisible();
});

test("undoes a connection", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);
  await expect(edge(page, "oscillator-1:audio->output-2:audio")).toHaveCount(1);

  await page.keyboard.press(UNDO);

  await expect.poll(() => edgeIds(page)).toEqual([]);
});
