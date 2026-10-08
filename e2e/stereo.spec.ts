import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp, sideLevels, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const left = async (page: import("@playwright/test").Page) => (await sideLevels(page))[0];
const right = async (page: import("@playwright/test").Page) => (await sideLevels(page))[1];

test("pans a channel of the mixer to one side", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Mixer");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["mixer-2", "audio"]);
  await connect(page, ["mixer-2", "audio"], ["output-3", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => right(page)).toBeGreaterThan(0.1);

  const pan = node(page, "mixer-2").getByRole("slider", { name: "Oscillator 1 pan" });
  await pan.focus();
  for (let press = 0; press < 10; press++) {
    await page.keyboard.press("Shift+ArrowLeft");
  }

  await expect(pan).toHaveAttribute("aria-valuetext", "L100");
  await expect.poll(() => right(page)).toBeLessThan(0.001);
  expect(await left(page)).toBeGreaterThan(0.1);
});

test("moves a sound across with a Pan module", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Pan");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["pan-2", "audio"]);
  await connect(page, ["pan-2", "audio"], ["output-3", "audio"]);
  const pan = node(page, "pan-2").getByRole("slider", { name: "Pan" });
  await pan.focus();
  for (let press = 0; press < 10; press++) {
    await page.keyboard.press("Shift+ArrowRight");
  }
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => right(page)).toBeGreaterThan(0.1);
  await expect.poll(() => left(page)).toBeLessThan(0.001);
});

test("keeps both sides through the effects that run on the audio thread", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Pan");
  await addModule(page, "Granulator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["pan-2", "audio"]);
  await connect(page, ["pan-2", "audio"], ["granulator-3", "audio"]);
  await connect(page, ["granulator-3", "audio"], ["output-4", "audio"]);
  const pan = node(page, "pan-2").getByRole("slider", { name: "Pan" });
  await pan.focus();
  for (let press = 0; press < 10; press++) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => left(page)).toBeGreaterThan(0.1);
  await expect.poll(() => right(page)).toBeLessThan(0.001);
});

test("plays the stereo example without the keyboard", async ({ page }) => {
  await loadPatchFile(page, example("20-stereo"));
  await expect(node(page, "output-9")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
});

/** How much of a side of a meter is lit, from its cover: 0 empty, 1 full. */
const lit = (meter: import("@playwright/test").Locator, side: "left" | "right") =>
  meter.locator(`[data-side="${side}"]`).evaluate((element) => {
    const cover = element.classList.contains("meter-cover") ? element : element.querySelector(".level-meter-cover")!;
    const scale = getComputedStyle(cover).transform.match(/matrix\(([^,]+), [^,]+, [^,]+, ([^,]+)/);
    return scale ? 1 - Math.min(Number(scale[1]), Number(scale[2])) : 0;
  });

test("shows each side apart on the meters of the mixer and of the output", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Mixer");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["mixer-2", "audio"]);
  await connect(page, ["mixer-2", "audio"], ["output-3", "audio"]);
  const pan = node(page, "mixer-2").getByRole("slider", { name: "Oscillator 1 pan" });
  await pan.focus();
  for (let press = 0; press < 10; press++) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  await page.getByRole("button", { name: "Start audio" }).click();

  const channel = node(page, "mixer-2").getByRole("meter", { name: "Oscillator 1 signal" });
  const output = node(page, "output-3").getByRole("meter", { name: "Output level" });
  await expect.poll(() => lit(channel, "left")).toBeGreaterThan(0.5);
  await expect.poll(() => lit(output, "left")).toBeGreaterThan(0.5);
  await expect.poll(() => lit(channel, "right"), { timeout: 5000 }).toBeLessThan(0.05);
  await expect.poll(() => lit(output, "right"), { timeout: 5000 }).toBeLessThan(0.05);
  expect(await lit(channel, "left")).toBeGreaterThan(0.5);
});

test("shows a mono sound the same on both sides", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();

  const output = node(page, "output-2").getByRole("meter", { name: "Output level" });
  await expect.poll(() => lit(output, "right")).toBeGreaterThan(0.5);
  expect(await lit(output, "left")).toBeGreaterThan(0.5);
});
