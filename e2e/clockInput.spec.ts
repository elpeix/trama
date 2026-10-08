import { expect, test, type Page } from "@playwright/test";
import { addModule, example, loadPatchFile, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const playingStep = (page: Page, nodeId: string) =>
  node(page, nodeId)
    .locator(".step-row")
    .first()
    .locator(".step-cell")
    .evaluateAll((cells) => cells.findIndex((cell) => cell.classList.contains("step-cell-playing")));

async function stepsSeen(page: Page, nodeId: string, milliseconds: number) {
  const seen = new Set<number>();
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 40) {
    seen.add(await playingStep(page, nodeId));
    await page.waitForTimeout(40);
  }
  return seen;
}

test("plays a Seq a step at a time on the gates a Clock divides from another Seq", async ({ page }) => {
  await loadPatchFile(page, example("33-clock-input"));
  await expect(node(page, "sequencer-4").getByRole("combobox", { name: "Step" })).toHaveValue("gate");

  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);

  const seen = await stepsSeen(page, "sequencer-4", 4000);
  // Its five steps, one on every third note of the first Seq.
  expect([...seen].filter((step) => step >= 0).every((step) => step < 5)).toBe(true);
  expect(seen.size).toBeGreaterThan(2);
});

test("waits for gates into clock once its step is gate", async ({ page }) => {
  await addModule(page, "Seq");
  await node(page, "sequencer-1").getByRole("combobox", { name: "Step" }).selectOption("gate");

  await page.getByRole("button", { name: "Start audio" }).click();

  expect(await stepsSeen(page, "sequencer-1", 800)).toEqual(new Set([-1]));
});
