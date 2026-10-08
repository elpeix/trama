import { expect, test, type Page } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, signalLevel } from "./support";

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
});

test("rounds the note of a key to the nearest one of the scale", async ({ page }) => {
  await addModule(page, "Keyboard");
  await addModule(page, "Quantizer");
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["keyboard-1", "pitch"], ["quantizer-2", "in"]);
  await connect(page, ["quantizer-2", "out"], ["oscillator-3", "detune"]);
  await connect(page, ["oscillator-3", "audio"], ["output-4", "audio"]);
  await node(page, "oscillator-3").getByRole("combobox", { name: "Mode" }).selectOption("keyboard");
  await node(page, "quantizer-2").getByRole("combobox", { name: "Scale" }).selectOption("pentatonic major");
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.5);
  await page.locator(".react-flow__pane").click({ position: { x: 5, y: 5 } });

  // An octave up, T is F#5 (740 Hz): not in C major pentatonic, whose nearest note is G5.
  await page.keyboard.press("x");
  await page.keyboard.down("t");

  await expect.poll(() => dominantFrequency(page)).toBeGreaterThan(770);
  expect(await dominantFrequency(page)).toBeLessThan(800);
  await page.keyboard.up("t");
});

test("plays the example of the quantizer without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("29-quantizer"));
  await expect(node(page, "output-8")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});
