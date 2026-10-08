import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { StereoAnalyser } from "../../audio/modules/stereoAnalyser";
import { LevelMeter } from "./LevelMeter";

const nextFrame = () => act(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

const analyser = (peak: number) =>
  ({
    fftSize: 4,
    getFloatTimeDomainData: (samples: Float32Array) => samples.fill(peak),
  }) as unknown as AnalyserNode;

const cover = (side: "left" | "right") =>
  screen.getByRole("meter").querySelector<HTMLElement>(`[data-side="${side}"] .level-meter-cover`)!;

describe("LevelMeter", () => {
  it("rises on each side with what its analyser reads, from the bottom", async () => {
    let read: StereoAnalyser | undefined = { left: analyser(1), right: analyser(0) };
    render(<LevelMeter label="Kick signal" read={() => read} />);

    await nextFrame();
    expect(screen.getByRole("meter", { name: "Kick signal" })).toHaveAttribute("data-orientation", "vertical");
    expect(cover("left").style.transform).toBe("scaleY(0)");
    expect(cover("right").style.transform).toBe("scaleY(1)");

    read = undefined;
    await nextFrame();
    expect(cover("left").style.transform).not.toBe("scaleY(0)");
  });

  it("lies down when horizontal, the left side over the right", async () => {
    render(<LevelMeter label="Main signal" orientation="horizontal" read={() => ({ left: analyser(0), right: analyser(1) })} />);

    await nextFrame();

    expect(cover("left").style.transform).toBe("scaleX(1)");
    expect(cover("right").style.transform).toBe("scaleX(0)");
  });
});
