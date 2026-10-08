import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AudioEngine } from "./audio/AudioEngine";
import { ClipEditor } from "./components/sequencing/ClipEditor";
import { EngineContext } from "./components/EngineContext";
import { SamplesContext } from "./components/SamplesContext";
import { PresetsContext } from "./components/PresetsContext";
import { PresetLibrary } from "./presets/presetLibrary";
import { scopedEngine } from "./components/scopedEngine";
import { HistoryControls } from "./components/header/HistoryControls";
import { KeysContext } from "./components/keys/KeysContext";
import { AboutButton } from "./about/AboutButton";
import { BrowserNotice } from "./about/BrowserNotice";
import { EmptyHint } from "./about/EmptyHint";
import { Guide } from "./about/Guide";
import { GuideContext } from "./about/GuideContext";
import type { BrowserSupport } from "./about/browserSupport";
import { PieceInfo } from "./components/header/PieceInfo";
import { ModuleMenu } from "./components/header/ModuleMenu";
import { PatchFileControls } from "./components/header/PatchFileControls";
import { RecordButton } from "./components/header/RecordButton";
import { PerformPanel } from "./components/perform/PerformPanel";
import { ComposerButton } from "./components/header/ComposerButton";
import { SourceControl } from "./components/header/SourceControl";
import { SongControlContext } from "./components/song/SongControlContext";
import { SongPanel } from "./components/song/SongPanel";
import { SongRecorder } from "./components/song/SongRecorder";
import { CrossfaderPlayer } from "./components/perform/CrossfaderPlayer";
import { useSongMode } from "./components/song/useSongMode";
import { MeterControl } from "./components/header/MeterControl";
import { SwingControl } from "./components/header/SwingControl";
import { TempoControl } from "./components/header/TempoControl";
import { Transport } from "./components/header/Transport";
import { StoppedSoundButton } from "./components/header/StoppedSoundButton";
import { useComputerKeyboard } from "./components/keys/useComputerKeyboard";
import { isTyping } from "./components/isTyping";
import { ThemeButton } from "./theme/ThemeButton";
import { ThemeContext } from "./theme/ThemeContext";
import { useTheme } from "./theme/useTheme";
import { useUndoShortcuts } from "./components/header/useUndoShortcuts";
import { FlowEditor } from "./flow/FlowEditor";
import { GroupButton } from "./flow/GroupButton";
import { useClipboardShortcuts } from "./flow/useClipboardShortcuts";
import { SubpatchPath } from "./flow/SubpatchPath";
import type { PatchStore } from "./store/patchStore";
import { PatchStoreContext, usePatchStore } from "./store/usePatchStore";
import "./App.css";

interface AppProps {
  engine: AudioEngine;
  store: PatchStore;
  /** The presets saved in this browser; none kept between sessions without it. */
  presets?: PresetLibrary;
  /** Whether Trama is tested on this browser, to tell when it is not. */
  browser?: BrowserSupport;
}

/** The engine as the graph on show sees it, for what draws the nodes and the piano roll. */
function EngineOnShow({ engine, children }: { engine: AudioEngine; children: ReactNode }) {
  const path = usePatchStore((state) => state.path);
  const scoped = useMemo(() => scopedEngine(engine, path), [engine, path]);
  return <EngineContext value={scoped}>{children}</EngineContext>;
}

/** The piano roll, with the engine as the graph of its clip sees it, wherever the editor is. */
function OpenClipEditor({ engine }: { engine: AudioEngine }) {
  const clipEditor = usePatchStore((state) => state.clipEditor);
  const scoped = useMemo(() => scopedEngine(engine, clipEditor?.slice(0, -1) ?? []), [engine, clipEditor]);
  return clipEditor ? (
    <EngineContext value={scoped}>
      <ClipEditor key={clipEditor.join("/")} path={clipEditor} />
    </EngineContext>
  ) : null;
}

function OpenSongPanel({ engine }: { engine: AudioEngine }) {
  const open = usePatchStore((state) => state.songPanel);
  const tab = usePatchStore((state) => state.panelTab);
  useSongMode(engine);
  if (!open) {
    return null;
  }
  return tab === "perform" ? <PerformPanel /> : <SongPanel />;
}

/** Leaves the panel full screen with Escape, unless something else takes it, such as a menu or a field. */
function useEscapeFullscreen() {
  const fullscreen = usePatchStore((state) => state.songPanel && state.panelFullscreen);
  const setPanelFullscreen = usePatchStore((state) => state.setPanelFullscreen);

  useEffect(() => {
    if (!fullscreen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !isTyping(event.target)) {
        setPanelFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, setPanelFullscreen]);
}

/** What only makes sense next to the editor, such as adding modules to it: an empty place while the panel is full screen. */
function EditorOnly({ children }: { children: ReactNode }) {
  const fullscreen = usePatchStore((state) => state.songPanel && state.panelFullscreen);
  return fullscreen ? null : children;
}

/** The editor and the panel under it, or the panel alone in its place while full screen. */
function Workspace({ engine, header }: { engine: AudioEngine; header: ReactNode }) {
  const fullscreen = usePatchStore((state) => state.songPanel && state.panelFullscreen);
  useEscapeFullscreen();

  return (
    <div className={fullscreen ? "app app-fullscreen" : "app"}>
      {header}
      {!fullscreen && (
        <EngineOnShow engine={engine}>
          <main className="app-editor">
            <SubpatchPath />
            <GroupButton />
            <FlowEditor />
            <EmptyHint />
          </main>
        </EngineOnShow>
      )}
      {!fullscreen && <OpenClipEditor engine={engine} />}
      <OpenSongPanel engine={engine} />
    </div>
  );
}

const localStorageOf = () => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

function App({ engine, store, presets: library, browser = "tested" }: AppProps) {
  const [presets] = useState(() => library ?? new PresetLibrary());
  const [songControl] = useState(() => ({
    engine,
    store,
    recorder: new SongRecorder(engine, store),
    crossfader: new CrossfaderPlayer(engine, store),
  }));
  const keys = useComputerKeyboard(engine);
  const theme = useTheme();
  useUndoShortcuts(store);
  useClipboardShortcuts(store);
  const [guide, setGuide] = useState(false);
  const openGuide = useCallback(() => setGuide(true), []);

  return (
    <ThemeContext value={theme}>
      <PatchStoreContext value={store}>
        <GuideContext value={openGuide}>
        <EngineContext value={engine}>
          <SamplesContext value={engine.samples}>
            <PresetsContext value={presets}>
              <KeysContext value={keys}>
                <SongControlContext value={songControl}>
                <ReactFlowProvider>
                  <Workspace
                    engine={engine}
                    header={
                      <>
                      <header className="app-header">
                        <div className="app-header-side">
                          <AboutButton engine={engine} />
                          <PatchFileControls />
                          <HistoryControls />
                          <EditorOnly>
                            <ModuleMenu />
                          </EditorOnly>
                        </div>
                        <PieceInfo />
                        <div className="app-header-side app-header-transport">
                          <SourceControl />
                          <ComposerButton />
                          <TempoControl />
                          <div className="hw-group">
                            <SwingControl />
                            <MeterControl />
                          </div>
                          <RecordButton engine={engine} />
                          <Transport engine={engine} />
                          <StoppedSoundButton engine={engine} />
                          <ThemeButton />
                        </div>
                      </header>
                      <BrowserNotice support={browser} storage={localStorageOf()} />
                      </>
                    }
                  />
                </ReactFlowProvider>
                </SongControlContext>
              </KeysContext>
            </PresetsContext>
          </SamplesContext>
        </EngineContext>
        {guide && <Guide onClose={() => setGuide(false)} />}
        </GuideContext>
      </PatchStoreContext>
    </ThemeContext>
  );
}

export default App;
