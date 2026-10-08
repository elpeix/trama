import { describe, expect, it, vi } from "vitest";
import { FakeAudioContext } from "../test/fakeAudioContext";
import { memoryStorage, SAMPLE_ID_PATTERN, SampleLibrary, sampleId, type SampleStorage } from "./sampleLibrary";

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

describe("sampleId", () => {
  it("is the same for the same bytes, and differs for others", () => {
    expect(sampleId(bytes(1, 2, 3))).toBe(sampleId(bytes(1, 2, 3)));
    expect(sampleId(bytes(1, 2, 3))).not.toBe(sampleId(bytes(1, 2, 4)));
    expect(sampleId(bytes())).not.toBe(sampleId(bytes(0)));
    expect(sampleId(bytes(1, 2, 3))).toMatch(SAMPLE_ID_PATTERN);
  });
});

describe("SampleLibrary", () => {
  it("keeps a file by the id of its bytes, in its storage", async () => {
    const storage = memoryStorage();
    const library = new SampleLibrary(storage);

    const id = await library.add("kick.wav", "audio/wav", bytes(10));

    expect(id).toBe(sampleId(bytes(10)));
    expect(await storage.get(id)).toMatchObject({ id, name: "kick.wav", type: "audio/wav" });
    expect(await new SampleLibrary(storage).get(id)).toMatchObject({ name: "kick.wav" });
  });

  it("keeps a file for the session when the storage fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing: SampleStorage = { get: () => Promise.reject(new Error("no")), put: () => Promise.reject(new Error("full")) };
    const library = new SampleLibrary(failing);

    const id = await library.add("kick.wav", "audio/wav", bytes(10));

    expect(await library.get(id)).toMatchObject({ name: "kick.wav" });
    expect(await library.get("0123456789abcdef")).toBeUndefined();
    warn.mockRestore();
  });

  it("decodes a sample once for all who play it", async () => {
    const context = new FakeAudioContext();
    const decode = vi.spyOn(context, "decodeAudioData");
    const library = new SampleLibrary();
    const id = await library.add("kick.wav", "audio/wav", bytes(10));

    const [first, second] = await Promise.all([
      library.decode(context.asAudioContext(), id),
      library.decode(context.asAudioContext(), id),
    ]);

    expect(first?.duration).toBe(1);
    expect(second).toBe(first);
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("finds a sample that comes after it was asked for, with a patch file", async () => {
    const context = new FakeAudioContext().asAudioContext();
    const library = new SampleLibrary();
    const id = sampleId(bytes(10));

    expect(await library.decode(context, id)).toBeUndefined();
    await library.put({ id, name: "kick.wav", type: "audio/wav", data: bytes(10) });

    expect((await library.decode(context, id))?.duration).toBe(1);
  });

  it("rejects a file that is not audio", async () => {
    const library = new SampleLibrary();
    const id = await library.add("notes.txt", "text/plain", bytes());

    await expect(library.decode(new FakeAudioContext().asAudioContext(), id)).rejects.toThrow();
  });
});
