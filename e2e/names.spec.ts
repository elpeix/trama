import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addModule, node, openApp } from "./support";

const title = (page: Parameters<typeof node>[0], id: string) => node(page, id).locator(".module-title");

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("renames a node without triggering shortcuts while typing", async ({ page }) => {
  await addModule(page, "Keyboard");
  await addModule(page, "Gain");

  await title(page, "gain-2").dblclick();
  const input = node(page, "gain-2").getByRole("textbox", { name: "Name" });
  await input.fill("Vent");
  await input.press("Backspace");
  await input.pressSequentially("t a");
  await input.press("Enter");

  await expect(node(page, "gain-2").locator(".module-name")).toHaveText("Vent a");
  await expect(node(page, "gain-2").locator(".module-type")).toHaveText("Gain");
  await expect(node(page, "gain-2")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start audio" })).toBeVisible();
});

test("undoes a rename", async ({ page }) => {
  await addModule(page, "Gain");
  await title(page, "gain-1").dblclick();
  await node(page, "gain-1").getByRole("textbox", { name: "Name" }).fill("VCA");
  await node(page, "gain-1").getByRole("textbox", { name: "Name" }).press("Enter");
  await expect(title(page, "gain-1")).toHaveText(/VCA/);

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(title(page, "gain-1")).toHaveText("Gain");
});

test("keeps names after a reload and in saved files", async ({ page }) => {
  await addModule(page, "Noise");
  await title(page, "noise-1").dblclick();
  await node(page, "noise-1").getByRole("textbox", { name: "Name" }).fill("Wind");
  await node(page, "noise-1").getByRole("textbox", { name: "Name" }).press("Enter");

  await page.reload();
  await expect(node(page, "noise-1").locator(".module-name")).toHaveText("Wind");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Save" }).click(),
  ]);
  const saved = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(saved.nodes[0]).toMatchObject({ id: "noise-1", type: "noise", name: "Wind" });
});
