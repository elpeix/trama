import { expect, test, type Locator, type Page } from "@playwright/test";
import { addModule, connect, drag, edge, handle, node, openApp, signalLevel } from "./support";

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const end = (page: Page, id: string, side: "source" | "target") =>
  edge(page, id).locator(`.react-flow__edgeupdater-${side}`);

test("moves the end of a cable to another input by dragging it, as one undo step", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Filter");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["filter-2", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();
  await expect.poll(() => signalLevel(page)).toBe(0);

  await drag(
    page,
    await center(end(page, "oscillator-1:audio->filter-2:audio", "target")),
    await center(handle(page, "output-3", "audio", "target")),
  );

  await expect(edge(page, "oscillator-1:audio->output-3:audio")).toHaveCount(1);
  await expect(edge(page, "oscillator-1:audio->filter-2:audio")).toHaveCount(0);
  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.3);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(edge(page, "oscillator-1:audio->filter-2:audio")).toHaveCount(1);
});

test("moves the start of a cable to another output", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Noise");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["output-3", "audio"]);

  await drag(
    page,
    await center(end(page, "oscillator-1:audio->output-3:audio", "source")),
    await center(handle(page, "noise-2", "audio", "source")),
  );

  await expect(edge(page, "noise-2:audio->output-3:audio")).toHaveCount(1);
});

test("leaves a cable where it was when dropped on a port it cannot reach, or on nothing", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Filter");
  const cable = "oscillator-1:audio->filter-2:audio";
  await connect(page, ["oscillator-1", "audio"], ["filter-2", "audio"]);

  await drag(page, await center(end(page, cable, "target")), await center(handle(page, "filter-2", "Q", "target")));
  await expect(edge(page, cable)).toHaveCount(1);

  const box = (await page.locator(".react-flow__pane").boundingBox())!;
  await drag(page, await center(end(page, cable, "target")), { x: box.x + box.width - 80, y: box.y + box.height - 80 });
  await expect(edge(page, cable)).toHaveCount(1);
  await expect(node(page, "filter-2")).toBeVisible();
});
