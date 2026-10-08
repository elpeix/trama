import { expect, test } from "@playwright/test";
import { addModule, node, openApp } from "./support";

test("shows the help of a module under its question mark, in view", async ({ page }) => {
  await openApp(page);
  await addModule(page, "Strings");
  const help = node(page, "strings-1").getByRole("button", { name: "Help for Strings" });
  await expect(node(page, "strings-1")).not.toContainText("Connect the notes");

  await help.hover();

  const tip = page.getByRole("tooltip");
  await expect(tip).toContainText("Connect the notes of a Keyboard");
  const button = (await help.boundingBox())!;
  const box = (await tip.boundingBox())!;
  expect(box.y).toBeGreaterThan(button.y + button.height);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  await page.mouse.move(0, 0);
  await expect(tip).toBeHidden();
});
