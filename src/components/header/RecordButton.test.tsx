import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../../audio/AudioEngine";
import { FakeAudioContext } from "../../test/fakeAudioContext";
import { RecordButton } from "./RecordButton";

class FakeMediaRecorder extends EventTarget {
  static readonly instances: FakeMediaRecorder[] = [];
  static supported: (type: string) => boolean = (type) => type === "audio/webm;codecs=opus";
  static isTypeSupported(type: string) {
    return FakeMediaRecorder.supported(type);
  }

  readonly stream: MediaStream;
  readonly mimeType: string;
  state: RecordingState = "inactive";

  constructor(stream: MediaStream, options: MediaRecorderOptions = {}) {
    super();
    this.stream = stream;
    this.mimeType = options.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state === "inactive") {
      return;
    }
    this.state = "inactive";
    this.dispatchEvent(Object.assign(new Event("dataavailable"), { data: new Blob(["sound"]) }));
    this.dispatchEvent(new Event("stop"));
  }
}

let context: FakeAudioContext;
let engine: AudioEngine;
let downloaded: { blob: Blob; name: string } | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(new Date(2026, 8, 28, 7, 5, 9));
  FakeMediaRecorder.instances.length = 0;
  FakeMediaRecorder.supported = (type) => type === "audio/webm;codecs=opus";
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  downloaded = undefined;
  let blob: Blob | undefined;
  URL.createObjectURL = vi.fn((object: Blob) => {
    blob = object;
    return "blob:recording";
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloaded = { blob: blob!, name: this.download };
  });
  context = new FakeAudioContext();
  engine = new AudioEngine(context.asAudioContext());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderButton = () => render(<RecordButton engine={engine} />);

const click = (name: string) =>
  act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });

const recorder = () => FakeMediaRecorder.instances[FakeMediaRecorder.instances.length - 1];

describe("RecordButton", () => {
  it("starts the sound and records what reaches the output", async () => {
    renderButton();

    await click("Record");

    expect(context.state).toBe("running");
    expect(recorder().stream).toBe(engine.recordingStream);
    expect(recorder().mimeType).toBe("audio/webm;codecs=opus");
    expect(recorder().state).toBe("recording");
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
  });

  it("records without restarting a sound that already runs", async () => {
    await engine.start();
    const restart = vi.spyOn(engine, "start");
    renderButton();

    await click("Record");

    expect(restart).not.toHaveBeenCalled();
    expect(recorder().state).toBe("recording");
  });

  it("shows how long it has been recording", async () => {
    renderButton();
    await click("Record");
    expect(screen.getByRole("timer")).toHaveTextContent("0:00");

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole("timer")).toHaveTextContent("0:03");
  });

  it("saves the recording as a file when stopped, and lets the sound go on", async () => {
    renderButton();
    await click("Record");

    await click("Stop recording");

    expect(downloaded?.name).toBe("trama-2026-09-28-070509.webm");
    expect(downloaded?.blob.type).toBe("audio/webm;codecs=opus");
    expect(await downloaded?.blob.text()).toBe("sound");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:recording");
    expect(context.state).toBe("running");
    expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
    expect(screen.queryByRole("timer")).toBeNull();
  });

  it("stops and saves the recording when the sound stops", async () => {
    renderButton();
    await click("Record");

    await act(() => engine.stop());

    expect(recorder().state).toBe("inactive");
    expect(downloaded?.name).toBe("trama-2026-09-28-070509.webm");
    expect(screen.getByRole("button", { name: "Record" })).toBeInTheDocument();
  });

  it("lets the browser choose the format when it supports none of the preferred ones", async () => {
    FakeMediaRecorder.supported = () => false;
    renderButton();

    await click("Record");
    await click("Stop recording");

    expect(recorder().mimeType).toBe("audio/webm");
    expect(downloaded?.name).toBe("trama-2026-09-28-070509.webm");
  });

  it("is disabled when the browser cannot record", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    renderButton();

    expect(screen.getByRole("button", { name: "Record" })).toBeDisabled();
  });
});
