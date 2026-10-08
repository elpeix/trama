import { expect, test } from "@playwright/test";
import { addModule, drag, expectNotesSounded, node, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addModule(page, "Arp");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
});

const piano = (page: import("@playwright/test").Page) =>
  node(page, "arpeggiator-1").getByRole("group", { name: /Computer keys/ });

test("plays one octave up while Shift is held, mixed with keys without it", async ({ page }) => {
  await page.keyboard.down("a");
  await page.keyboard.down("Shift");
  await page.keyboard.down("G");

  await expectNotesSounded(piano(page), ["C4", "G5"]);
  const arp = node(page, "arpeggiator-1");
  await expect(arp.locator(".keys-up")).toHaveAttribute("data-on", "true");
  await expect(arp.locator(".piano-key[data-held]")).toHaveText(["A", "G"]);

  // Letting go of Shift first still stops the note the key started.
  await page.keyboard.up("Shift");
  await page.keyboard.up("g");
  await page.waitForTimeout(300);
  await expectNotesSounded(piano(page), ["C4"]);
  await expect(arp.locator(".keys-up")).toHaveAttribute("data-on", "false");
});

test("moves the keys an octave with Z and X, and shows where they are", async ({ page }) => {
  const keys = node(page, "arpeggiator-1").getByRole("status", { name: "Keys" });
  await expect(keys).toHaveText("C4–C5");

  await page.keyboard.press("x");
  await expect(keys).toHaveText("C5–C6");
  await page.keyboard.down("a");
  await expectNotesSounded(piano(page), ["C5"]);
  await page.keyboard.up("a");

  await page.keyboard.press("z");
  await page.keyboard.press("z");
  await expect(keys).toHaveText("C3–C4");

  await node(page, "arpeggiator-1").getByRole("button", { name: "Octave up" }).click();
  await expect(keys).toHaveText("C4–C5");
});

test("still undoes with Ctrl+Z or Cmd+Z, without moving the keys", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+z");

  await expect(node(page, "arpeggiator-1")).toHaveCount(0);
  await addModule(page, "Arp");
  await expect(node(page, "arpeggiator-2").getByRole("status", { name: "Keys" })).toHaveText("C4–C5");
});

test("leaves the editor panning, not selecting, after playing with Shift", async ({ page }) => {
  await page.keyboard.down("Shift");
  await page.keyboard.press("A");
  await page.keyboard.up("Shift");

  const viewport = page.locator(".react-flow__viewport");
  const before = await viewport.getAttribute("style");
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await drag(page, { x: pane.x + 300, y: pane.y + 400 }, { x: pane.x + 400, y: pane.y + 450 });

  expect(await viewport.getAttribute("style")).not.toBe(before);
  await expect(page.locator(".react-flow__selection")).toHaveCount(0);
});

test("presses the key of the note a Keyboard is sounding: the last one down", async ({ page }) => {
  await addModule(page, "Keyboard");
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  const sounding = node(page, "keyboard-2").locator(".piano-key[data-playing]");
  await expect(sounding).toHaveCount(0);

  await page.keyboard.down("a");
  await page.keyboard.down("g");
  await expect(sounding).toHaveText("G");

  await page.keyboard.up("g");
  await expect(sounding).toHaveText("A");
  await page.keyboard.up("a");
  await expect(sounding).toHaveCount(0);
});

test("plays a key of the piano while the mouse holds it, sliding on to the next ones", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  const arp = node(page, "arpeggiator-1");
  const key = (letter: string) => arp.locator(".piano-key", { hasText: new RegExp(`^${letter}$`) });
  const box = async (letter: string) => {
    const bounds = (await key(letter).boundingBox())!;
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height - 4 };
  };
  const a = await box("A");
  const d = await box("D");

  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await expect(key("A")).toHaveAttribute("data-held", "true");
  await expectNotesSounded(piano(page), ["C4"]);

  await page.mouse.move(d.x, d.y, { steps: 6 });
  await expect(key("D")).toHaveAttribute("data-held", "true");
  await expect(key("A")).not.toHaveAttribute("data-held");
  await expect.poll(() => piano(page).getAttribute("data-playing"), { intervals: [20] }).toBe("E4");

  await page.mouse.up();
  await expect(arp.locator(".piano-key[data-held]")).toHaveCount(0);
});
