import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { addModule, audioState, connect, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("records what sounds and saves it as a file", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);

  await page.getByRole("button", { name: "Record" }).click();
  await expect.poll(() => audioState(page)).toBe("running");
  await expect(page.getByRole("timer")).toHaveText("0:01");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Stop recording" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/^trama-\d{4}-\d{2}-\d{2}-\d{6}\.webm$/);
  expect((await readFile((await download.path())!)).byteLength).toBeGreaterThan(1000);
  await expect.poll(() => audioState(page)).toBe("running");
});

test("saves the recording when the sound stops", async ({ page }) => {
  await addModule(page, "Output");
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByRole("button", { name: "Stop recording" })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Stop", exact: true }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.webm$/);
  await expect(page.getByRole("button", { name: "Record" })).toBeVisible();
});
