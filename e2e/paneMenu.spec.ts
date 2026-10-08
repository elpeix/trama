import { expect, test } from "@playwright/test";
import { addModule, node, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const pane = (page: import("@playwright/test").Page) => page.locator(".react-flow__pane");
const menu = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Add module" });

test("adds a module with a right click on the editor, where the click was", async ({ page }) => {
  const box = (await pane(page).boundingBox())!;
  const click = { x: box.x + 300, y: box.y + 200 };

  await page.mouse.click(click.x, click.y, { button: "right" });
  await menu(page).getByRole("option", { name: "Filter", exact: true }).click();

  await expect(menu(page)).toBeHidden();
  const added = (await node(page, "filter-1").boundingBox())!;
  expect(Math.abs(added.x - click.x)).toBeLessThan(2);
  expect(Math.abs(added.y - click.y)).toBeLessThan(2);
});

test("keeps the menu inside the window near its corner", async ({ page }) => {
  const viewport = page.viewportSize()!;
  const box = (await pane(page).boundingBox())!;

  await page.mouse.click(box.x + box.width - 60, box.y + box.height - 60, { button: "right" });

  const opened = (await menu(page).boundingBox())!;
  expect(opened.x + opened.width).toBeLessThanOrEqual(viewport.width);
  expect(opened.y).toBeGreaterThanOrEqual(0);
  expect(opened.y + opened.height).toBeLessThanOrEqual(viewport.height);
});

test("leaves the right click on a module alone", async ({ page }) => {
  await addModule(page, "Filter");

  await node(page, "filter-1").locator(".module-header").click({ button: "right" });

  await expect(menu(page)).toBeHidden();
});
