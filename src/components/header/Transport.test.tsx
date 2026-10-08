import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AudioEngine } from "../../audio/AudioEngine";
import { FakeAudioContext } from "../../test/fakeAudioContext";
import { Transport } from "./Transport";

let context: FakeAudioContext;

const renderTransport = (initialState: AudioContextState = "suspended") => {
  context = new FakeAudioContext();
  context.state = initialState;
  render(
    <>
      <Transport engine={new AudioEngine(context.asAudioContext())} />
      <input aria-label="text" />
      <select aria-label="choice">
        <option>a</option>
      </select>
      <button type="button">Other</button>
    </>,
  );
};


const space = (target: Element | Window = window, init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(target, { key: " ", code: "Space", ...init });

describe("Transport", () => {
  beforeEach(() => {
    renderTransport();
  });

  it("starts and stops the engine", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Start audio" }));
    expect(context.state).toBe("running");

    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(context.state).toBe("suspended");
    expect(screen.getByRole("button", { name: "Start audio" })).toBeInTheDocument();
  });

  it("starts and stops with the space bar", async () => {
    space();
    expect(await screen.findByRole("button", { name: "Stop" })).toBeInTheDocument();
    expect(context.state).toBe("running");

    space();
    expect(await screen.findByRole("button", { name: "Start audio" })).toBeInTheDocument();
    expect(context.state).toBe("suspended");
  });

  it("keeps the space bar from pressing a focused button", () => {
    const button = screen.getByRole("button", { name: "Other" });
    const keyDown = createEvent.keyDown(button, { key: " ", code: "Space" });
    const keyUp = createEvent.keyUp(button, { key: " ", code: "Space" });

    fireEvent(button, keyDown);
    fireEvent(button, keyUp);

    expect(keyDown.defaultPrevented).toBe(true);
    expect(keyUp.defaultPrevented).toBe(true);
  });

  it("ignores the space bar while typing", () => {
    space(screen.getByRole("textbox", { name: "text" }));
    space(screen.getByRole("combobox", { name: "choice" }));

    expect(context.state).toBe("suspended");
  });

  it("ignores auto-repeat and modifiers", () => {
    space(window, { repeat: true });
    space(window, { metaKey: true });
    space(window, { ctrlKey: true });
    space(window, { altKey: true });

    expect(context.state).toBe("suspended");
  });

  it("ignores other keys", () => {
    fireEvent.keyDown(window, { key: "Enter" });

    expect(context.state).toBe("suspended");
  });

  it("follows state changes made outside the transport", async () => {
    await userEvent.click(screen.getByRole("button", { name: "Start audio" }));

    context.changeState("interrupted");

    expect(await screen.findByRole("button", { name: "Start audio" })).toBeInTheDocument();
  });
});

describe("Transport when the browser starts the context on its own", () => {
  it("waits for the user to start the audio", async () => {
    renderTransport("running");

    expect(context.state).toBe("suspended");
    expect(screen.getByRole("button", { name: "Start audio" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Start audio" }));

    expect(context.state).toBe("running");
  });
});
