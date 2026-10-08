import { expect, test } from "@playwright/test";
import { addModule, example, expectLitOnHover, expectStillOnHover, loadPatchFile, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("edits a pattern while another one plays, and launches it on the next bar", async ({ page }) => {
  await addModule(page, "Seq");
  const seq = node(page, "sequencer-1");
  const patterns = seq.getByRole("group", { name: "Patterns" });
  const slot = (name: string) => patterns.getByRole("button", { name: `Pattern ${name}` });
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(slot("A1")).toHaveAttribute("data-playing", "true");

  await slot("A2").click();
  await seq.getByRole("combobox", { name: "Root" }).selectOption("D");
  await expect(slot("A1")).toHaveAttribute("data-playing", "true");

  await slot("A2").dblclick();
  await expect(slot("A2")).toHaveAttribute("data-queued", "true");
  await expect(slot("A2")).toHaveAttribute("data-playing", "true", { timeout: 4000 });
  await expect(slot("A1")).not.toHaveAttribute("data-playing");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(seq.getByRole("combobox", { name: "Root" })).toHaveValue("C");
  await expect(slot("A2")).toHaveAttribute("data-playing", "true");
});

test("plays the example of patterns, and launches another one on the next bar", async ({ page }) => {
  await loadPatchFile(page, example("15-patterns"));
  const patterns = node(page, "sequencer-1").getByRole("group", { name: "Patterns" });
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);

  await patterns.getByRole("button", { name: "Pattern A3" }).dblclick();

  await expect(patterns.getByRole("button", { name: "Pattern A3" })).toHaveAttribute("data-playing", "true", {
    timeout: 4000,
  });
});

test("shows another bank, and launches one of its patterns on the next bar", async ({ page }) => {
  await addModule(page, "Seq");
  const patterns = node(page, "sequencer-1").getByRole("group", { name: "Patterns" });
  await page.getByRole("button", { name: "Start audio" }).click();

  await patterns.getByRole("button", { name: "Bank C" }).click();
  await expect(patterns.getByRole("button", { name: "Pattern C1" })).toHaveAttribute("aria-pressed", "true");
  await patterns.getByRole("button", { name: "Pattern C6" }).dblclick();

  await expect(patterns.getByRole("button", { name: "Bank C" })).toHaveAttribute("data-queued", "true");
  await expect(patterns.getByRole("button", { name: "Pattern C6" })).toHaveAttribute("data-playing", "true", { timeout: 4000 });
  await expect(patterns.getByRole("button", { name: "Bank C" })).toHaveAttribute("data-playing", "true");
  await expect(patterns.getByRole("button", { name: "Bank A" })).not.toHaveAttribute("data-playing");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`lights up the pads, the banks and the launch under the pointer, but not the pressed ones, in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await addModule(page, "Seq");
    const patterns = node(page, "sequencer-1").getByRole("group", { name: "Patterns" });

    for (const name of ["Pattern A2", "Bank B"]) {
      await expectLitOnHover(page, patterns.getByRole("button", { name }), name);
    }
    await expectLitOnHover(page, node(page, "sequencer-1").getByRole("combobox", { name: "Launch" }), "Launch");

    for (const name of ["Pattern A1", "Bank A"]) {
      const part = patterns.getByRole("button", { name });
      await expect(part).toHaveAttribute("aria-pressed", "true");
      await expectStillOnHover(page, part, name);
    }
  });
}
