import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPatchStore } from "../../store/patchStore";
import { PatchStoreContext } from "../../store/usePatchStore";
import { PieceInfo } from "./PieceInfo";

let store: ReturnType<typeof createPatchStore>;

beforeEach(() => {
  store = createPatchStore({ sync: vi.fn() });
});

const show = () =>
  render(
    <PatchStoreContext value={store}>
      <PieceInfo />
    </PatchStoreContext>,
  );

const open = () => fireEvent.click(screen.getByRole("button", { name: /^Piece:/ }));

describe("PieceInfo", () => {
  it("shows the title and the author of the piece on the bar", () => {
    store.getState().setMeta({ title: "Rain", author: "Francesc" });
    show();

    expect(screen.getByRole("button", { name: "Piece: Rain, by Francesc" })).toHaveTextContent("RainFrancesc");
  });

  it("asks for a title while there is none", () => {
    show();

    expect(screen.getByRole("button", { name: "Piece: Untitled" })).toHaveTextContent("Untitled");
  });

  it("reads as the name of the piece, with a pencil to say it can be edited", () => {
    show();

    const button = screen.getByRole("button", { name: /^Piece:/ });
    expect(button).not.toHaveClass("hw");
    expect(button.querySelector(".piece-edit-icon")).not.toBeNull();
  });

  it("edits every field from its card", () => {
    show();
    open();

    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Rain" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Author" }), { target: { value: "Francesc" } });
    fireEvent.change(screen.getByRole("textbox", { name: "About" }), { target: { value: "A sad one" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Link" }), { target: { value: "https://example.com" } });

    expect(store.getState().meta).toEqual({ title: "Rain", author: "Francesc", description: "A sad one", link: "https://example.com" });
  });

  it("opens a web link in a new tab, and warns about one that is not", () => {
    store.getState().setMeta({ link: "https://example.com/rain" });
    show();
    open();

    const link = screen.getByRole("link", { name: "Open the link" });
    expect(link).toHaveAttribute("href", "https://example.com/rain");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    fireEvent.change(screen.getByRole("textbox", { name: "Link" }), { target: { value: "javascript:alert(1)" } });
    expect(screen.queryByRole("link", { name: "Open the link" })).toBeNull();
    expect(screen.getByText(/http/)).toBeInTheDocument();
  });

  it("closes the card with Escape, and with a click elsewhere", () => {
    show();
    open();

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Piece" }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    open();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
