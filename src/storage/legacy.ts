const LEGACY_PREFIX = "audiojac:";
const PREFIX = "trama:";

/** Moves what this browser kept when the app was called audiojac to its keys of now, unless one is already taken. */
export function moveLegacyKeys(storage: Storage | undefined) {
  try {
    if (!storage) {
      return;
    }
    const legacy = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter(
      (key): key is string => key?.startsWith(LEGACY_PREFIX) ?? false,
    );
    for (const key of legacy) {
      const current = PREFIX + key.slice(LEGACY_PREFIX.length);
      if (storage.getItem(current) === null) {
        storage.setItem(current, storage.getItem(key)!);
      }
      storage.removeItem(key);
    }
  } catch (error) {
    console.warn("Could not move what was kept as audiojac", error);
  }
}
