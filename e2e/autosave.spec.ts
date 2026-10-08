import { expect, test } from "@playwright/test";
import { addModule, connect, edgeIds, example, loadPatchFile, node, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("keeps the patch after a reload", async ({ page }) => {
  await addModule(page, "Noise");
  await addModule(page, "Output");
  await connect(page, ["noise-1", "audio"], ["output-2", "audio"]);
  await expect.poll(() => edgeIds(page)).toEqual(["noise-1:audio->output-2:audio"]);

  await page.reload();

  await expect(node(page, "noise-1")).toBeVisible();
  await expect(node(page, "output-2")).toBeVisible();
  await expect.poll(() => edgeIds(page)).toEqual(["noise-1:audio->output-2:audio"]);
  await expect(page.getByRole("button", { name: "Undo" })).toBeDisabled();
});

test("continues the ids of a restored patch", async ({ page }) => {
  await loadPatchFile(page, example("06-wind"));
  await expect(node(page, "output-5")).toBeVisible();

  await page.reload();
  await expect(node(page, "output-5")).toBeVisible();
  await addModule(page, "Gain");

  await expect(node(page, "gain-6")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(6);
});

test("starts empty after New and a reload", async ({ page }) => {
  await loadPatchFile(page, example("06-wind"));
  await expect(node(page, "output-5")).toBeVisible();

  await page.getByRole("button", { name: "New" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
  await page.reload();

  await expect(page.getByRole("button", { name: "New" })).toBeDisabled();
  await expect(page.locator(".react-flow__node")).toHaveCount(0);
});

test("keeps the patch of each tab on a reload, and starts a new tab from the last one saved", async ({ page, context }) => {
  const oscillators = (tab: typeof page) => tab.locator('.react-flow__node[data-id^="oscillator-"]');
  await addModule(page, "Noise");
  await page.waitForTimeout(700);
  const other = await context.newPage();
  await openApp(other);
  await expect(node(other, "noise-1")).toBeVisible();
  await other.getByRole("button", { name: "New" }).click();
  await addModule(other, "Oscillator");
  await expect(oscillators(other)).toHaveCount(1);
  await other.waitForTimeout(700);

  await page.reload();
  await expect(node(page, "noise-1")).toBeVisible();
  await expect(oscillators(page)).toHaveCount(0);

  const third = await context.newPage();
  await openApp(third);
  await expect(oscillators(third)).toHaveCount(1);
  await expect(node(third, "noise-1")).toHaveCount(0);
});
