import { expect, test } from "@playwright/test";
import { addModule, node, openApp } from "./support";

test("tells when the browser cannot run the audio", async ({ page }) => {
  await page.addInitScript(() => {
    AudioWorklet.prototype.addModule = () => Promise.reject(new DOMException("No audio worklets here"));
  });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Trama cannot start in this browser" })).toBeVisible();
  await expect(page.getByText("No audio worklets here")).toBeVisible();
});

test("starts empty and keeps a copy of an autosaved patch from a newer Trama", async ({ page }) => {
  await openApp(page);
  await addModule(page, "Noise");
  await expect(node(page, "noise-1")).toBeVisible();
  await page.waitForTimeout(700);
  const newer = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("trama:patch")!);
    const item = JSON.stringify({ ...saved, version: 99 });
    localStorage.setItem("trama:patch", item);
    sessionStorage.setItem("trama:patch", item);
    return item;
  });

  await page.reload();

  await expect(page.getByRole("button", { name: "New" })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("trama:patch:backup"))).toBe(newer);
});
