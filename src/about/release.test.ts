import { describe, expect, it } from "vitest";
import { issueUrl, REPOSITORY, VERSION } from "./release";

const fields = (url: string) => new URL(url).searchParams;

describe("release", () => {
  it("is the version of the package", () => {
    expect(VERSION).toBe("0.1.0");
  });

  it("opens a new issue on the repository, with the version and the browser written in", () => {
    const url = issueUrl({ userAgent: "Mozilla/5.0 Firefox/131.0" });

    expect(url.startsWith(`${REPOSITORY}/issues/new?`)).toBe(true);
    expect(fields(url).get("title")).toBe("");
    expect(fields(url).get("body")).toContain("Trama 0.1.0");
    expect(fields(url).get("body")).toContain("Mozilla/5.0 Firefox/131.0");
  });

  it("writes in a title and the error, when there is one", () => {
    const url = issueUrl({ userAgent: "Chrome", title: "Crash: node without params", details: "node without params" });

    expect(fields(url).get("title")).toBe("Crash: node without params");
    expect(fields(url).get("body")).toContain("node without params");
  });
});
