import { describe, expect, it } from "vitest";
import { documentTitle, fileNameOf, isSafeLink, META_LIMITS, withMeta } from "./meta";

describe("withMeta", () => {
  it("sets the fields given, trimmed, and keeps the others", () => {
    expect(withMeta({ title: "Rain" }, { author: "  Francesc " })).toEqual({ title: "Rain", author: "Francesc" });
  });

  it("drops the fields left empty, and nothing at all with none", () => {
    expect(withMeta({ title: "Rain", author: "Francesc" }, { author: "  " })).toEqual({ title: "Rain" });
    expect(withMeta({ title: "Rain" }, { title: "" })).toBeUndefined();
  });

  it("cuts each field to its length", () => {
    const meta = withMeta(undefined, { title: "x".repeat(200), description: "y".repeat(2000) });

    expect(meta?.title).toHaveLength(META_LIMITS.title);
    expect(meta?.description).toHaveLength(META_LIMITS.description);
  });
});

describe("isSafeLink", () => {
  it("takes web links only", () => {
    expect(isSafeLink("https://example.com/song")).toBe(true);
    expect(isSafeLink("http://example.com")).toBe(true);
    expect(isSafeLink("javascript:alert(1)")).toBe(false);
    expect(isSafeLink("data:text/html,hi")).toBe(false);
    expect(isSafeLink("example.com")).toBe(false);
  });
});

describe("fileNameOf", () => {
  it("names the file after the title, plain and with dashes", () => {
    expect(fileNameOf({ title: "Pluja a la finestra" })).toBe("pluja-a-la-finestra.json");
    expect(fileNameOf({ title: "Llum de tarda! (versió 2)" })).toBe("llum-de-tarda-versio-2.json");
  });

  it("falls back on the name of the app without a title it can use", () => {
    expect(fileNameOf(undefined)).toBe("trama-patch.json");
    expect(fileNameOf({ title: "¡¿?!" })).toBe("trama-patch.json");
  });
});

describe("documentTitle", () => {
  it("puts the title of the piece before the name of the app", () => {
    expect(documentTitle({ title: "Pluja a la finestra" })).toBe("Pluja a la finestra — Trama");
    expect(documentTitle(undefined)).toBe("Trama");
  });
});
