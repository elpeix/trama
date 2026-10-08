import { expect, test } from "@playwright/test";
import { addModule, example, loadPatchFile, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("lowers the chance of a hit of the Drums with a right click, and undoes it", async ({ page }) => {
  await addModule(page, "Drums");
  const hit = node(page, "drums-1").getByRole("group", { name: "Kick" }).getByRole("button", { name: "Step 1", exact: true });
  await expect(hit).toHaveAttribute("title", "Always sounds; right-click to make it sound less often, Shift-click to play it 2 to 4 times within the step");

  await hit.click({ button: "right" });
  await expect(hit).toHaveAttribute("title", "Sounds 75% of the time; right-click for less, or always after 25%, Shift-click to play it 2 to 4 times within the step");
  await hit.click({ button: "right" });
  await expect(hit).toHaveAttribute("title", "Sounds 50% of the time; right-click for less, or always after 25%, Shift-click to play it 2 to 4 times within the step");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(hit).toHaveAttribute("title", "Sounds 75% of the time; right-click for less, or always after 25%, Shift-click to play it 2 to 4 times within the step");
});

test("lowers the chance of a note of the Seq from the row under its grid", async ({ page }) => {
  await addModule(page, "Seq");
  const seq = node(page, "sequencer-1");
  const chance = seq.getByRole("group", { name: "Chances" }).getByRole("button", { name: "Step 1", exact: true });
  await expect(chance).toHaveAttribute("title", "Always sounds; click to make it sound less often");

  await chance.click();

  await expect(chance).toHaveAttribute("title", "Sounds 75% of the time; click for less, or always after 25%");
  await expect(seq.getByRole("group", { name: "Chances" }).getByRole("button", { name: "Step 2", exact: true })).toBeDisabled();
});

test("plays the drums of the 808, with a hat made to sound now and then from its face", async ({ page }) => {
  await loadPatchFile(page, example("44-808"));
  const hat = node(page, "subpatch-1").getByRole("group", { name: "Hat" }).getByRole("button", { name: "Step 3", exact: true });

  await hat.click({ button: "right" });
  await hat.click({ button: "right" });
  await hat.click({ button: "right" });
  await expect(hat).toHaveAttribute(
    "title",
    "Sounds 25% of the time; right-click for less, or always after 25%, Shift-click to play it 2 to 4 times within the step",
  );

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
