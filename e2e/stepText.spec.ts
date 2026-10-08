import { expect, test } from "@playwright/test";
import { addModule, node, openApp } from "./support";

test("pastes a row of a Drums as text, and takes it back with a single undo", async ({ page }) => {
  await openApp(page);
  await addModule(page, "Drums");
  const clap = node(page, "drums-1").getByRole("group", { name: "Clap" });

  await node(page, "drums-1").getByRole("button", { name: "Edit as text" }).click();
  const dialog = page.getByRole("dialog", { name: "Drums · A1" });
  await dialog.getByRole("textbox", { name: "Clap" }).fill("x - X - x?50");
  await dialog.getByRole("textbox", { name: "Clap" }).press("Enter");

  await expect(dialog).toBeHidden();
  await expect(clap.getByRole("button", { name: "Step 3", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(clap.getByRole("button", { name: "Step 5", exact: true })).toHaveClass(/rhythm-step-chance/);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(clap.getByRole("button", { name: "Step 3", exact: true })).toHaveAttribute("aria-pressed", "false");
});

test("writes the steps of a Seq as text, spaces and all, in any case", async ({ page }) => {
  await openApp(page);
  await addModule(page, "Seq");

  await node(page, "sequencer-1").getByRole("button", { name: "Edit as text" }).click();
  const steps = page.getByRole("dialog", { name: "Seq · A1" }).getByRole("textbox", { name: "Steps" });
  await steps.fill("");
  await steps.pressSequentially("g4 a4 bb4 c5");
  await expect(steps).toHaveValue("g4 a4 bb4 c5");
  await page.getByRole("button", { name: "Apply" }).click();

  await expect(node(page, "sequencer-1").getByRole("gridcell", { name: "Step 3 A#4" })).toHaveAttribute("aria-pressed", "true");
  await expect(node(page, "sequencer-1").getByRole("gridcell", { name: "Step 4 C5" })).toHaveAttribute("aria-pressed", "true");
});

test("writes the rhythm and the notes of an Arp as text, and its piano lights the notes", async ({ page }) => {
  await openApp(page);
  await addModule(page, "Arp");
  const arp = node(page, "arpeggiator-1");
  await arp.getByRole("combobox", { name: "Source" }).selectOption("notes");

  await arp.getByRole("button", { name: "Edit as text" }).click();
  const dialog = page.getByRole("dialog", { name: "Arp · A1" });
  await dialog.getByRole("textbox", { name: "Rhythm" }).fill("x - x x");
  await dialog.getByRole("textbox", { name: "Notes" }).fill("d4 f4 a4");
  await dialog.getByRole("textbox", { name: "Notes" }).press("Enter");

  await expect(dialog).toBeHidden();
  await expect(arp.getByRole("group", { name: "Rhythm" }).getByRole("button", { name: "Step 2", exact: true })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(arp.getByRole("group", { name: "Notes to play" }).getByRole("button", { name: "F", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
