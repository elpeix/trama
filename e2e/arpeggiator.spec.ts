import { expect, test, type Page } from "@playwright/test";
import {
  example,
  expectNotesSounded,
  loadPatchFile,
  node,
  openApp,
  setParam,
  setTempo,
  signalLevel,
  tempoDisplay,
} from "./support";

const SILENCE = 0.01;

/** The loudest frequency coming out, in Hz. */
const dominantFrequency = (page: Page) =>
  page.evaluate(() => {
    const probe = window.__audioProbe!;
    const bins = new Float32Array(probe.frequencyBinCount);
    probe.getFloatFrequencyData(bins);
    const loudest = bins.indexOf(Math.max(...bins));
    return (loudest * probe.context.sampleRate) / probe.fftSize;
  });

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await loadPatchFile(page, example("08-arpeggio"));
  // Slow steps and no echo, so each note and the silence between them can be heard apart.
  await setTempo(page, 40);
  await node(page, "arpeggiator-1").getByRole("combobox", { name: "Step" }).selectOption("1/4");
  await setParam(page, "delay-6", "Mix", 0);
  await page.getByRole("button", { name: "Start audio" }).click();
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });
});

test("plays each note of a held chord in turn", async ({ page }) => {
  await expect(tempoDisplay(page)).toHaveAttribute("aria-valuenow", "40");
  // One octave, from C4, with an open filter: the loudest frequency is the note being played.
  await setParam(page, "arpeggiator-1", "Span", 1);
  await setParam(page, "filter-3", "Freq", 20000);

  // A D G: C4 E4 G4, a C major chord.
  for (const key of ["a", "d", "g"]) {
    await page.keyboard.down(key);
  }

  const levels: number[] = [];
  const heard = new Set<string>();
  const expected = { C4: 261.6, E4: 329.6, G4: 392 };
  for (let sample = 0; sample < 120; sample++) {
    const level = await signalLevel(page);
    levels.push(level);
    // Only once the note was already sounding at the previous sample: at the attack the analysis
    // window still holds the silence before, and the spectrum is smeared.
    if (level > 0.1 && (levels.at(-2) ?? 0) > 0.1) {
      const frequency = await dominantFrequency(page);
      const [name, target] = Object.entries(expected).reduce((best, entry) =>
        Math.abs(entry[1] - frequency) < Math.abs(best[1] - frequency) ? entry : best,
      );
      // Within half a bin of the probe (48 kHz / 2048 ≈ 23 Hz): not an octave or a neighbour.
      expect(Math.abs(target - frequency), `${frequency} Hz`).toBeLessThan(12);
      heard.add(name);
    }
    await page.waitForTimeout(40);
  }

  expect([...heard].sort()).toEqual(["C4", "E4", "G4"]);
  // Each step sounds for 40 % of 1.5 s and then goes quiet until the next one.
  const firstLoud = levels.findIndex((level) => level > 0.1);
  expect(levels.slice(firstLoud).some((level) => level < SILENCE)).toBe(true);
});

test("marks the note that is sounding on its key", async ({ page }) => {
  const arp = node(page, "arpeggiator-1");
  await expect(arp.locator(".piano-key[data-playing]")).toHaveCount(0);

  await page.keyboard.down("a");

  // C4 and C5: the example spans two octaves, from the keys up; both show on the key of C.
  await expect(arp.locator(".piano-key[data-playing]")).toHaveText("A");
  await expectNotesSounded(arp.getByRole("group", { name: /Computer keys/ }), ["C4", "C5"]);
});

test("builds a chord on a single key", async ({ page }) => {
  const arp = node(page, "arpeggiator-1");
  await arp.getByRole("combobox", { name: "Chord" }).selectOption("m7");
  // Fast steps, to hear all eight notes soon.
  await setTempo(page, 300);
  await arp.getByRole("combobox", { name: "Step" }).selectOption("1/16");
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  await page.keyboard.down("a");

  // C minor seventh, over the two octaves of the example, from the keys up.
  await expectNotesSounded(arp.getByRole("group", { name: /Computer keys/ }), [
    "C4", "D#4", "G4", "A#4", "C5", "D#5", "G5", "A#5",
  ]);
});

test("stops when the keys are released", async ({ page }) => {
  await page.keyboard.down("a");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);

  await page.keyboard.up("a");

  await page.waitForTimeout(2000);
  for (let sample = 0; sample < 10; sample++) {
    expect(await signalLevel(page)).toBeLessThan(SILENCE);
    await page.waitForTimeout(150);
  }
});
