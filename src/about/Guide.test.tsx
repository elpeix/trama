import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Guide } from "./Guide";

describe("Guide", () => {
  it("walks through making a first sound, step by step", () => {
    render(<Guide onClose={vi.fn()} />);

    const guide = screen.getByRole("dialog", { name: "Getting started" });
    const steps = within(guide).getAllByRole("listitem");
    expect(steps.map((step) => within(step).getByRole("heading").textContent)).toEqual([
      "Add modules",
      "Connect them",
      "Play",
      "Change values",
      "Save your patch",
      "Go further",
    ]);
    expect(guide).toHaveTextContent("Add module");
    expect(guide).toHaveTextContent("Space");
    expect(guide).toHaveTextContent("First steps");
  });

  it("closes with its button and with Escape", async () => {
    const onClose = vi.fn();
    render(<Guide onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
