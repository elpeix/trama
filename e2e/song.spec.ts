import { expect, test, type Page } from "@playwright/test";
import { addModule, audioState, connect, example, expectBrighterOnHover, expectLitOnHover, expectLitWhileTyping, loadPatchFile, node, openApp, setTempo, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

const songPanel = (page: Page) => page.getByRole("region", { name: "Song panel" });

const typeNumber = async (page: Page, name: string, value: string) => {
  await songPanel(page).getByRole("spinbutton", { name }).dblclick();
  const field = songPanel(page).getByRole("textbox", { name });
  await field.fill(value);
  await field.press("Enter");
};

test("writes a song bar by bar with Rec, and plays it through to the end in song mode", async ({ page }) => {
  await setTempo(page, 300);
  await addModule(page, "Seq");
  const patterns = node(page, "sequencer-1").getByRole("group", { name: "Patterns" });
  const slot = (name: string) => patterns.getByRole("button", { name: `Pattern ${name}` });
  await page.getByRole("button", { name: "Composer" }).click();
  const panel = songPanel(page);
  await typeNumber(page, "Bars", "2");

  await panel.getByRole("button", { name: "Rec" }).click();
  await slot("A1").dblclick();
  await panel.getByRole("button", { name: "Next bar" }).click();
  await slot("A2").dblclick();
  await panel.getByRole("button", { name: "Rec" }).click();
  await expect(panel.getByRole("button", { name: "Seq, bar 1" })).toHaveText("A1");
  await expect(panel.getByRole("button", { name: "Seq, bar 2" })).toHaveText("A2");

  await panel.getByRole("button", { name: "Bar 1", exact: true }).click();
  await page.getByRole("radio", { name: "Song" }).click();
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect(slot("A1")).toHaveAttribute("data-playing", "true");
  await expect(slot("A2")).toHaveAttribute("data-playing", "true", { timeout: 3000 });
  await expect(page.getByRole("button", { name: "Start audio" })).toBeVisible({ timeout: 3000 });
});

test("writes a pattern launched while the song plays on the next bar", async ({ page }) => {
  await setTempo(page, 60);
  await addModule(page, "Seq");
  const patterns = node(page, "sequencer-1").getByRole("group", { name: "Patterns" });
  await page.getByRole("button", { name: "Composer" }).click();
  const panel = songPanel(page);
  await panel.getByRole("button", { name: "Loop", exact: true }).click();
  await page.getByRole("radio", { name: "Song" }).click();
  await panel.getByRole("button", { name: "Rec" }).click();
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(panel.getByRole("button", { name: "Bar 1", exact: true })).toHaveAttribute("data-playing", "true");

  await patterns.getByRole("button", { name: "Pattern A3" }).dblclick();

  await expect(panel.getByRole("button", { name: "Seq, bar 2" })).toHaveText("A3");
  await expect(patterns.getByRole("button", { name: "Pattern A3" })).toHaveAttribute("data-queued", "true");
  await expect(patterns.getByRole("button", { name: "Pattern A3" })).toHaveAttribute("data-playing", "true", {
    timeout: 5000,
  });
  await page.getByRole("button", { name: "Stop" }).click();
});

test("keeps the song in the patch across a reload", async ({ page }) => {
  await addModule(page, "Seq");
  await page.getByRole("button", { name: "Composer" }).click();
  await songPanel(page).getByRole("button", { name: "Seq, bar 3" }).click();

  await page.reload();
  await page.getByRole("button", { name: "Composer" }).click();

  await expect(songPanel(page).getByRole("button", { name: "Seq, bar 3" })).toHaveText("A1");
});

test("records a knob dragged with Rec while the song plays, and leaves the patch as it was", async ({ page }) => {
  await addModule(page, "Oscillator");
  const detune = node(page, "oscillator-1").getByRole("slider", { name: "Detune" });
  const before = await detune.getAttribute("aria-valuetext");
  await page.getByRole("button", { name: "Composer" }).click();
  const panel = songPanel(page);
  await panel.getByRole("button", { name: "Loop", exact: true }).click();
  await page.getByRole("radio", { name: "Song" }).click();
  await panel.getByRole("button", { name: "Rec" }).click();
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(panel.getByRole("button", { name: "Bar 1", exact: true })).toHaveAttribute("data-playing", "true");

  const box = (await detune.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 30, { steps: 10 });
  await page.waitForTimeout(300);
  await page.mouse.up();

  await expect(panel.getByRole("rowheader", { name: /Oscillator › Detune/ })).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(detune).toHaveAttribute("aria-valuetext", before!);
});

test("sets a knob on the bar of the cursor with Rec while stopped, and plays it there in song mode", async ({ page }) => {
  await setTempo(page, 240);
  await addModule(page, "Oscillator");
  const detune = node(page, "oscillator-1").getByRole("slider", { name: "Detune" });
  const before = await detune.getAttribute("aria-valuetext");
  await page.getByRole("button", { name: "Composer" }).click();
  const panel = songPanel(page);
  await page.getByRole("radio", { name: "Song" }).click();
  await panel.getByRole("button", { name: "Rec" }).click();
  await panel.getByRole("button", { name: "Bar 2", exact: true }).click();

  await detune.focus();
  await page.keyboard.press("Shift+ArrowUp");
  const set = await detune.getAttribute("aria-valuetext");
  expect(set).not.toBe(before);
  await panel.getByRole("button", { name: "Rec" }).click();
  await expect(detune).toHaveAttribute("aria-valuetext", before!);

  await panel.getByRole("button", { name: "Bar 1", exact: true }).click();
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(detune).toHaveAttribute("aria-valuetext", set!, { timeout: 3000 });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(detune).toHaveAttribute("aria-valuetext", before!);
});

test("plays the demo song from the break, changing the patterns of the drums as it goes", async ({ page }) => {
  await loadPatchFile(page, example("43-song"));
  const slot = (name: string) => node(page, "drums-1").getByRole("group", { name: "Patterns" }).getByRole("button", { name: `Pattern ${name}` });
  await page.getByRole("button", { name: "Composer" }).click();
  const panel = songPanel(page);
  await expect(panel.getByRole("rowheader")).toHaveCount(12);
  await panel.getByRole("button", { name: "Bar 31", exact: true }).click();
  await page.getByRole("radio", { name: "Song" }).click();
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect(slot("A3")).toHaveAttribute("data-playing", "true");
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.05);
  await expect(slot("A4")).toHaveAttribute("data-playing", "true", { timeout: 6000 });
  await page.getByRole("button", { name: "Stop" }).click();
});

test("writes a pattern of any bank into a cell of the song from the keys, a dash starting from what sounds there", async ({ page }) => {
  await addModule(page, "Seq");
  await page.getByRole("button", { name: "Composer" }).click();
  const cell = songPanel(page).getByRole("button", { name: "Seq, bar 2" });

  await cell.click();
  await page.keyboard.press("d");
  await page.keyboard.press("7");
  await expect(cell).toHaveText("D7");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("b");
  await expect(songPanel(page).getByRole("button", { name: "Seq, bar 3" })).toHaveText("B7");

  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Delete");
  await expect(cell).toHaveText("");
});

test("fades the sound out over the last bars of the song, and stops", async ({ page }) => {
  await setTempo(page, 120);
  await addModule(page, "Oscillator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-2", "audio"]);
  await page.getByRole("button", { name: "Composer" }).click();
  await typeNumber(page, "Bars", "2");
  await typeNumber(page, "Fade", "1");
  await page.getByRole("radio", { name: "Song" }).click();

  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.8);
  await expect.poll(() => signalLevel(page), { timeout: 4000, intervals: [50] }).toBeLessThan(0.3);

  await expect(page.getByRole("button", { name: "Start audio" })).toBeVisible({ timeout: 4000 });
});

const playFromBar60 = async (page: Page, { follow = true } = {}) => {
  await setTempo(page, 60);
  await addModule(page, "Seq");
  await page.getByRole("button", { name: "Composer" }).click();
  const panel = songPanel(page);
  if (!follow) {
    await panel.getByRole("button", { name: "Follow" }).click();
  }
  await typeNumber(page, "Bars", "96");
  await panel.getByRole("button", { name: "Bar 60", exact: true }).click();
  await panel.locator(".song-body").evaluate((body) => body.scrollTo({ left: 0 }));
  await expect(panel.getByRole("button", { name: "Bar 60", exact: true })).not.toBeInViewport();
  await page.getByRole("radio", { name: "Song" }).click();
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(panel.getByRole("button", { name: "Bar 60", exact: true })).toHaveAttribute("data-playing", "true");
  return panel;
};

test("follows the bar that plays, turning the page of the grid when it goes out of sight", async ({ page }) => {
  const panel = await playFromBar60(page);

  await expect(panel.getByRole("button", { name: "Bar 60", exact: true })).toBeInViewport();
  await expect(panel.getByRole("button", { name: "Bar 1", exact: true })).not.toBeInViewport();
});

test("leaves the grid where it is while the bar that plays is out of sight with Follow off", async ({ page }) => {
  const panel = await playFromBar60(page, { follow: false });

  await page.waitForTimeout(300);
  await expect(panel.getByRole("button", { name: "Bar 60", exact: true })).not.toBeInViewport();
});

test("stops the sound when another piece is loaded while the song plays", async ({ page }) => {
  await loadPatchFile(page, example("43-song"));
  await page.getByRole("button", { name: "Composer" }).click();
  const panel = songPanel(page);
  await page.getByRole("radio", { name: "Song" }).click();
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(panel.getByRole("button", { name: "Bar 2", exact: true })).toHaveAttribute("data-playing", "true", { timeout: 5000 });

  await loadPatchFile(page, example("44-808"));

  await expect(page.getByRole("button", { name: "Start audio" })).toBeVisible();
  await expect.poll(() => audioState(page)).toBe("suspended");
});

test("adds a control to the song from the panel, sets its value on a bar, and plays it there in song mode", async ({ page }) => {
  await setTempo(page, 240);
  await addModule(page, "Oscillator");
  const detune = node(page, "oscillator-1").getByRole("slider", { name: "Detune" });
  await page.getByRole("button", { name: "Composer" }).click();
  const panel = songPanel(page);
  await page.getByRole("radio", { name: "Song" }).click();

  await panel.getByRole("button", { name: "Add a control" }).click();
  await page.getByRole("searchbox", { name: "Search controls" }).fill("detune");
  await page.getByRole("button", { name: "Oscillator › Detune" }).click();
  await expect(panel.getByRole("spinbutton", { name: "Oscillator › Detune, bar 1" })).toHaveText("0");

  await typeNumber(page, "Oscillator › Detune, bar 2", "700");
  await expect(panel.getByRole("spinbutton", { name: "Oscillator › Detune, bar 2" })).toHaveText("700");
  await expect(panel.getByRole("spinbutton", { name: "Oscillator › Detune, bar 3" })).toHaveText("700");

  await page.getByRole("button", { name: "Start audio" }).click();
  await expect(detune).toHaveAttribute("aria-valuetext", "700 ct", { timeout: 3000 });
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(detune).toHaveAttribute("aria-valuetext", "0 ct");
});

test("gives the cells of a lane room enough to aim at and read", async ({ page }) => {
  await addModule(page, "Oscillator");
  await page.getByRole("button", { name: "Composer" }).click();
  const panel = songPanel(page);
  await panel.getByRole("button", { name: "Add a control" }).click();
  await page.getByRole("searchbox", { name: "Search controls" }).fill("detune");
  await page.getByRole("button", { name: "Oscillator › Detune" }).click();
  const cell = panel.getByRole("spinbutton", { name: "Oscillator › Detune, bar 1" });

  const box = (await cell.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(24);
  expect(box.height).toBeGreaterThanOrEqual(24);
  expect(await cell.evaluate((element) => getComputedStyle(element).fontSize)).toBe("11px");
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`lights up the cell and the bar under the pointer, like the screen it is, in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await addModule(page, "Seq");
    await addModule(page, "Oscillator");
    await page.getByRole("button", { name: "Composer" }).click();
    const panel = songPanel(page);
    await panel.getByRole("button", { name: "Add a control" }).click();
    await page.getByRole("searchbox", { name: "Search controls" }).fill("detune");
    await page.getByRole("button", { name: "Oscillator › Detune" }).click();

    const parts = {
      "a cell of a pattern": panel.getByRole("button", { name: "Seq, bar 2" }),
      "a cell of a lane": panel.getByRole("spinbutton", { name: "Oscillator › Detune, bar 2" }),
      "a bar": panel.getByRole("button", { name: "Bar 2", exact: true }),
    };
    for (const [name, part] of Object.entries(parts)) {
      if (colorScheme === "light") {
        await expectBrighterOnHover(page, part, name);
      } else {
        await expectLitOnHover(page, part, name);
      }
    }
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`lights the whole screen of the bars, the fade and the loop under the pointer and while typed in the ${colorScheme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.getByRole("button", { name: "Composer" }).click();
    const panel = songPanel(page);
    await panel.getByRole("button", { name: "Loop" }).click();

    for (const name of ["Bars", "Fade", "Loop start", "Loop length"]) {
      const value = panel.getByRole("spinbutton", { name });
      const screen = panel.locator(".number-screen").filter({ has: page.getByLabel(name, { exact: true }) });
      await expectBrighterOnHover(page, value, name, screen);
      await expectLitWhileTyping(page, value, panel.getByRole("textbox", { name }), name, screen);
      await page.keyboard.press("Escape");
    }
  });
}

test("lights the bar that plays like the backlight of the screen in the light theme", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await loadPatchFile(page, example("43-song"));
  await page.getByRole("button", { name: "Composer" }).click();
  const grid = songPanel(page).getByRole("table", { name: "Song" });
  await page.getByRole("radio", { name: "Song" }).click();
  await page.getByRole("button", { name: "Start audio" }).click();
  const playing = grid.locator("td[data-playing]").first();
  await expect(playing).toBeVisible();

  const colours = await playing.evaluate((cell) => {
    const probe = document.createElement("div");
    probe.style.background = "var(--song-playing)";
    cell.append(probe);
    const lit = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { cell: getComputedStyle(cell).backgroundColor, lit };
  });

  expect(colours.lit).not.toBe("rgba(0, 0, 0, 0)");
  expect(colours.cell).toBe(colours.lit);
  await page.getByRole("button", { name: "Stop" }).click();
});
