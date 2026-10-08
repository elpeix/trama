import { expect, test } from "@playwright/test";
import { addModule, example, loadPatchFile, node, openApp, signalLevel } from "./support";

test("plays the example of drums without the keyboard, in hits that die away", async ({ page }) => {
  await openApp(page);
  await loadPatchFile(page, example("44-808"));
  await page.getByRole("button", { name: "Start audio" }).click();

  const levels: number[] = [];
  for (let sample = 0; sample < 60; sample++) {
    levels.push(await signalLevel(page));
    await page.waitForTimeout(25);
  }

  expect(Math.max(...levels)).toBeGreaterThan(0.2);
  expect(Math.min(...levels)).toBeLessThan(0.05);
});

test("names each of its eight rows on a single line", async ({ page }) => {
  await openApp(page);
  await addModule(page, "Drums");
  const heights = await node(page, "drums-1")
    .locator(".rhythm-label")
    .evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().height));

  expect(heights).toHaveLength(9);
  expect(new Set(heights).size).toBe(1);
});

test("plays a hit several times within its step on a Shift-click, split in a part for each", async ({ page }) => {
  await openApp(page);
  await addModule(page, "Drums");
  const hit = node(page, "drums-1").getByRole("group", { name: "Kick" }).getByRole("button", { name: "Step 1", exact: true });
  const parts = hit.locator(".rhythm-retrig-part");

  await hit.click({ modifiers: ["Shift"] });
  await expect(parts).toHaveCount(2);
  await hit.click({ modifiers: ["Shift"] });
  await hit.click({ modifiers: ["Shift"] });
  await expect(parts).toHaveCount(4);
  await hit.click({ modifiers: ["Shift"] });

  await expect(parts).toHaveCount(0);
  await expect(hit).toHaveAttribute("aria-pressed", "true");
});
