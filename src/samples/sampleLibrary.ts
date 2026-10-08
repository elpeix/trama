import { openDatabase, request } from "../storage/database";

/** An audio file loaded into a sampler, as it was read: its bytes are decoded when it plays. */
export interface SampleRecord {
  id: string;
  name: string;
  /** The media type of the file, such as `audio/wav`; empty when the browser did not know it. */
  type: string;
  data: ArrayBuffer;
}

/** Where the samples are kept between sessions. */
export interface SampleStorage {
  get(id: string): Promise<SampleRecord | undefined>;
  put(record: SampleRecord): Promise<void>;
}

export const SAMPLE_ID_PATTERN = /^[0-9a-f]{16}$/;

/**
 * The id of a sample, from its bytes: the same file loaded twice is kept once. Two 32-bit FNV-1a
 * hashes with different seeds, not a cryptographic one, which the browser only gives on https.
 */
export function sampleId(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ bytes.length;
  for (const byte of bytes) {
    a = Math.imul(a ^ byte, 0x01000193);
    b = Math.imul(b ^ byte, 0x5bd1e995);
  }
  const hex = (value: number) => (value >>> 0).toString(16).padStart(8, "0");
  return hex(a) + hex(b);
}

/** Keeps the samples in memory only: for tests, and where the browser has no IndexedDB. */
export function memoryStorage(): SampleStorage {
  const records = new Map<string, SampleRecord>();
  return {
    get: async (id) => records.get(id),
    put: async (record) => {
      records.set(record.id, record);
    },
  };
}

/** Keeps the samples in IndexedDB, shared by the tabs, which the patch autosaved in localStorage points to. */
export function indexedDbStorage(factory: IDBFactory = indexedDB): SampleStorage {
  const store = openDatabase(factory);
  return {
    get: async (id) => (await request((await store("samples", "readonly")).get(id))) as SampleRecord | undefined,
    put: async (record) => {
      await request((await store("samples", "readwrite")).put(record));
    },
  };
}

/**
 * The samples of the patch: the files loaded, kept in a storage, and the sound of each decoded
 * once for all the samplers that play it, the voices of a subpatch among them.
 */
export class SampleLibrary {
  private readonly storage: SampleStorage;
  private readonly records = new Map<string, Promise<SampleRecord | undefined>>();
  private readonly buffers = new Map<string, Promise<AudioBuffer | undefined>>();

  constructor(storage: SampleStorage = memoryStorage()) {
    this.storage = storage;
  }

  /** Keeps a file, and gives the id a sampler plays it by. */
  async add(name: string, type: string, data: ArrayBuffer): Promise<string> {
    const id = sampleId(data);
    await this.put({ id, name, type, data });
    return id;
  }

  async put(record: SampleRecord) {
    this.records.set(record.id, Promise.resolve(record));
    try {
      await this.storage.put(record);
    } catch (error) {
      console.warn("Could not keep the sample for the next session", error);
    }
  }

  get(id: string): Promise<SampleRecord | undefined> {
    let record = this.records.get(id);
    if (!record) {
      record = this.storage.get(id).catch((error: unknown) => {
        console.warn("Could not read the sample", error);
        return undefined;
      });
      this.records.set(id, record);
      // One not found yet may come with a patch file later.
      const asked = record;
      void asked.then((found) => found ?? this.forget(this.records, id, asked));
    }
    return record;
  }

  /** The sound of a sample, or undefined when there is no such sample; rejects when it is not audio. */
  decode(context: BaseAudioContext, id: string): Promise<AudioBuffer | undefined> {
    let buffer = this.buffers.get(id);
    if (!buffer) {
      // decodeAudioData takes the bytes away, so it gets a copy.
      buffer = this.get(id).then((record) => record && context.decodeAudioData(record.data.slice(0)));
      this.buffers.set(id, buffer);
      const asked = buffer;
      void asked.then(
        (decoded) => decoded ?? this.forget(this.buffers, id, asked),
        () => undefined,
      );
    }
    return buffer;
  }

  private forget<T>(cache: Map<string, T>, id: string, entry: T) {
    if (cache.get(id) === entry) {
      cache.delete(id);
    }
  }
}
