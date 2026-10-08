import { expect, test, type Page } from "@playwright/test";
import {
  addModule,
  connect,
  drag,
  edge,
  edgeIds,
  edgeMidpoint,
  example,
  handle,
  loadPatchFile,
  node,
  openApp,
} from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
  for (const title of ["Oscillator", "Filter", "Gain", "Output"]) {
    await addModule(page, title);
  }
});

test("adds modules from the module menu", async ({ page }) => {
  for (const id of ["oscillator-1", "filter-2", "gain-3", "output-4"]) {
    await expect(node(page, id)).toBeVisible();
  }
});

test("connects modules by dragging between ports", async ({ page }) => {
  await connect(page, ["oscillator-1", "audio"], ["filter-2", "audio"]);
  await connect(page, ["filter-2", "audio"], ["gain-3", "audio"]);
  await connect(page, ["gain-3", "audio"], ["output-4", "audio"]);

  expect(await edgeIds(page)).toEqual([
    "oscillator-1:audio->filter-2:audio",
    "filter-2:audio->gain-3:audio",
    "gain-3:audio->output-4:audio",
  ]);
  await expect(edge(page, "filter-2:audio->gain-3:audio")).toHaveClass(/edge-audio/);
});

test("refuses a connection that closes a cycle", async ({ page }) => {
  await connect(page, ["filter-2", "audio"], ["gain-3", "audio"]);

  await connect(page, ["gain-3", "audio"], ["filter-2", "audio"]);

  expect(await edgeIds(page)).toEqual(["filter-2:audio->gain-3:audio"]);
});

test("refuses audio into a control input", async ({ page }) => {
  await connect(page, ["oscillator-1", "audio"], ["filter-2", "frequency"]);

  expect(await edgeIds(page)).toEqual([]);
});

test("moves a node by dragging its header", async ({ page }) => {
  const header = node(page, "gain-3").locator(".module-header");
  const before = await node(page, "gain-3").boundingBox();
  const box = (await header.boundingBox())!;

  await drag(page, { x: box.x + 30, y: box.y + box.height / 2 }, { x: box.x + 30, y: box.y + 250 });

  const after = await node(page, "gain-3").boundingBox();
  expect(after!.y - before!.y).toBeGreaterThan(200);
  expect(after!.x).toBeCloseTo(before!.x, 0);
});

test("removes a node together with its connections", async ({ page }) => {
  await connect(page, ["oscillator-1", "audio"], ["filter-2", "audio"]);
  await connect(page, ["filter-2", "audio"], ["gain-3", "audio"]);

  await node(page, "filter-2").getByRole("button", { name: "Remove Filter" }).click();

  await expect(node(page, "filter-2")).toHaveCount(0);
  expect(await edgeIds(page)).toEqual([]);
});

test("deletes a selected connection with Backspace", async ({ page }) => {
  await connect(page, ["oscillator-1", "audio"], ["filter-2", "audio"]);
  const middle = await edgeMidpoint(page, "oscillator-1:audio->filter-2:audio");

  await page.mouse.click(middle.x, middle.y);
  await expect(edge(page, "oscillator-1:audio->filter-2:audio")).toHaveClass(/selected/);
  await page.keyboard.press("Backspace");

  expect(await edgeIds(page)).toEqual([]);
});

test("updates a param from its knob", async ({ page }) => {
  const gain = node(page, "gain-3").getByRole("slider", { name: "Gain" });

  await gain.focus();
  await page.keyboard.press("ArrowRight");

  await expect(node(page, "gain-3").locator(".knob-value")).not.toHaveText("0.50");
});

test("locks the oscillator Freq to C4 in keyboard mode", async ({ page }) => {
  await node(page, "oscillator-1").getByRole("combobox", { name: "Mode" }).selectOption("keyboard");

  await expect(node(page, "oscillator-1").getByRole("slider", { name: "Freq" })).toBeDisabled();
  await expect(node(page, "oscillator-1").getByText("C4")).toBeVisible();
});

test.describe("control cables", () => {
  test.beforeEach(async ({ page }) => {
    await addModule(page, "LFO");
    await connect(page, ["lfo-5", "out"], ["filter-2", "frequency"]);
  });

  test("draws a control cable with its amount", async ({ page }) => {
    const cable = edge(page, "lfo-5:out->filter-2:frequency");

    await expect(cable).toHaveClass(/edge-control/);
    await expect(page.locator(".amount-control output")).toHaveText("1.00");
    await expect(handle(page, "filter-2", "frequency", "target")).toHaveClass(/port-control/);
  });

  test("sets the amount on the panel colour of the hardware", async ({ page }) => {
    const colours = await page.locator(".amount-control").evaluate((pill) => {
      const probe = document.createElement("div");
      probe.style.background = "var(--hw-surface)";
      pill.append(probe);
      const panel = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return { pill: getComputedStyle(pill).backgroundColor, panel };
    });

    expect(colours.pill).toBe(colours.panel);
  });

  const amount = (page: Page) => page.locator(".amount-control");
  const amountKnob = (page: Page) => amount(page).getByRole("slider", { name: "Amount" });

  const typeAmount = async (page: Page, value: string) => {
    await amount(page).locator("output").dblclick();
    const input = amount(page).getByRole("textbox", { name: "Amount" });
    await input.fill(value);
    await input.press("Enter");
  };

  /** Drags the knob down by some pixels; the whole range, from -1 to 1, takes 160. */
  const dragAmountDown = async (page: Page, pixels: number, { fine = false } = {}) => {
    const box = (await amountKnob(page).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    if (fine) {
      await page.keyboard.down("Alt");
    }
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + pixels, { steps: 10 });
    await page.mouse.up();
    if (fine) {
      await page.keyboard.up("Alt");
    }
    return Number(await amount(page).locator("output").textContent());
  };

  test("changes the amount with the keys, and by typing it", async ({ page }) => {
    await amountKnob(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(amount(page).locator("output")).toHaveText("0.99");

    await typeAmount(page, "-0.5");
    await expect(amount(page).locator("output")).toHaveText("-0.50");
    await expect(amountKnob(page)).toBeFocused();
  });

  test("types the amount without zooming the editor", async ({ page }) => {
    const viewport = page.locator(".react-flow__viewport");
    const transform = await viewport.getAttribute("style");

    await typeAmount(page, "0.3");

    await expect(amount(page).locator("output")).toHaveText("0.30");
    expect(await viewport.getAttribute("style")).toBe(transform);
  });

  test("snaps the amount to 0 near it, unless Alt is held", async ({ page }) => {
    await typeAmount(page, "0.1");
    // Ten times finer: 50 pixels take 0.0625 off, which ends close to 0 but does not snap.
    expect(await dragAmountDown(page, 50, { fine: true })).toBe(0.04);

    await typeAmount(page, "0.1");
    expect(await dragAmountDown(page, 5)).toBe(0);
  });

});

test("keeps the amounts off the nodes", async ({ page }) => {
  await loadPatchFile(page, example("03-wobble-bass"));
  await expect(page.locator(".edge-label")).toHaveCount(3);

  const nodes = await page.locator(".react-flow__node").all();
  for (const label of await page.locator(".edge-label").all()) {
    const pill = (await label.boundingBox())!;
    for (const candidate of nodes) {
      const box = (await candidate.boundingBox())!;
      const overlaps =
        pill.x < box.x + box.width &&
        pill.x + pill.width > box.x &&
        pill.y < box.y + box.height &&
        pill.y + pill.height > box.y;
      expect(overlaps, `amount overlaps ${await candidate.getAttribute("data-id")}`).toBe(false);
    }
  }
});

test("adds new modules where the user is looking", async ({ page }) => {
  const pane = (await page.locator(".react-flow__pane").boundingBox())!;
  await drag(
    page,
    { x: pane.x + pane.width - 100, y: pane.y + pane.height - 100 },
    { x: pane.x + 100, y: pane.y + 100 },
  );

  await addModule(page, "Delay");

  const box = (await node(page, "delay-5").boundingBox())!;
  expect(box.x).toBeGreaterThan(pane.x);
  expect(box.y).toBeGreaterThan(pane.y);
  expect(box.x + box.width).toBeLessThan(pane.x + pane.width);
  expect(box.y + box.height).toBeLessThan(pane.y + pane.height);
});

test("warns about a modulated gain that is not at zero", async ({ page }) => {
  await addModule(page, "ADSR");
  await connect(page, ["envelope-5", "out"], ["gain-3", "gain"]);

  await expect(node(page, "gain-3").getByText(/Set to 0/)).toBeVisible();
});

test("warns when two note sources reach the same frequency", async ({ page }) => {
  await addModule(page, "Keyboard");
  await addModule(page, "Seq");
  await connect(page, ["keyboard-5", "pitch"], ["oscillator-1", "frequency"]);

  await expect(node(page, "oscillator-1").getByText(/Two pitch sources add up/)).toHaveCount(0);

  await connect(page, ["sequencer-6", "pitch"], ["oscillator-1", "frequency"]);

  await expect(node(page, "oscillator-1").getByText(/Two pitch sources add up/)).toBeVisible();
});
