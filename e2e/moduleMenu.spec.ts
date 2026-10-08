import { expect, test } from "@playwright/test";
import { node, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const dialog = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Add module" });

test("adds a module by typing part of its name and pressing Enter", async ({ page }) => {
  await page.getByRole("button", { name: "Add module" }).click();

  await page.keyboard.type("rev");
  await page.keyboard.press("Enter");

  await expect(node(page, "reverb-1")).toBeVisible();
  await expect(dialog(page)).toBeHidden();
});

test("fits every module in the window at once", async ({ page }) => {
  await page.getByRole("button", { name: "Add module" }).click();

  const box = (await dialog(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await expect(dialog(page).getByRole("option", { name: "Reverb" })).toBeInViewport();
  await expect(dialog(page).getByRole("option", { name: "Subpatch" })).toBeInViewport();
});

test.describe("in a short window", () => {
  test.use({ viewport: { width: 900, height: 420 } });

  test("scrolls a long list of results, each on a full line, following the option marked", async ({ page }) => {
    await page.getByRole("button", { name: "Add module" }).click();
    await page.keyboard.type("a");

    const options = dialog(page).getByRole("option");
    const heights = await options.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThan(20);

    const count = heights.length;
    for (let step = 1; step < count; step++) {
      await page.keyboard.press("ArrowDown");
    }
    await expect(options.last()).toHaveAttribute("aria-selected", "true");
    await expect(options.last()).toBeInViewport();
  });
});
