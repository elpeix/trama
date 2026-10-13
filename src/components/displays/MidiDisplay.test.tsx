import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MidiState } from "../../audio/MidiInput";
import { displayEngine } from "../../test/displayEngine";
import { EngineContext } from "../EngineContext";
import { MidiDisplay } from "./MidiDisplay";

const show = (state: MidiState | undefined, notes: number[] = [], playing?: number) =>
  render(
    <EngineContext value={displayEngine({ getMidiState: vi.fn(() => state), getNotes: vi.fn(() => ({ notes, playing })) })}>
      <MidiDisplay nodeId="midiInput-1" />
    </EngineContext>,
  );

describe("MidiDisplay", () => {
  it("lists the devices it hears, lit", () => {
    show({ status: "on", devices: ["Keystation", "Pads"] });

    const status = screen.getByRole("status", { name: "MIDI" });
    expect(status).toHaveTextContent("Keystation, Pads");
    expect(status).toHaveAttribute("data-status", "on");
  });

  it("says when no device is plugged in, unlit", () => {
    show({ status: "on", devices: [] });

    const status = screen.getByRole("status", { name: "MIDI" });
    expect(status).toHaveTextContent("No MIDI device plugged in");
    expect(status).not.toHaveAttribute("data-status", "on");
  });

  it.each([
    ["asking", "Asking for the MIDI devices…"],
    ["denied", "MIDI is blocked"],
    ["unavailable", "This browser has no MIDI"],
  ] as const)("says when it is %s", (status, text) => {
    show({ status, devices: [] });

    expect(screen.getByRole("status", { name: "MIDI" })).toHaveTextContent(text);
  });

  it("shows every key held, low to high, marking the one sounding", async () => {
    show({ status: "on", devices: ["Keystation"] }, [64, 60, 67], 67);

    const held = screen.getByLabelText("Notes held");
    await waitFor(() => expect(held).toHaveTextContent("C4E4G4"));
    expect(within(held).getByText("G4")).toHaveAttribute("data-playing");
    expect(within(held).getByText("C4")).not.toHaveAttribute("data-playing");
  });
});
