import { expect, test, type Page } from "@playwright/test";
import { addModule, connect, node, openApp, setParam } from "./support";

const startAudio = (page: Page) => page.getByRole("button", { name: "Start audio" }).click();

type Hue = "blue" | "orange";

/** How much of the canvas height a trace of one colour covers: ~0 for a flat line, most of it for a full wave. */
const traceHeight = (page: Page, nodeId: string, hue: Hue = "blue") =>
  node(page, nodeId)
    .getByRole("img", { name: "Waveform" })
    .evaluate((canvas: HTMLCanvasElement, hue) => {
      const { width, height } = canvas;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
      const matches = (r: number, b: number) => (hue === "blue" ? b - r > 80 : r - b > 80);
      let rows = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const [r, , b, a] = pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4);
          if (a > 128 && matches(r, b)) {
            rows++;
            break;
          }
        }
      }
      return rows / height;
    }, hue);

/** The topmost row of the trace in every column, as a shape to compare between two moments. */
const traceShape = (page: Page, nodeId: string, hue: Hue = "blue") =>
  node(page, nodeId)
    .getByRole("img", { name: "Waveform" })
    .evaluate((canvas: HTMLCanvasElement, hue) => {
      const { width, height } = canvas;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
      const matches = (r: number, b: number) => (hue === "blue" ? b - r > 80 : r - b > 80);
      return Array.from({ length: width }, (_, x) => {
        for (let y = 0; y < height; y++) {
          const [r, , b, a] = pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4);
          if (a > 128 && matches(r, b)) {
            return y;
          }
        }
        return -1;
      });
    }, hue);

/** How much of two shapes lands on the same row, give or take a pixel. */
const sameShape = (before: number[], after: number[]) =>
  before.filter((y, x) => Math.abs(y - after[x]) <= 1).length / before.length;

const peak = (page: Page, nodeId: string, label: string) =>
  node(page, nodeId).getByRole("status", { name: `${label} peak` });

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test("asks for signals while nothing is connected", async ({ page }) => {
  await addModule(page, "Scope");

  await expect(node(page, "scope-1").getByText("Connect signals to see them")).toBeVisible();
});

test("draws a flat line for a silent signal", async ({ page }) => {
  await addModule(page, "Gain");
  await addModule(page, "Scope");
  await connect(page, ["gain-1", "audio"], ["scope-2", "audio"]);
  await startAudio(page);

  await expect.poll(() => traceHeight(page, "scope-2")).toBeGreaterThan(0);
  expect(await traceHeight(page, "scope-2")).toBeLessThan(0.1);
});

test("draws the wave of an oscillator", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Scope");
  await connect(page, ["oscillator-1", "audio"], ["scope-2", "audio"]);
  await startAudio(page);

  await expect.poll(() => traceHeight(page, "scope-2")).toBeGreaterThan(0.8);
});

test("draws a slow control signal over a long time window", async ({ page }) => {
  await addModule(page, "LFO");
  await addModule(page, "Scope");
  await connect(page, ["lfo-1", "out"], ["scope-2", "control"]);
  await setParam(page, "scope-2", "Time", 1.25);
  await expect(node(page, "scope-2").locator("output").first()).toHaveText(/^1\.\d+ s$/);
  await startAudio(page);

  await expect.poll(() => traceHeight(page, "scope-2", "orange"), { timeout: 5000 }).toBeGreaterThan(0.8);

  // Once the window and the room to trigger in it are recorded, the wave holds still,
  // even though it is far longer than the analyser can hold.
  await page.waitForTimeout(2 * 1.25 * 1000);
  const before = await traceShape(page, "scope-2", "orange");
  await page.waitForTimeout(400);
  expect(sameShape(before, await traceShape(page, "scope-2", "orange"))).toBeGreaterThan(0.9);
});

test("draws each connection as its own trace, coloured after its signal", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "ADSR");
  await addModule(page, "Scope");
  await connect(page, ["oscillator-1", "audio"], ["scope-3", "audio"]);
  await connect(page, ["envelope-2", "out"], ["scope-3", "control"]);
  const legend = node(page, "scope-3").getByRole("list", { name: "Traces" });
  await expect(legend.getByRole("button")).toHaveText([/^Oscillator 1/, /^ADSR 2/]);
  await startAudio(page);

  // The oscillator fills the height in the blue of the audio cables; the envelope, silent until it
  // is gated, stays a flat line in the orange of the control ones.
  await expect.poll(() => traceHeight(page, "scope-3", "blue")).toBeGreaterThan(0.8);
  await expect.poll(() => traceHeight(page, "scope-3", "orange")).toBeGreaterThan(0);
  expect(await traceHeight(page, "scope-3", "orange")).toBeLessThan(0.1);
  await expect(peak(page, "scope-3", "Oscillator 1")).toHaveText("1.00");
  await expect(peak(page, "scope-3", "ADSR 2")).toHaveText("0.00");
});

test("keeps the trace it holds still on after a reload", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "LFO");
  await addModule(page, "Scope");
  await connect(page, ["oscillator-1", "audio"], ["scope-3", "audio"]);
  await connect(page, ["lfo-2", "out"], ["scope-3", "control"]);
  const trace = (name: RegExp) => node(page, "scope-3").getByRole("button", { name });
  await expect(trace(/^Oscillator 1/)).toHaveAttribute("aria-pressed", "true");

  await trace(/^LFO 2/).click();
  await expect(trace(/^LFO 2/)).toHaveAttribute("aria-pressed", "true");
  // The patch is saved half a second after the last change.
  await page.waitForTimeout(700);

  await page.reload();

  await expect(trace(/^LFO 2/)).toHaveAttribute("aria-pressed", "true");
  await expect(trace(/^Oscillator 1/)).toHaveAttribute("aria-pressed", "false");
});

test("stays empty while the audio is stopped", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Scope");
  await connect(page, ["oscillator-1", "audio"], ["scope-2", "audio"]);

  await page.waitForTimeout(300);
  expect(await traceHeight(page, "scope-2")).toBeLessThan(0.1);
});

test("shows the peak and warns when it does not fit the range", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Scope");
  await connect(page, ["oscillator-1", "audio"], ["scope-2", "audio"]);
  const scope = node(page, "scope-2");
  await expect(scope.getByText("+1.00")).toBeVisible();
  await startAudio(page);

  await expect(peak(page, "scope-2", "Oscillator 1")).toHaveText("1.00");
  await expect(peak(page, "scope-2", "Oscillator 1")).not.toHaveClass(/scope-peak-over/);

  await setParam(page, "scope-2", "Range", 0.08);
  await expect(scope.getByText("+0.08")).toBeVisible();
  await expect(peak(page, "scope-2", "Oscillator 1")).toHaveClass(/scope-peak-over/);
});

/** How much of each half of the canvas, top and bottom, a blue trace covers. */
const halvesCovered = (page: Page, nodeId: string) =>
  node(page, nodeId)
    .getByRole("img", { name: "Waveform" })
    .evaluate((canvas: HTMLCanvasElement) => {
      const { width, height } = canvas;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
      const rows = (from: number, to: number) => {
        let covered = 0;
        for (let y = from; y < to; y++) {
          for (let x = 0; x < width; x++) {
            const [r, , b, a] = pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4);
            if (a > 128 && b - r > 80) {
              covered++;
              break;
            }
          }
        }
        return covered / (to - from);
      };
      return [rows(0, Math.floor(height / 2)), rows(Math.ceil(height / 2), height)];
    });

test("splits into a lane for each side for a stereo signal, the left on top", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Pan");
  await addModule(page, "Scope");
  await connect(page, ["oscillator-1", "audio"], ["pan-2", "audio"]);
  await connect(page, ["pan-2", "audio"], ["scope-3", "audio"]);
  const pan = node(page, "pan-2").getByRole("slider", { name: "Pan" });
  await pan.focus();
  for (let press = 0; press < 10; press++) {
    await page.keyboard.press("Shift+ArrowLeft");
  }
  await startAudio(page);

  await expect(node(page, "scope-3").getByText("L ±1.00", { exact: true })).toBeVisible();
  await expect(node(page, "scope-3").getByText("R ±1.00", { exact: true })).toBeVisible();
  await expect(node(page, "scope-3").getByText("+1.00", { exact: true })).toHaveCount(0);
  await expect(node(page, "scope-3").getByText("−1.00", { exact: true })).toHaveCount(0);
  await expect.poll(async () => (await halvesCovered(page, "scope-3"))[0]).toBeGreaterThan(0.6);
  await expect.poll(async () => (await halvesCovered(page, "scope-3"))[1]).toBeLessThan(0.15);
});

test("keeps a single lane for a mono signal", async ({ page }) => {
  await addModule(page, "Oscillator");
  await addModule(page, "Scope");
  await connect(page, ["oscillator-1", "audio"], ["scope-2", "audio"]);
  await startAudio(page);

  await expect.poll(() => traceHeight(page, "scope-2")).toBeGreaterThan(0.8);
  await expect(node(page, "scope-2").getByText(/^L ±/)).toHaveCount(0);
  await expect(node(page, "scope-2").getByText("+1.00", { exact: true })).toBeVisible();
});
