import { expect, test } from "@playwright/test";
import { addModule, node, openApp, setTempo, tempoDisplay } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("syncs the rate to the tempo of the patch", async ({ page }) => {
  await addModule(page, "LFO");
  const lfo = node(page, "lfo-1");
  const rate = lfo.getByRole("slider", { name: "Rate" });
  await expect(rate).toBeEnabled();

  await lfo.getByRole("combobox", { name: "Sync" }).selectOption("1/8");

  // 120 BPM: an eighth lasts 0.25 s, so 4 cycles per second.
  await expect(rate).toBeDisabled();
  await expect(lfo.locator(".param-locked output")).toHaveText("4.00 Hz");

  await setTempo(page, 90);
  await expect(lfo.locator(".param-locked output")).toHaveText("3.00 Hz");

  await lfo.getByRole("combobox", { name: "Sync" }).selectOption("free");
  await expect(rate).toBeEnabled();
  await expect(lfo.getByText("2.00 Hz")).toBeVisible();
});

test("syncs the delay time to the tempo of the patch", async ({ page }) => {
  await addModule(page, "Delay");
  const delay = node(page, "delay-1");
  const time = delay.getByRole("slider", { name: "Time" });

  await delay.getByRole("combobox", { name: "Sync" }).selectOption("3/16");

  // 120 BPM: a dotted eighth is 0.375 s.
  await expect(time).toBeDisabled();
  await expect(delay.locator(".param-locked output")).toHaveText("0.375 s");

  await setTempo(page, 100);
  await expect(delay.locator(".param-locked output")).toHaveText("0.450 s");
});

test("sets the tempo by dragging the display, and by tapping", async ({ page }) => {
  const box = (await tempoDisplay(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 30, { steps: 6 });
  await page.mouse.up();
  await expect(tempoDisplay(page)).toHaveAttribute("aria-valuenow", "130");

  // Four taps half a second apart, timed in the page so the test runner does not slow them down.
  await page.getByRole("button", { name: "Tap" }).evaluate(
    (button: HTMLButtonElement) =>
      new Promise<void>((resolve) => {
        let taps = 0;
        const tap = () => {
          button.click();
          if (++taps < 4) {
            setTimeout(tap, 500);
          } else {
            resolve();
          }
        };
        tap();
      }),
  );
  await expect(tempoDisplay(page)).toHaveAttribute("aria-valuenow", /^1(1[8-9]|2[0-2])$/);
});

test("flashes the beat light while the sound runs", async ({ page }) => {
  const light = page.locator(".tempo-light");
  await expect(light).toHaveAttribute("data-beat", "off");

  await page.getByRole("button", { name: "Start audio" }).click();

  // Each flash is short: watch the light from the page for a bar and a bit (2.5 s at 120 BPM).
  const seen = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const states = new Set<string>();
        const end = performance.now() + 2500;
        const watch = () => {
          states.add(document.querySelector(".tempo-light")!.getAttribute("data-beat")!);
          if (performance.now() < end) {
            requestAnimationFrame(watch);
          } else {
            resolve([...states].sort());
          }
        };
        watch();
      }),
  );
  expect(seen).toEqual(["bar", "beat", "off"]);
});

test("sets the swing from its display, and keeps it with the patch", async ({ page }) => {
  const swing = page.getByRole("spinbutton", { name: "Swing" });
  await expect(swing).toHaveText("50%");

  await swing.focus();
  await page.keyboard.press("Enter");
  const input = page.getByRole("textbox", { name: "Swing" });
  await input.fill("62");
  await input.press("Enter");
  await expect(swing).toHaveText("62%");

  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "Swing" })).toHaveText("62%");
});

test("swings the eighths from the display of the swing, and keeps it with the patch", async ({ page }) => {
  const grid = page.getByRole("combobox", { name: "Swing grid" });
  await expect(grid).toHaveValue("1/16");

  await grid.selectOption("1/8");
  await expect(grid).toHaveValue("1/8");

  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Swing grid" })).toHaveValue("1/8");
});
