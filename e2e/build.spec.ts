import { expect, test } from "@playwright/test";
import { addModule, connect, openApp, signalLevel } from "./support";

const LARGEST_SCRIPT = 500 * 1024;

test("the built app starts in pieces of reasonable size, loads its worklets and sounds", async ({ page }) => {
  const errors: string[] = [];
  const scripts = new Map<string, number>();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("response", async (response) => {
    if (response.url().endsWith(".js")) {
      scripts.set(response.url(), (await response.body()).length);
    }
  });

  await openApp(page);
  await addModule(page, "Oscillator");
  await addModule(page, "Granulator");
  await addModule(page, "Output");
  await connect(page, ["oscillator-1", "audio"], ["granulator-2", "audio"]);
  await connect(page, ["granulator-2", "audio"], ["output-3", "audio"]);
  await page.getByRole("button", { name: "Start audio" }).click();

  await expect.poll(() => signalLevel(page)).toBeGreaterThan(0.1);
  expect(errors).toEqual([]);
  expect(scripts.size).toBeGreaterThan(1);
  for (const [url, size] of scripts) {
    expect(size, url).toBeLessThan(LARGEST_SCRIPT);
  }
});
