import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BrowserNotice } from "./BrowserNotice";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
};

describe("BrowserNotice", () => {
  it("says nothing on a tested browser", () => {
    const { container } = render(<BrowserNotice support="tested" storage={memoryStorage()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("tells which browsers it is tested on, without naming any other", () => {
    render(<BrowserNotice support="untested" storage={memoryStorage()} />);

    const notice = screen.getByRole("status", { name: "Browser support" });
    expect(notice).toHaveTextContent("tested on desktop browsers built on Chromium, such as Chrome and Brave");
    expect(notice).not.toHaveTextContent(/Edge/);
  });

  it("says phones and tablets are not supported yet", () => {
    render(<BrowserNotice support="mobile" storage={memoryStorage()} />);

    expect(screen.getByRole("status", { name: "Browser support" })).toHaveTextContent("Phones and tablets are not supported yet");
  });

  it("goes away when dismissed, and stays away in this browser", async () => {
    const storage = memoryStorage();
    const { unmount } = render(<BrowserNotice support="untested" storage={storage} />);

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("status", { name: "Browser support" })).toBeNull();
    unmount();
    render(<BrowserNotice support="untested" storage={storage} />);
    expect(screen.queryByRole("status", { name: "Browser support" })).toBeNull();
  });

  it("shows again for another reason than the one dismissed", async () => {
    const storage = memoryStorage();
    const { unmount } = render(<BrowserNotice support="untested" storage={storage} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    unmount();

    render(<BrowserNotice support="mobile" storage={storage} />);

    expect(screen.getByRole("status", { name: "Browser support" })).toBeInTheDocument();
  });

  it("works, without remembering, when the browser keeps nothing", async () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    render(<BrowserNotice support="untested" storage={broken} />);

    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("status", { name: "Browser support" })).toBeNull();
  });
});
