const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"];

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
};

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

/** The first of the preferred types the browser can record, or undefined to let it choose. */
export function recordingMimeType(isSupported: (type: string) => boolean): string | undefined {
  return PREFERRED_TYPES.find(isSupported);
}

/** `trama-2026-09-28-070509.webm`: the moment the recording started, and the extension of its type. */
export function recordingFileName(start: Date, mimeType: string): string {
  const date = [start.getFullYear(), pad(start.getMonth() + 1), pad(start.getDate())].join("-");
  const time = [start.getHours(), start.getMinutes(), start.getSeconds()].map((part) => pad(part)).join("");
  const extension = EXTENSIONS[mimeType.split(";")[0].trim()] ?? "webm";
  return `trama-${date}-${time}.${extension}`;
}

export function formatElapsed(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${pad(whole % 60)}`;
}
