import { expect, test } from "@playwright/test";
import { addModule, connect, example, loadPatchFile, node, openApp } from "./support";

test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["microphone"],
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    const getUserMedia = MediaDevices.prototype.getUserMedia;
    MediaDevices.prototype.getUserMedia = function (this: MediaDevices, constraints?: MediaStreamConstraints) {
      return getUserMedia.call(this, constraints).then((stream) => {
        streams.push(stream);
        return stream;
      });
    };
    (window as { liveTracks?: () => number }).liveTracks = () =>
      streams.flatMap((stream) => stream.getTracks()).filter((track) => track.readyState === "live").length;
  });
  await openApp(page);
});

const outputLevel = async (page: import("@playwright/test").Page, id: string) => {
  const readout = await node(page, id).locator(".meter-readout").textContent();
  const value = Number(readout?.replace("−", "-").replace(/[^\d.-]/g, ""));
  return Number.isFinite(value) && readout?.includes("∞") === false ? value : -Infinity;
};

const liveTracks = (page: import("@playwright/test").Page) =>
  page.evaluate(() => (window as { liveTracks?: () => number }).liveTracks?.() ?? 0);

test("plays what the microphone hears, and shows it is listening", async ({ page }) => {
  await addModule(page, "Audio Input");
  await addModule(page, "Output");
  await connect(page, ["audioInput-1", "audio"], ["output-2", "audio"]);

  await expect(node(page, "audioInput-1").getByRole("status", { name: "Microphone" })).toHaveText("Listening");
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => outputLevel(page, "output-2"), { timeout: 10_000 }).toBeGreaterThan(-30);
});

test("stops listening once the module is removed", async ({ page }) => {
  await addModule(page, "Audio Input");
  await expect(node(page, "audioInput-1").getByRole("status", { name: "Microphone" })).toHaveText("Listening");
  expect(await liveTracks(page)).toBe(1);

  await node(page, "audioInput-1").getByRole("button", { name: "Remove Audio Input" }).click();

  await expect.poll(() => liveTracks(page)).toBe(0);
});

test("plays the example of the audio input", async ({ page }) => {
  await loadPatchFile(page, example("31-audio-input"));
  await expect(node(page, "output-4")).toBeVisible();

  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => outputLevel(page, "output-4"), { timeout: 10_000 }).toBeGreaterThan(-40);
});
