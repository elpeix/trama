import { describe, expect, it } from "vitest";
import { formatElapsed, recordingFileName, recordingMimeType } from "./recording";

describe("recordingMimeType", () => {
  it("prefers Opus in WebM", () => {
    expect(recordingMimeType(() => true)).toBe("audio/webm;codecs=opus");
  });

  it("falls back to the first type the browser can record", () => {
    expect(recordingMimeType((type) => type === "audio/mp4")).toBe("audio/mp4");
  });

  it("leaves the choice to the browser when it supports none of them", () => {
    expect(recordingMimeType(() => false)).toBeUndefined();
  });
});

describe("recordingFileName", () => {
  const date = new Date(2026, 8, 28, 7, 5, 9);

  it("names the file after the moment the recording started", () => {
    expect(recordingFileName(date, "audio/webm;codecs=opus")).toBe("trama-2026-09-28-070509.webm");
  });

  it("takes the extension from the type", () => {
    expect(recordingFileName(date, "audio/ogg;codecs=opus")).toBe("trama-2026-09-28-070509.ogg");
    expect(recordingFileName(date, "audio/mp4")).toBe("trama-2026-09-28-070509.m4a");
  });

  it("falls back to WebM for an unknown or missing type", () => {
    expect(recordingFileName(date, "")).toBe("trama-2026-09-28-070509.webm");
    expect(recordingFileName(date, "audio/x-unknown")).toBe("trama-2026-09-28-070509.webm");
  });
});

describe("formatElapsed", () => {
  it("shows minutes and seconds", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(7.9)).toBe("0:07");
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(3600)).toBe("60:00");
  });
});
