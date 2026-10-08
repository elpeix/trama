import { expect, test } from "@playwright/test";
import { addModule, connect, edge, node, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("copies, pastes and duplicates the selected modules with their cables", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Filter");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["filter-2", "audio"]);
  await connect(page, ["filter-2", "audio"], ["output-3", "audio"]);

  await node(page, "oscillator-1").locator(".module-header").click();
  await page.keyboard.down("Meta");
  await node(page, "filter-2").locator(".module-header").click();
  await page.keyboard.up("Meta");
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");

  await expect(node(page, "oscillator-4")).toBeVisible();
  await expect(node(page, "filter-5")).toBeVisible();
  await expect(edge(page, "oscillator-4:audio->filter-5:audio")).toHaveCount(1);
  await expect(edge(page, "filter-5:audio->output-3:audio")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+d");

  await expect(node(page, "oscillator-6")).toBeVisible();
  await expect(edge(page, "oscillator-6:audio->filter-7:audio")).toHaveCount(1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(node(page, "oscillator-6")).toHaveCount(0);
  await expect(node(page, "oscillator-4")).toBeVisible();
});
