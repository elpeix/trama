import { expect, test, type Page } from "@playwright/test";
import { addModule, audioState, connect, openApp, signalLevel } from "./support";

const SILENCE = 0.001;

async function keyboardIntoPiano(page: Page) {
  await addModule(page, "Keyboard");
  await addModule(page, "Piano");
  await addModule(page, "Output");
  await connect(page, ["keyboard-1", "notes"], ["piano-2", "notes"]);
  await connect(page, ["piano-2", "audio"], ["output-3", "audio"]);
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("plays the keys with the transport stopped", async ({ page }) => {
  await keyboardIntoPiano(page);

  await page.keyboard.down("a");

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.02);
  await expect(page.getByRole("button", { name: "Start audio" })).toBeVisible();
  await page.keyboard.up("a");
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);
  await expect.poll(() => audioState(page), { timeout: 10_000 }).toBe("suspended");
});

test("keeps the keys quiet while stopped once the button is off, and remembers it", async ({ page }) => {
  await keyboardIntoPiano(page);
  await page.getByRole("button", { name: "Sound without play" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  await page.keyboard.down("a");
  await page.waitForTimeout(300);

  expect(await audioState(page)).toBe("suspended");
  await page.keyboard.up("a");
  await page.reload();
  await expect(page.getByRole("button", { name: "Sound without play" })).toHaveAttribute("aria-pressed", "false");
});
