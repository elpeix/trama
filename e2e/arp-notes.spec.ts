import { expect, test } from "@playwright/test";
import { addModule, expectNotesSounded, node, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addModule(page, "Arp");
  await node(page, "arpeggiator-1").getByRole("combobox", { name: "Source" }).selectOption("notes");
});

const arp = (page: import("@playwright/test").Page) => node(page, "arpeggiator-1");
const piano = (page: import("@playwright/test").Page) => arp(page).getByRole("group", { name: "Notes to play" });

test("plays notes of its own in a loop, without any key", async ({ page }) => {
  await expect(arp(page).getByRole("group", { name: "Notes to play" })).toBeVisible();
  await expect(arp(page).getByRole("group", { name: /Computer keys/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Start audio" }).click();

  await expectNotesSounded(piano(page), ["C4", "E4", "G4"]);
});

test("moves its notes an octave from the switch under its piano", async ({ page }) => {
  await arp(page).getByRole("button", { name: "Octave down" }).click();
  await expect(arp(page).getByRole("status", { name: "Keys" })).toHaveText("C3–C4");

  await page.getByRole("button", { name: "Start audio" }).click();

  await expectNotesSounded(piano(page), ["C3", "E3", "G3"]);
});

test("chooses its notes on a piano, and keeps them after a reload", async ({ page }) => {
  const piano = arp(page).getByRole("group", { name: "Notes to play" });

  await piano.getByRole("button", { name: "E" }).click();
  await piano.getByRole("button", { name: "A", exact: true }).click();
  await expect(piano.getByRole("button", { pressed: true })).toHaveText(["C", "G", "A"]);

  await page.reload();

  await expect(arp(page).getByRole("group", { name: "Notes to play" }).getByRole("button", { pressed: true })).toHaveText([
    "C",
    "G",
    "A",
  ]);
});

test("moves its notes with the last key pressed, once it follows the keys", async ({ page }) => {
  await arp(page).getByRole("combobox", { name: "Keys" }).selectOption("transpose");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  // S plays D4: two semitones up, which stay once the key is let go.
  await page.keyboard.press("s");

  await expect(arp(page).getByRole("status", { name: "Keys" })).toHaveText("D4–D5");
  await expectNotesSounded(piano(page), ["D4", "F#4", "A4"]);
});

test("keeps silent the steps its rhythm leaves out, without losing any note, and keeps its rhythm after a reload", async ({
  page,
}) => {
  const rhythm = arp(page).getByRole("group", { name: "Rhythm" });

  await rhythm.getByRole("button", { name: "Step 2", exact: true }).click();
  await rhythm.getByRole("button", { name: "Step 4", exact: true }).click();
  await expect(rhythm.getByRole("button", { name: "Step 2", exact: true })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(rhythm.locator(".rhythm-step-playing")).toHaveCount(1);
  await expectNotesSounded(piano(page), ["C4", "E4", "G4"]);

  await page.reload();

  await expect(
    arp(page).getByRole("group", { name: "Rhythm" }).getByRole("button", { pressed: false }),
  ).toHaveCount(2);
});
