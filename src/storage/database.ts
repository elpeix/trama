const DATABASE = "trama";
const LEGACY_DATABASE = "audiojac";
/** Version 1 had the samples only; version 2 adds the presets. */
const VERSION = 2;
const STORES = ["samples", "presets"] as const;

export type StoreName = (typeof STORES)[number];

export const request = <T>(action: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    action.onsuccess = () => resolve(action.result);
    action.onerror = () => reject(action.error);
  });

/**
 * The database of the app in this browser, shared by the tabs: the samples and the presets, each
 * kept by its `id`. Opening it adds the stores a database from an older version lacks.
 */
export function openDatabase(factory: IDBFactory = indexedDB) {
  const database = moveLegacyDatabase(factory)
    .then(() => request(openCurrent(factory)))
    .then((opened) => {
      // A tab with a newer version asks to upgrade it: this one lets go instead of blocking it.
      opened.onversionchange = () => opened.close();
      return opened;
    });
  return async (name: StoreName, mode: IDBTransactionMode) =>
    (await database).transaction(name, mode).objectStore(name);
}

function openCurrent(factory: IDBFactory, onCreated?: () => void) {
  const open = factory.open(DATABASE, VERSION);
  open.onupgradeneeded = (event) => {
    if (event.oldVersion === 0) {
      onCreated?.();
    }
    for (const name of STORES) {
      if (!open.result.objectStoreNames.contains(name)) {
        open.result.createObjectStore(name, { keyPath: "id" });
      }
    }
  };
  return open;
}

const moves = new WeakMap<IDBFactory, Promise<void>>();

/**
 * Copies what was kept when the app was called audiojac into the database of now, if there is none
 * yet, and then deletes the old one. Done once per factory, before any store is used.
 */
function moveLegacyDatabase(factory: IDBFactory) {
  let move = moves.get(factory);
  if (!move) {
    move = copyLegacyDatabase(factory).catch((error) => console.warn("Could not move what was kept as audiojac", error));
    moves.set(factory, move);
  }
  return move;
}

async function copyLegacyDatabase(factory: IDBFactory) {
  const openLegacy = factory.open(LEGACY_DATABASE);
  openLegacy.onupgradeneeded = () => openLegacy.transaction?.abort();
  const legacy = await request(openLegacy).catch(() => undefined);
  if (!legacy) {
    return;
  }
  const names = STORES.filter((name) => legacy.objectStoreNames.contains(name));
  const records = await Promise.all(names.map((name) => request(legacy.transaction(name, "readonly").objectStore(name).getAll()))).finally(
    () => legacy.close(),
  );
  let created = false;
  const database = await request(
    openCurrent(factory, () => {
      created = true;
    }),
  );
  try {
    if (!created) {
      return;
    }
    const write = database.transaction(STORES, "readwrite");
    names.forEach((name, index) => records[index].forEach((record) => write.objectStore(name).put(record)));
    await new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onerror = () => reject(write.error);
      write.onabort = () => reject(write.error);
    });
    factory.deleteDatabase(LEGACY_DATABASE);
  } finally {
    database.close();
  }
}
