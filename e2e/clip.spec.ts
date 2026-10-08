import { expect, test, type Page } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, setParam, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const roll = (page: Page) => page.getByRole("application", { name: "Piano roll" });

async function point(page: Page, beat: number, row: number) {
  const box = (await roll(page).boundingBox())!;
  const beatWidth = parseFloat(await roll(page).evaluate((element) => element.style.getPropertyValue("--beat")));
  return { x: box.x + beat * beatWidth + 2, y: box.y + row * 16 + 8 };
}

test("draws notes on the piano roll of a clip and plays them", async ({ page }) => {
  await addModule(page, "Clip");
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await node(page, "oscillator-2").getByRole("combobox", { name: "Mode" }).selectOption("keyboard");
  await connect(page, ["clip-1", "pitch"], ["oscillator-2", "detune"]);
  await connect(page, ["oscillator-2", "audio"], ["output-3", "audio"]);

  await node(page, "clip-1").getByRole("button", { name: "Edit" }).click();
  await expect(roll(page)).toBeVisible();
  const notes = node(page, "clip-1").getByRole("img", { name: "Clip notes" }).locator("[data-clip-note]");
  const before = await notes.count();

  const from = await point(page, 0, 28);
  const to = await point(page, 3, 28);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect(notes).toHaveCount(before + 1);

  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(notes).toHaveCount(before);

  await page.getByRole("button", { name: "Close piano roll" }).click();
  await expect(roll(page)).toBeHidden();
});

test("plays the example of a clip without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("16-clip"));
  await expect(node(page, "output-6")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});

test("selects notes on the piano roll and edits them from the keys, leaving the modules alone", async ({ page }) => {
  await addModule(page, "Clip");
  await node(page, "clip-1").click();
  await node(page, "clip-1").getByRole("button", { name: "Edit" }).click();
  const notes = roll(page).locator(".clip-note");
  const selected = roll(page).locator(".clip-note[data-selected]");
  const before = await notes.count();

  const from = await point(page, 0, 37);
  const to = await point(page, 3.9, 25);
  await page.keyboard.down("Shift");
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await expect(selected).toHaveCount(4);

  await page.keyboard.press("ControlOrMeta+d");
  await expect(notes).toHaveCount(before + 4);
  await expect(selected).toHaveCount(4);

  await page.keyboard.press("Backspace");
  await expect(notes).toHaveCount(before);
  await expect(node(page, "clip-1")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(notes).toHaveCount(before + 4);
});

test("plays a key of the piano roll while it is pressed", async ({ page }) => {
  await addModule(page, "Clip");
  await addModule(page, "Physical Model");
  await addModule(page, "Output");
  await setParam(page, "physicalModel-2", "Decay", 0.3);
  await connect(page, ["clip-1", "gate"], ["physicalModel-2", "gate"]);
  await connect(page, ["physicalModel-2", "audio"], ["output-3", "audio"]);
  await node(page, "clip-1").getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeLessThan(0.001);

  const key = page.locator(".clip-key", { hasText: /^C4$/ });
  await key.hover();
  await page.mouse.down();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
  await page.mouse.up();

  await expect.poll(() => signalLevel(page)).toBeLessThan(0.001);
});

test("records the notes played on the computer keys while the clip loops", async ({ page }) => {
  await addModule(page, "Clip");
  await node(page, "clip-1").getByRole("button", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Clear" }).click();
  await page.getByRole("button", { name: "Start audio" }).click();
  const rec = page.getByRole("button", { name: "Record notes" });
  await expect(rec).toBeEnabled();

  await rec.click();
  await page.keyboard.down("a");
  await page.waitForTimeout(300);
  await page.keyboard.up("a");
  await rec.click();

  const notes = roll(page).locator(".clip-note");
  await expect(notes).toHaveCount(1);
  const top = await notes.evaluate((note) => parseFloat((note as HTMLElement).style.top));
  expect(top).toBe((96 - 60) * 16);
});

test("saves the notes of a clip as a MIDI file and puts them back", async ({ page }) => {
  await addModule(page, "Clip");
  await node(page, "clip-1").getByRole("button", { name: "Edit" }).click();
  const notes = roll(page).locator(".clip-note");
  const before = await notes.count();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export MIDI" }).click();
  const file = await (await download).path();
  if (process.env.MIDI_OUT) {
    await (await download).saveAs(process.env.MIDI_OUT);
  }

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(notes).toHaveCount(0);
  await page.getByLabel("Import MIDI file").setInputFiles(file);
  await expect(notes).toHaveCount(before);
});

