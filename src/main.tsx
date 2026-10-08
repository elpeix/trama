import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { AudioEngine } from "./audio/AudioEngine";
import { loadWorklets } from "./audio/worklets/loadWorklets";
import { indexedDbStorage, memoryStorage, SampleLibrary } from "./samples/sampleLibrary";
import { indexedDbPresets, memoryPresets, PresetLibrary } from "./presets/presetLibrary";
import { discardAutosave, restoreAutosave, startAutosave } from "./store/autosave";
import { CrashScreen, ErrorBoundary, StartFailedScreen } from "./components/errors/ErrorScreens";
import { savePatch } from "./components/header/savePatch";
import { createPatchStore } from "./store/patchStore";
import { browserSupport } from "./about/browserSupport";
import { applyTheme, readThemeChoice, resolveTheme } from "./theme/theme";
import { systemDarkQuery, themeStorage } from "./theme/useTheme";
import { moveLegacyKeys } from "./storage/legacy";
import "./index.css";

const storageOf = (name: "sessionStorage" | "localStorage") => {
  try {
    return window[name];
  } catch {
    return undefined;
  }
};

moveLegacyKeys(storageOf("localStorage"));
moveLegacyKeys(storageOf("sessionStorage"));

applyTheme(document.documentElement, resolveTheme(readThemeChoice(themeStorage()), systemDarkQuery()?.matches ?? false));

const root = createRoot(document.getElementById("root")!);

const context = await (async () => {
  try {
    const context = new AudioContext();
    await loadWorklets(context);
    return context;
  } catch (error) {
    console.error("Could not start the audio", error);
    root.render(<StartFailedScreen error={error} />);
    return undefined;
  }
})();

if (context) {
  start(context);
}

function start(context: AudioContext) {
  const sampleStorage = () => {
    try {
      return indexedDbStorage();
    } catch {
      return memoryStorage();
    }
  };
  const engine = new AudioEngine(context, new SampleLibrary(sampleStorage()));
  const presets = new PresetLibrary(
    (() => {
      try {
        return indexedDbPresets();
      } catch {
        return memoryPresets();
      }
    })(),
  );
  void presets.load();
  const store = createPatchStore(engine);

  const storages = [storageOf("sessionStorage"), storageOf("localStorage")].filter((storage) => storage !== undefined);
  restoreAutosave(store, storages);
  const stopAutosave = startAutosave(store, storages);

  const startEmpty = () => {
    stopAutosave();
    discardAutosave(storages);
    window.location.reload();
  };

  root.render(
    <StrictMode>
      <ErrorBoundary
        fallback={(error) => (
          <CrashScreen
            error={error}
            onReload={() => window.location.reload()}
            onSave={() => savePatch(store.getState().toPatch(), engine.samples)}
            onStartEmpty={startEmpty}
          />
        )}
      >
        <App engine={engine} store={store} presets={presets} browser={browserSupport(navigator as Navigator & Parameters<typeof browserSupport>[0])} />
      </ErrorBoundary>
    </StrictMode>,
  );
}
