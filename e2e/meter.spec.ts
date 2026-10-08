import { expect, test, type Page } from "@playwright/test";
import { addModule, connect, node, openApp, setParam } from "./support";

const startAudio = (page: Page) => page.getByRole("button", { name: "Start audio" }).click();

const peakDecibels = async (page: Page, nodeId: string) => {
  const text = await node(page, nodeId).getByRole("status", { name: "Peak level" }).textContent();
  return Number(text!.replace("−", "-").replace(" dB", "").replace("∞", "Infinity"));
};

const clip = (page: Page, nodeId: string) => node(page, nodeId).getByText("CLIP");

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("shows the output level", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);
  await expect(node(page, "output-2").getByRole("status", { name: "Peak level" })).toHaveText("−∞ dB");

  await startAudio(page);

  await expect.poll(() => peakDecibels(page, "output-2")).toBeGreaterThan(-0.5);
  await expect(clip(page, "output-2")).toHaveAttribute("data-on", "false");
});

test("follows the volume", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);
  await setParam(page, "output-2", "Volume", 0.5);
  await startAudio(page);

  await expect.poll(() => peakDecibels(page, "output-2")).toBeCloseTo(-6, 0);
});

test("lights CLIP when the output goes above 0 dBFS with the limiter off, until the volume is lowered", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Noise");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-3", "audio"]);
  await connect(page, ["noise-2", "audio"], ["output-3", "audio"]);
  await node(page, "output-3").getByRole("combobox", { name: "Limiter" }).selectOption("off");
  await startAudio(page);

  await expect(clip(page, "output-3")).toHaveAttribute("data-on", "true");

  await setParam(page, "output-3", "Volume", 0.4);
  await expect(clip(page, "output-3")).toHaveAttribute("data-on", "false", { timeout: 4000 });
});

test("keeps the output under 0 dBFS with the limiter on", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Noise");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-3", "audio"]);
  await connect(page, ["noise-2", "audio"], ["output-3", "audio"]);
  await startAudio(page);

  await expect.poll(() => peakDecibels(page, "output-3")).toBeGreaterThan(-1);
  for (let read = 0; read < 10; read++) {
    expect(await peakDecibels(page, "output-3")).toBeLessThanOrEqual(0);
    await expect(clip(page, "output-3")).toHaveAttribute("data-on", "false");
    await page.waitForTimeout(100);
  }
});

test("mutes the output when the sound runs away, and sounds again once unmuted", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Compressor");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["compressor-2", "audio"]);
  await connect(page, ["compressor-2", "audio"], ["output-3", "audio"]);
  await setParam(page, "compressor-2", "Ratio", 1);
  await setParam(page, "compressor-2", "Makeup", 24);
  await startAudio(page);

  await expect(node(page, "output-3").getByRole("alert")).toHaveText(/Muted: the sound got far too loud/);
  await expect.poll(() => peakDecibels(page, "output-3")).toBeLessThan(-60);

  await setParam(page, "compressor-2", "Makeup", 0);
  await node(page, "output-3").getByRole("button", { name: "Unmute" }).click();

  await expect(node(page, "output-3").getByRole("alert")).toHaveCount(0);
  await expect.poll(() => peakDecibels(page, "output-3")).toBeGreaterThan(-6);
});
