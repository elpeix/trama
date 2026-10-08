import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { addModule, drag, example, loadPatchFile, node, openApp, signalLevel, tempoDisplay } from "./support";

const cell = (page: Page, nodeId: string, step: number, note: string) =>
  node(page, nodeId).getByRole("gridcell", { name: `Step ${step} ${note}` });

const playingStep = (page: Page, nodeId: string) =>
  node(page, nodeId)
    .locator(".step-row")
    .first()
    .locator(".step-cell")
    .evaluateAll((cells) => cells.findIndex((cell) => cell.classList.contains("step-cell-playing")));

/**
 * The loudest frequency coming out now, in Hz: with no smoothing, so the notes before do not blur
 * into it, and moved from the loudest bin along the parabola through its neighbours, so the
 * answer is not held to the width of a bin. Undefined while the spectrum has no clear peak yet,
 * which happens when it lags behind the sound for a moment.
 */
const dominantFrequency = (page: Page) =>
  page.evaluate(() => {
    const probe = window.__audioProbe!;
    probe.smoothingTimeConstant = 0;
    const bins = new Float32Array(probe.frequencyBinCount);
    probe.getFloatFrequencyData(bins);
    const loudest = Math.max(...bins);
    if (!Number.isFinite(loudest) || loudest < -60) {
      return undefined;
    }
    const peak = bins.indexOf(loudest);
    const [before, at, after] = [bins[peak - 1] ?? bins[peak], bins[peak], bins[peak + 1] ?? bins[peak]];
    const curve = before - 2 * at + after;
    const offset = curve === 0 ? 0 : (0.5 * (before - after)) / curve;
    return ((peak + offset) * probe.context.sampleRate) / probe.fftSize;
  });

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

/** Adds a Seq and moves it up, so the low rows of its grid are on the screen too. */
async function addSeqInView(page: Page) {
  await addModule(page, "Seq");
  const box = (await node(page, "sequencer-1").locator(".module-header").boundingBox())!;
  const grip = { x: box.x + 20, y: box.y + box.height / 2 };
  await drag(page, grip, { x: grip.x, y: grip.y - 250 });
}

test("plays on its own and lights the step that is playing", async ({ page }) => {
  await loadPatchFile(page, example("09-sequencer"));
  // The example plays two octaves down: its top row is C3.
  await expect(cell(page, "sequencer-1", 4, "C3")).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
  const seen = new Set<number>();
  for (let sample = 0; sample < 30; sample++) {
    seen.add(await playingStep(page, "sequencer-1"));
    await page.waitForTimeout(30);
  }
  expect(seen.size).toBeGreaterThan(4);
});

test("edits the pattern by clicking the grid", async ({ page }) => {
  await addModule(page, "Seq");
  const seq = "sequencer-1";
  await expect(cell(page, seq, 1, "C4")).toHaveAttribute("aria-pressed", "true");

  await cell(page, seq, 2, "G5").click();
  await cell(page, seq, 1, "C4").click();

  await expect(cell(page, seq, 2, "G5")).toHaveAttribute("aria-pressed", "true");
  await expect(cell(page, seq, 1, "C4")).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cell(page, seq, 1, "C4")).toHaveAttribute("aria-pressed", "true");
  await expect(cell(page, seq, 2, "G5")).toHaveAttribute("aria-pressed", "true");
});

test("fills a run of steps by dragging across the grid, as one undo step", async ({ page }) => {
  await addSeqInView(page);
  const seq = "sequencer-1";
  const middle = async (step: number, note: string) => {
    const box = (await cell(page, seq, step, note).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  // The G4 row of a new Seq has a note on step 7 and nothing on steps 2 to 5.
  await drag(page, await middle(2, "G4"), await middle(5, "G4"));

  for (const step of [2, 3, 4, 5]) {
    await expect(cell(page, seq, step, "G4")).toHaveAttribute("aria-pressed", "true");
  }
  await expect(cell(page, seq, 6, "G4")).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Undo" }).click();

  for (const step of [2, 3, 4, 5]) {
    await expect(cell(page, seq, step, "G4")).toHaveAttribute("aria-pressed", "false");
  }
  // One undo, and the note that was there all along is untouched.
  await expect(cell(page, seq, 7, "G4")).toHaveAttribute("aria-pressed", "true");
});

test("clears a run of steps by dragging from a note", async ({ page }) => {
  await addSeqInView(page);
  const seq = "sequencer-1";
  const middle = async (step: number, note: string) => {
    const box = (await cell(page, seq, step, note).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  await drag(page, await middle(2, "C4"), await middle(4, "C4"));
  await expect(cell(page, seq, 4, "C4")).toHaveAttribute("aria-pressed", "true");

  // Step 1 already has a C4, so the drag from it takes the notes away instead of placing them.
  await drag(page, await middle(1, "C4"), await middle(3, "C4"));

  for (const step of [1, 2, 3]) {
    await expect(cell(page, seq, step, "C4")).toHaveAttribute("aria-pressed", "false");
  }
  await expect(cell(page, seq, 4, "C4")).toHaveAttribute("aria-pressed", "true");
});

test("shows only the notes of the chosen scale and root", async ({ page }) => {
  await addModule(page, "Seq");
  const seq = node(page, "sequencer-1");
  const rows = seq.getByRole("rowheader");
  // The default pattern is C minor pentatonic: two octaves of it.
  await expect(rows).toHaveText(["C6", "A#5", "G5", "F5", "D#5", "C5", "A#4", "G4", "F4", "D#4", "C4"]);

  await seq.getByRole("combobox", { name: "Scale" }).selectOption("chromatic");
  await expect(rows).toHaveCount(13);

  // Changing the scale keeps the notes: those not in C major are marked.
  await seq.getByRole("combobox", { name: "Scale" }).selectOption("major");
  await expect(seq.locator(".step-row-outside [role=rowheader]")).toHaveText(["A#4", "D#4"]);

  // Changing the root transposes the pattern nine semitones up: C D# F G A# becomes A C D E G.
  await seq.getByRole("combobox", { name: "Root" }).selectOption("A");
  await expect(rows.first()).toHaveText("A6");
  await expect(cell(page, "sequencer-1", 1, "A4")).toHaveAttribute("aria-pressed", "true");
  await expect(cell(page, "sequencer-1", 3, "C5")).toHaveAttribute("aria-pressed", "true");
  await expect(seq.locator(".step-row-outside [role=rowheader]")).toHaveText(["G5", "C5"]);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cell(page, "sequencer-1", 1, "C4")).toHaveAttribute("aria-pressed", "true");
});

test("plays the notes of its steps", async ({ page }, testInfo) => {
  // Slow quarter notes C4, E4, G4 into an open filter, so the loudest frequency is the note.
  const patch = JSON.parse(await readFile(example("09-sequencer"), "utf8"));
  const params = (id: string) => patch.nodes.find((candidate: { id: string }) => candidate.id === id).params;
  patch.tempo = 50;
  Object.assign(params("sequencer-1"), {
    division: "1/4",
    octave: 0,
    gate: 0.6,
    steps: "C4 E4 G4 - - - - - - - - - - - - -",
    length: 3,
  });
  Object.assign(params("filter-3"), { frequency: 20000, Q: 0.1 });
  Object.assign(params("delay-6"), { mix: 0 });
  const file = testInfo.outputPath("seq.json");
  await writeFile(file, JSON.stringify(patch));
  await loadPatchFile(page, file);
  await page.getByRole("button", { name: "Start audio" }).click();

  const expected = { C4: 261.6, E4: 329.6, G4: 392 };
  const heard = new Set<string>();
  let wasLoud = false;
  let lastTime = -1;
  for (let sample = 0; sample < 110; sample++) {
    const loud = (await signalLevel(page)) > 0.1;
    const time = await page.evaluate(() => window.__audioContext!.currentTime);
    // Only once the note was already sounding at the previous sample, earlier on the audio clock:
    // at the attack the analysis window still holds the silence before, and the spectrum is smeared.
    const steady = loud && wasLoud && time > lastTime;
    wasLoud = loud;
    lastTime = time;
    const frequency = steady ? await dominantFrequency(page) : undefined;
    if (frequency !== undefined) {
      const [name, target] = Object.entries(expected).reduce((best, entry) =>
        Math.abs(entry[1] - frequency) < Math.abs(best[1] - frequency) ? entry : best,
      );
      expect(Math.abs(target - frequency), `${frequency} Hz`).toBeLessThan(12);
      heard.add(name);
    }
    await page.waitForTimeout(40);
  }
  expect([...heard].sort()).toEqual(["C4", "E4", "G4"]);
});

test("keeps two sequencers in step and follows the tempo of the patch", async ({ page }) => {
  await loadPatchFile(page, example("09-sequencer"));
  await expect(tempoDisplay(page)).toHaveAttribute("aria-valuenow", "112");
  await addModule(page, "Seq");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.waitForTimeout(300);

  // Both loops are 16 sixteenths long, so they are always on the same step. Read both at once.
  const bothSteps = () =>
    page.evaluate(() =>
      ["sequencer-1", "sequencer-8"].map((id) =>
        [...document.querySelectorAll(`.react-flow__node[data-id="${id}"] .step-row:first-child .step-cell`)].findIndex(
          (cell) => cell.classList.contains("step-cell-playing"),
        ),
      ),
    );
  let same = 0;
  for (let sample = 0; sample < 20; sample++) {
    const [first, second] = await bothSteps();
    if (first === second && first !== -1) {
      same++;
    }
    await page.waitForTimeout(37);
  }
  expect(same).toBeGreaterThanOrEqual(18);
});

test("transposes its pattern with the last key pressed, once it follows the keys", async ({ page }) => {
  await loadPatchFile(page, example("09-sequencer"));
  const seq = node(page, "sequencer-1");
  const topRow = seq.getByRole("rowheader").first();
  // Two octaves of the scale, played two octaves down: the top row is C4.
  await expect(topRow).toHaveText("C4");
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  // S plays D4.
  await page.keyboard.press("s");
  await expect(topRow).toHaveText("C4");

  await seq.getByRole("combobox", { name: "Keys" }).selectOption("transpose");
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
  // S was the last key: two semitones up, and it stays once the key is let go.
  await expect(topRow).toHaveText("D4");

  await page.keyboard.press("f");
  await expect(topRow).toHaveText("F4");
});

test("accents a note and ties the next step to it, each click one undo step", async ({ page }) => {
  await addSeqInView(page);
  const seq = node(page, "sequencer-1");
  const mark = (row: string, step: number) =>
    seq.getByRole("group", { name: row }).getByRole("button", { name: `Step ${step}`, exact: true });
  await expect(seq.locator('.react-flow__handle.source[data-handleid="accent"]')).toBeVisible();

  await mark("Accents", 1).click();
  await mark("Ties", 2).click();

  await expect(mark("Accents", 1)).toHaveAttribute("aria-pressed", "true");
  await expect(mark("Ties", 2)).toHaveAttribute("aria-pressed", "true");
  await expect(cell(page, "sequencer-1", 2, "C4")).toHaveClass(/step-cell-tie/);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(mark("Ties", 2)).toHaveAttribute("aria-pressed", "false");
  await expect(mark("Accents", 1)).toHaveAttribute("aria-pressed", "true");
});

test("plays the acid example, with accents and ties, without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("19-acid"));
  await expect(node(page, "output-7")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});

test("saves the pattern of a Seq as a MIDI file and reads it back onto the steps", async ({ page }) => {
  await addModule(page, "Seq");
  const seq = node(page, "sequencer-1");
  const placed = seq.locator('.step-grid [aria-pressed="true"]');
  const before = await placed.count();

  const download = page.waitForEvent("download");
  await seq.getByRole("button", { name: "Export MIDI" }).click();
  const file = await (await download).path();
  await seq.getByLabel("Import MIDI file").setInputFiles(file);

  await expect(placed).toHaveCount(before);
  await expect(seq.getByRole("alert")).toHaveCount(0);
});

