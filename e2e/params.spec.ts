import { expect, test } from "@playwright/test";
import { addModule, connect, expectBrighterOnHover, expectLitOnHover, expectLitWhileTyping, expectStillOnHover, node, openApp } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("types a param value after a double-click, as one undo step", async ({ page }) => {
  await addModule(page, "Filter");
  const filter = node(page, "filter-1");
  const value = filter.locator(".param", { hasText: "Freq" }).locator(".knob-value");
  const initial = await value.textContent();

  await value.dblclick();
  const input = filter.getByRole("textbox", { name: "Freq" });
  await expect(input).toBeFocused();
  // The space must not start the sound, nor the letters play notes.
  await input.pressSequentially("880 Hz");
  await input.press("Enter");

  await expect(value).toHaveText("880 Hz");
  await expect(filter.getByRole("slider", { name: "Freq" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Start audio" })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(value).toHaveText(initial!);
});

test("opens typing with Enter on a focused slider, and keeps the value on Escape", async ({ page }) => {
  await addModule(page, "Gain");
  const gain = node(page, "gain-1");
  const slider = gain.getByRole("slider", { name: "Gain" });
  const initial = await gain.locator(".knob-value").textContent();

  await slider.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.type("0.1");
  await page.keyboard.press("Escape");

  await expect(gain.locator(".knob-value")).toHaveText(initial!);
  await expect(slider).toBeFocused();
});

test("keeps the node the same width while a value is typed", async ({ page }) => {
  await addModule(page, "Filter");
  const filter = node(page, "filter-1");
  const width = (await filter.boundingBox())!.width;

  await filter.locator(".param", { hasText: "Freq" }).locator(".knob-value").dblclick();
  await expect(filter.getByRole("textbox", { name: "Freq" })).toBeFocused();

  expect((await filter.boundingBox())!.width).toBe(width);
});

test("shows how far a modulation takes a knob while the sound runs", async ({ page }) => {
  await addModule(page, "LFO");
  await addModule(page, "Filter");
  await connect(page, ["lfo-1", "out"], ["filter-2", "frequency"]);
  const mark = node(page, "filter-2").locator(".knob-modulation");
  await expect(mark).toBeHidden();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect(mark).toBeVisible();
  const first = await mark.getAttribute("d");
  await expect.poll(() => mark.getAttribute("d")).not.toBe(first);

  await page.getByRole("button", { name: "Stop" }).click();
  await expect(mark).toBeHidden();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`lights up the knobs, but not their scale, their values and the selects under the pointer, and not a locked knob, in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await addModule(page, "LFO");
    const lfo = node(page, "lfo-1");
    const rate = lfo.getByRole("slider", { name: "Rate" });
    const sync = lfo.getByRole("combobox", { name: "Sync" });

    await expectLitOnHover(page, rate, "Rate");
    await expectStillOnHover(page, rate, "the scale of Rate", rate.locator(".knob-track, .knob-arc"));
    await expectLitOnHover(page, sync, "Sync");

    const value = lfo.locator(".param", { hasText: "Rate" }).locator(".knob-value");
    await expectLitOnHover(page, value, "the value of Rate");

    await sync.selectOption("1/8");
    await expect(rate).toBeDisabled();
    await expectStillOnHover(page, rate, "Rate, locked");
    await expectStillOnHover(page, value, "the value of Rate, locked");
  });
}

test("lights the screens of the values and the selects up under the pointer in the light theme, like a backlit display", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await addModule(page, "LFO");
  const lfo = node(page, "lfo-1");

  await expectBrighterOnHover(page, lfo.locator(".param", { hasText: "Rate" }).locator(".knob-value"), "the value of Rate");
  await expectBrighterOnHover(page, lfo.getByRole("combobox", { name: "Sync" }), "Sync");
});

test("keeps the screen of a value lit while it is typed in the light theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await addModule(page, "LFO");
  const rate = node(page, "lfo-1").locator(".param", { hasText: "Rate" });

  await expectLitWhileTyping(page, rate.locator(".knob-value"), rate.getByRole("textbox"), "Rate");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`lights the face of a knob up like its screen under the pointer in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await addModule(page, "LFO");
    const rate = node(page, "lfo-1").getByRole("slider", { name: "Rate" });
    const fills = () =>
      rate.evaluate((knob) => {
        const probe = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        probe.style.fill = "var(--lcd-lit)";
        knob.querySelector("svg")!.append(probe);
        const lit = getComputedStyle(probe).fill;
        probe.remove();
        return { face: getComputedStyle(knob.querySelector(".knob-body")!).fill, lit };
      });

    await page.mouse.move(0, 0);
    expect((await fills()).face).not.toBe((await fills()).lit);
    await rate.hover();
    await expect.poll(async () => { const { face, lit } = await fills(); return face === lit; }).toBe(true);
  });
}
