import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeAudioContext, FakeGainNode } from "../../../test/fakeAudioContext";
import { AudioInputModule } from "./AudioInputModule";

let context: FakeAudioContext;
let stop: ReturnType<typeof vi.fn>;
let stream: MediaStream;
let answer: { allow(): Promise<void>; refuse(name: string): Promise<void> };
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  context = new FakeAudioContext();
  stop = vi.fn();
  stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
  getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve, reject) => {
        answer = {
          allow: async () => resolve(stream),
          refuse: async (name) => reject(new DOMException("refused", name)),
        };
      }),
  );
});

const media = () => ({ getUserMedia }) as unknown as MediaDevices;
const create = (gain = 1) => new AudioInputModule(context.asAudioContext(), { gain }, media());
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe("AudioInputModule", () => {
  it("asks for the microphone as it is, without what calls do to voices", () => {
    const input = create();

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(input.getInputStatus()).toBe("asking");
  });

  it("plays the microphone through its gain once allowed, and shows its level", async () => {
    const input = create(2);
    const output = input.getAudioOutput("audio") as unknown as FakeGainNode;

    await answer.allow();
    await settle();

    const [source] = context.mediaStreamSources;
    expect(source.mediaStream).toBe(stream);
    expect(source.outputs.has(output)).toBe(true);
    expect(output.gain.value).toBe(2);
    expect(output.outputs.has(context.gains[1])).toBe(true);
    expect(input.getAnalyser()).toEqual({ left: context.analysers[0], right: context.analysers[1] });
    expect(input.getInputStatus()).toBe("on");
    expect(input.getAudioOutput("nope")).toBeUndefined();
  });

  it("tells when the microphone is blocked", async () => {
    const input = create();

    await answer.refuse("NotAllowedError");
    await settle();

    expect(input.getInputStatus()).toBe("denied");
    expect(context.mediaStreamSources).toEqual([]);
  });

  it("tells when there is no microphone to listen to", async () => {
    const input = create();

    await answer.refuse("NotFoundError");
    await settle();

    expect(input.getInputStatus()).toBe("unavailable");
  });

  it("does not ask where the browser cannot listen", () => {
    const input = new AudioInputModule(context.asAudioContext(), { gain: 1 }, undefined);

    expect(input.getInputStatus()).toBe("unavailable");
  });

  it("glides its gain", () => {
    const input = create();

    input.setParameter("gain", 0.5, 1);

    expect((input.getAudioOutput("audio") as unknown as FakeGainNode).gain.events).toEqual([
      { type: "setTarget", value: 0.5, time: 1 },
    ]);
    expect(() => input.setParameter("nope", 1, 0)).toThrow();
  });

  it("stops listening on dispose", async () => {
    const input = create();
    await answer.allow();
    await settle();

    input.dispose();

    expect(stop).toHaveBeenCalled();
    expect(context.mediaStreamSources[0].outputs.size).toBe(0);
  });

  it("stops the microphone at once when it is allowed after the module is gone", async () => {
    create().dispose();

    await answer.allow();
    await settle();

    expect(stop).toHaveBeenCalled();
    expect(context.mediaStreamSources).toEqual([]);
  });
});
