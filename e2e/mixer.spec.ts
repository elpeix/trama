import { expect, test, type Page } from "@playwright/test";
import { addModule, connect, expectLitOnHover, expectStillOnHover, node, openApp, signalLevel } from "./support";

const SILENCE = 0.001;

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await addModule(page, "Oscillator");
  await addModule(page, "Noise");
  await addModule(page, "Mixer");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["mixer-3", "audio"]);
  await connect(page, ["noise-2", "audio"], ["mixer-3", "audio"]);
  await connect(page, ["mixer-3", "audio"], ["output-4", "audio"]);
});

const mixer = (page: Page) => node(page, "mixer-3");

test("mixes a channel per cable, and silences them with mute", async ({ page }) => {
  await expect(mixer(page).getByRole("listitem")).toHaveCount(2);
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(SILENCE);

  await mixer(page).getByRole("button", { name: "Mute Oscillator 1" }).click();
  await mixer(page).getByRole("button", { name: "Mute Noise 2" }).click();
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await mixer(page).getByRole("button", { name: "Solo Noise 2" }).click();
  await expect.poll(() => signalLevel(page)).toBeLessThan(SILENCE);

  await mixer(page).getByRole("button", { name: "Mute Noise 2" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(SILENCE);
});

test("keeps the level, mute and solo of each channel after a reload", async ({ page }) => {
  const level = mixer(page).getByRole("slider", { name: "Oscillator 1 level" });
  await level.focus();
  await page.keyboard.press("ArrowDown");
  await mixer(page).getByRole("button", { name: "Solo Noise 2" }).click();

  await page.reload();

  await expect(mixer(page).getByRole("slider", { name: "Oscillator 1 level" })).toHaveAttribute("aria-valuetext", "0.99");
  await expect(mixer(page).getByRole("button", { name: "Solo Noise 2" })).toHaveAttribute("aria-pressed", "true");
  await expect(mixer(page).getByRole("button", { name: "Mute Oscillator 1" })).toHaveAttribute("aria-pressed", "false");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`lights up mute and solo under the pointer, but not once pressed, in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });

    for (const name of ["Mute Oscillator 1", "Solo Oscillator 1"]) {
      const key = mixer(page).getByRole("button", { name });
      await expectLitOnHover(page, key, name);
      await key.click();
      await expect(key).toHaveAttribute("aria-pressed", "true");
      await expectStillOnHover(page, key, `${name}, pressed`);
    }
  });
}
