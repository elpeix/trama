import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../audio/AudioEngine";
import { FakeAudioContext } from "../test/fakeAudioContext";
import { AboutButton } from "./AboutButton";
import { GuideContext } from "./GuideContext";
import { REPOSITORY } from "./release";

const engineIn = () => new AudioEngine(new FakeAudioContext().asAudioContext());

describe("AboutButton", () => {
  it("shows the logo, which opens what Trama is and its version", async () => {
    render(<AboutButton engine={engineIn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "About Trama" }));

    const about = screen.getByRole("dialog", { name: "About Trama" });
    expect(about).toHaveTextContent("Version 0.1.0 · beta");
    expect(about).toHaveTextContent("desktop browsers built on Chromium, such as Chrome and Brave");
    expect(about).not.toHaveTextContent(/Edge/);
  });

  it("links to report a problem, the source and the license", async () => {
    render(<AboutButton engine={engineIn()} />);
    await userEvent.click(screen.getByRole("button", { name: "About Trama" }));

    expect(screen.getByRole("link", { name: "Report a problem" }).getAttribute("href")).toMatch(`${REPOSITORY}/issues/new?`);
    expect(screen.getByRole("link", { name: "Source code" })).toHaveAttribute("href", REPOSITORY);
    expect(screen.getByRole("link", { name: "GPL-3.0" })).toHaveAttribute("href", `${REPOSITORY}/blob/main/LICENSE`);
    screen.getAllByRole("link").forEach((link) => {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    });
  });

  it("closes with its button and with Escape", async () => {
    render(<AboutButton engine={engineIn()} />);
    await userEvent.click(screen.getByRole("button", { name: "About Trama" }));

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "About Trama" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the guide to getting started, in place of itself", async () => {
    const openGuide = vi.fn();
    render(
      <GuideContext value={openGuide}>
        <AboutButton engine={engineIn()} />
      </GuideContext>,
    );
    await userEvent.click(screen.getByRole("button", { name: "About Trama" }));

    await userEvent.click(screen.getByRole("button", { name: "Getting started" }));

    expect(openGuide).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: "About Trama" })).toBeNull();
  });

  it("lights the screen of the logo while the audio runs", async () => {
    const engine = engineIn();
    render(<AboutButton engine={engine} />);
    const logo = screen.getByRole("button", { name: "About Trama" });
    expect(logo).not.toHaveClass("running");

    await act(() => engine.start());
    expect(logo).toHaveClass("running");

    await act(() => engine.stop());

    expect(logo).not.toHaveClass("running");
  });
});
