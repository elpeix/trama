import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeButton } from "./ThemeButton";
import { ThemeContext } from "./ThemeContext";

describe("ThemeButton", () => {
  it("tells the theme chosen and goes to the next one", () => {
    const cycle = vi.fn();
    render(
      <ThemeContext value={{ choice: "system", theme: "dark", cycle }}>
        <ThemeButton />
      </ThemeContext>,
    );

    const button = screen.getByRole("button", { name: "Theme: system" });
    expect(button).toHaveAttribute("title", expect.stringMatching(/light/));
    fireEvent.click(button);

    expect(cycle).toHaveBeenCalledTimes(1);
  });

  it("names the light and the dark themes", () => {
    const { rerender } = render(
      <ThemeContext value={{ choice: "light", theme: "light", cycle: vi.fn() }}>
        <ThemeButton />
      </ThemeContext>,
    );
    expect(screen.getByRole("button", { name: "Theme: light" })).toBeInTheDocument();

    rerender(
      <ThemeContext value={{ choice: "dark", theme: "dark", cycle: vi.fn() }}>
        <ThemeButton />
      </ThemeContext>,
    );
    expect(screen.getByRole("button", { name: "Theme: dark" })).toBeInTheDocument();
  });
});
