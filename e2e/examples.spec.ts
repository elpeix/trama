import { expect, test } from "@playwright/test";
import { node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("opens an example from the menu, and plays it", async ({ page }) => {
  await page.getByRole("button", { name: "Examples" }).click();
  await page.getByRole("dialog", { name: "Examples" }).getByRole("button", { name: /^Sequencer/ }).click();
  await expect(node(page, "sequencer-1")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});

test("opens an example that carries a sample, and plays it", async ({ page }) => {
  await page.getByRole("button", { name: "Examples" }).click();
  await page.getByRole("dialog", { name: "Examples" }).getByRole("button", { name: /^Sampler/ }).click();
  await expect(node(page, "sampler-2")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});

test("undoes opening an example", async ({ page }) => {
  await page.getByRole("button", { name: "Examples" }).click();
  await page.getByRole("dialog", { name: "Examples" }).getByRole("button", { name: /^Wind/ }).click();
  await expect(page.locator(".react-flow__node")).not.toHaveCount(0);

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(page.locator(".react-flow__node")).toHaveCount(0);
});

test("plays the 808 example, programmed and launched from the face of its subpatch", async ({ page }) => {
  await page.getByRole("button", { name: "Examples" }).click();
  await page.getByRole("dialog", { name: "Examples" }).getByRole("button", { name: /^808/ }).click();
  const face = node(page, "subpatch-1");
  const kick = face.getByRole("group", { name: "Kick" }).getByRole("button", { name: "Step 2" });
  const pressed = await kick.getAttribute("aria-pressed");

  await kick.click();
  await expect(kick).not.toHaveAttribute("aria-pressed", pressed!);
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);

  const slot = face.getByRole("group", { name: "Patterns" }).getByRole("button", { name: "Pattern A2" });
  await slot.dblclick();
  await expect(slot).toHaveAttribute("data-playing", "true", { timeout: 4000 });
});

test("plays the 303 example from the face of its subpatch", async ({ page }) => {
  await page.getByRole("button", { name: "Examples" }).click();
  await page.getByRole("dialog", { name: "Examples" }).getByRole("button", { name: /^303/ }).click();
  const face = node(page, "subpatch-1");
  await expect(face.getByRole("grid", { name: "Steps" })).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
