import { expect, test } from "@playwright/test";
import { addModule, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("opens what Trama is from the logo, with its version", async ({ page }) => {
  await page.getByRole("button", { name: "About Trama" }).click();

  const about = page.getByRole("dialog", { name: "About Trama" });
  await expect(about).toContainText("Version 0.1.0 · beta");
  await expect(about.getByRole("link", { name: "Report a problem" })).toHaveAttribute("href", /github\.com\/elpeix\/trama\/issues\/new\?/);

  await page.keyboard.press("Escape");
  await expect(about).toHaveCount(0);
});

test("lights only the screen of the logo under the pointer, with no shade behind the button", async ({ page }) => {
  const logo = page.getByRole("button", { name: "About Trama" });

  await logo.hover();
  await page.waitForTimeout(150);

  expect(await logo.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
});

test("says nothing about the browser on Chromium", async ({ page }) => {
  await expect(page.getByRole("button", { name: "About Trama" })).toBeVisible();

  await expect(page.getByRole("status", { name: "Browser support" })).toHaveCount(0);
});

test("offers the guide to getting started on an empty patch, and not once a module is in", async ({ page }) => {
  await page.getByRole("button", { name: "Getting started" }).click();

  const guide = page.getByRole("dialog", { name: "Getting started" });
  await expect(guide).toContainText("Add modules");
  await guide.getByRole("button", { name: "Close" }).click();
  await expect(guide).toHaveCount(0);

  await addModule(page, "Oscillator");
  await expect(page.getByRole("button", { name: "Getting started" })).toHaveCount(0);
});
