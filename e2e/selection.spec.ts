import { expect, test } from "@playwright/test";
import { addModule, node, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addModule(page, "Filter");
});

const selectedText = (page: import("@playwright/test").Page) => page.evaluate(() => window.getSelection()?.toString() ?? "");

test("selects nothing with Select All outside a field", async ({ page }) => {
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  await page.keyboard.press("ControlOrMeta+a");

  expect(await selectedText(page)).toBe("");
});

test("selects nothing when dragging across the labels of a node", async ({ page }) => {
  const label = node(page, "filter-1").getByText("Freq", { exact: true });
  const box = (await label.boundingBox())!;

  await page.mouse.move(box.x - 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 40, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();

  expect(await selectedText(page)).toBe("");
});

test("still selects the text of a field", async ({ page }) => {
  await node(page, "filter-1").locator(".module-title").dblclick();
  const field = node(page, "filter-1").getByRole("textbox");
  await field.fill("Lead filter");

  await field.press("ControlOrMeta+a");

  expect(await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, 11]);
});
