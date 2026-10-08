import { expect, type Locator, type Page } from "@playwright/test";
import path from "node:path";

declare global {
  interface Window {
    __audioContext?: BaseAudioContext;
    __audioProbe?: AnalyserNode;
    __sideSplitter?: ChannelSplitterNode;
    __sideProbes?: [AnalyserNode, AnalyserNode];
  }
}

export const example = (name: string) => path.join(import.meta.dirname, "..", "examples", `${name}.json`);

export async function openApp(page: Page) {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        window.__audioContext = this;
      }
    };
    const connect = AudioNode.prototype.connect as (
      this: AudioNode,
      destination: AudioNode | AudioParam,
      ...rest: number[]
    ) => AudioNode | void;
    AudioNode.prototype.connect = function (this: AudioNode, destination: AudioNode | AudioParam, ...rest: number[]) {
      const result = connect.call(this, destination, ...rest);
      if (destination instanceof AudioDestinationNode) {
        window.__audioProbe ??= this.context.createAnalyser();
        connect.call(this, window.__audioProbe);
        if (!window.__sideSplitter) {
          window.__sideSplitter = this.context.createChannelSplitter(2);
          window.__sideProbes = [this.context.createAnalyser(), this.context.createAnalyser()];
          connect.call(window.__sideSplitter, window.__sideProbes[0], 0);
          connect.call(window.__sideSplitter, window.__sideProbes[1], 1);
        }
        connect.call(this, window.__sideSplitter);
      }
      return result;
    } as typeof AudioNode.prototype.connect;
  });
  await page.goto("/");
  await expect.poll(() => audioState(page)).toBe("suspended");
  await expect(page.getByRole("button", { name: "Start audio" })).toBeVisible();
}

export const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

export const handle = (page: Page, nodeId: string, port: string, kind: "source" | "target") =>
  node(page, nodeId).locator(`.react-flow__handle.${kind}[data-handleid="${port}"]`);

export const edge = (page: Page, id: string) => page.locator(`.react-flow__edge[data-id="${id}"]`);

export async function edgeIds(page: Page) {
  return page.locator(".react-flow__edge").evaluateAll((edges) => edges.map((e) => e.getAttribute("data-id")));
}

export async function addModule(page: Page, title: string) {
  await page.getByRole("button", { name: "Add module" }).click();
  await page.getByRole("listbox", { name: "Modules" }).getByRole("option", { name: title, exact: true }).click();
}

async function center(locator: ReturnType<typeof handle>) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

export async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

export async function connect(
  page: Page,
  [sourceNode, sourcePort]: [string, string],
  [targetNode, targetPort]: [string, string],
) {
  await drag(
    page,
    await center(handle(page, sourceNode, sourcePort, "source")),
    await center(handle(page, targetNode, targetPort, "target")),
  );
}

export async function loadPatchFile(page: Page, file: string) {
  await page.getByLabel("Load patch file").setInputFiles(file);
}

export async function audioState(page: Page) {
  return page.evaluate(() => window.__audioContext?.state ?? "none");
}

export async function signalLevel(page: Page) {
  return page.evaluate(() => {
    const probe = window.__audioProbe;
    if (!probe) {
      return 0;
    }
    const samples = new Float32Array(probe.fftSize);
    probe.getFloatTimeDomainData(samples);
    return samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
  });
}

/** The loudest sample reaching the output on each side, left and right. */
export async function sideLevels(page: Page) {
  return page.evaluate(() =>
    (window.__sideProbes ?? []).map((probe) => {
      const samples = new Float32Array(probe.fftSize);
      probe.getFloatTimeDomainData(samples);
      return samples.reduce((peak, sample) => Math.max(peak, Math.abs(sample)), 0);
    }),
  );
}

export async function edgeMidpoint(page: Page, id: string) {
  return edge(page, id)
    .locator("path.react-flow__edge-path")
    .evaluate((path: SVGPathElement) => {
      const point = path.getPointAtLength(path.getTotalLength() / 2);
      const matrix = path.getScreenCTM()!;
      return { x: point.x * matrix.a + point.y * matrix.c + matrix.e, y: point.x * matrix.b + point.y * matrix.d + matrix.f };
    });
}

export const tempoDisplay = (page: Page) => page.getByRole("spinbutton", { name: "Tempo" });

/** Types a tempo into the display, as a user would after double-clicking it. */
export async function setTempo(page: Page, bpm: number) {
  await tempoDisplay(page).dblclick();
  const input = page.getByRole("textbox", { name: "Tempo" });
  await input.fill(String(bpm));
  await input.press("Enter");
  await expect(tempoDisplay(page)).toHaveAttribute("aria-valuenow", String(bpm));
}

/** Types a param value into a node, as a user would after pressing Enter on its knob. */
export async function setParam(page: Page, nodeId: string, label: string, value: number) {
  const knob = node(page, nodeId).getByRole("slider", { name: label, exact: true });
  await knob.focus();
  await knob.press("Enter");
  const input = node(page, nodeId).getByRole("textbox", { name: label, exact: true });
  await input.fill(String(value));
  await input.press("Enter");
  await expect(knob).toHaveAttribute("aria-valuenow", String(value));
}

/**
 * Waits until the notes a node has sounded, as its piano marks them one after the other, are
 * exactly `expected`: none missing, and none else.
 */
export async function expectNotesSounded(piano: Locator, expected: string[]) {
  const heard = new Set<string>();
  await expect
    .poll(
      async () => {
        const note = await piano.getAttribute("data-playing");
        if (note) {
          heard.add(note);
        }
        return [...heard].sort();
      },
      { intervals: [20], timeout: 8000 },
    )
    .toEqual([...expected].sort());
}

export const looks = (part: Locator) =>
  part.evaluateAll((elements) =>
    elements
      .flatMap((element) => [element, ...element.querySelectorAll("*")])
      .map((each) => {
        const style = getComputedStyle(each);
        return [style.backgroundImage, style.backgroundColor, style.color, style.stroke, style.filter].join(" ");
      })
      .join("\n"),
  );

export async function looksBeforeHover(page: Page, part: Locator, watched = part) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  const before = await looks(watched);
  await part.hover({ force: true });
  return before;
}

export async function expectLitOnHover(page: Page, part: Locator, name: string, watched = part) {
  const before = await looksBeforeHover(page, part, watched);
  await expect.poll(() => looks(watched), { message: name }).not.toBe(before);
}

export async function expectStillOnHover(page: Page, part: Locator, name: string, watched = part) {
  const before = await looksBeforeHover(page, part, watched);
  await page.waitForTimeout(150);
  expect(await looks(watched), name).toBe(before);
}

export const brightness = (part: Locator) =>
  part.evaluate((element) => {
    const layers: number[][] = [];
    for (let at: Element | null = element; at; at = at.parentElement) {
      const colour = getComputedStyle(at).backgroundColor;
      const [r, g, b, a = 1] = colour.match(/[\d.]+/g)!.map(Number);
      const scale = colour.startsWith("color(") ? 255 : 1;
      layers.push([r * scale, g * scale, b * scale, a]);
      if (a === 1) {
        break;
      }
    }
    const [r, g, b] = layers.reduceRight(
      (below, [r, g, b, a]) => [r * a + below[0] * (1 - a), g * a + below[1] * (1 - a), b * a + below[2] * (1 - a)],
      [255, 255, 255],
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  });

export async function expectBrighterOnHover(page: Page, part: Locator, name: string, watched = part) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  const before = await brightness(watched);
  await part.hover({ force: true });
  await expect.poll(() => brightness(watched), { message: name }).toBeGreaterThan(before + 5);
}

export async function expectLitWhileTyping(page: Page, value: Locator, input: Locator, name: string, screen?: Locator) {
  await value.hover();
  await page.waitForTimeout(150);
  const lit = await brightness(screen ?? value);
  await value.dblclick();
  await expect(input, name).toBeFocused();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(150);
  expect(await brightness(screen ?? input), name).toBeGreaterThanOrEqual(lit - 2);
}
