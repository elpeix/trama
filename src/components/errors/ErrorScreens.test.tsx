import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrashScreen, ErrorBoundary, StartFailedScreen } from "./ErrorScreens";

function Broken(): never {
  throw new Error("node without params");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
  it("shows its children while they render", () => {
    render(<ErrorBoundary fallback={() => <p>crashed</p>}>fine</ErrorBoundary>);

    expect(screen.getByText("fine")).toBeInTheDocument();
  });

  it("shows the fallback with the error when a child throws", () => {
    render(
      <ErrorBoundary fallback={(error) => <p>{error instanceof Error ? error.message : "?"}</p>}>
        <Broken />
      </ErrorBoundary>,
    );

    expect(screen.getByText("node without params")).toBeInTheDocument();
  });
});

describe("CrashScreen", () => {
  const actions = () => ({ onReload: vi.fn(), onSave: vi.fn(), onStartEmpty: vi.fn() });

  it("tells what happened, with the error", () => {
    render(<CrashScreen error={new Error("node without params")} {...actions()} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByText("node without params")).toBeInTheDocument();
  });

  it("links to report the error, with its message written in", () => {
    render(<CrashScreen error={new Error("node without params")} {...actions()} />);

    const report = screen.getByRole("link", { name: "Report the error" });
    const fields = new URL(report.getAttribute("href")!).searchParams;
    expect(fields.get("title")).toBe("Crash: node without params");
    expect(fields.get("body")).toContain("node without params");
    expect(report).toHaveAttribute("target", "_blank");
  });

  it("shows what was thrown when it is not an error", () => {
    render(<CrashScreen error="lost" {...actions()} />);

    expect(screen.getByText("lost")).toBeInTheDocument();
  });

  it.each([
    ["Reload", "onReload"],
    ["Save the patch", "onSave"],
    ["Start with an empty patch", "onStartEmpty"],
  ] as const)("%s", async (name, action) => {
    const handlers = actions();
    render(<CrashScreen error={new Error("x")} {...handlers} />);

    await userEvent.click(screen.getByRole("button", { name }));

    expect(handlers[action]).toHaveBeenCalledOnce();
  });

  it("says when the patch could not be saved", async () => {
    const handlers = { ...actions(), onSave: vi.fn().mockRejectedValue(new Error("quota")) };
    render(<CrashScreen error={new Error("x")} {...handlers} />);

    await userEvent.click(screen.getByRole("button", { name: "Save the patch" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The patch could not be saved: quota");
  });
});

describe("StartFailedScreen", () => {
  it("tells that the browser cannot run the app, with the error", () => {
    render(<StartFailedScreen error={new DOMException("AudioWorklet is not available")} />);

    expect(screen.getByRole("heading", { name: "Trama cannot start in this browser" })).toBeInTheDocument();
    expect(screen.getByText(/AudioWorklet is not available/)).toBeInTheDocument();
  });
});
