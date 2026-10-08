import type { PanelTab } from "../../store/patchStore";
import { usePatchStore } from "../../store/usePatchStore";

const TABS: { tab: PanelTab; label: string; title: string }[] = [
  { tab: "song", label: "Song", title: "Chain the patterns bar by bar" },
  { tab: "perform", label: "Perform", title: "Play the knobs pinned from the nodes" },
];

/** The tabs of the panel under the editor: the song, or the knobs pinned to perform. */
export function PanelTabs() {
  const shown = usePatchStore((state) => state.panelTab);
  const setPanelTab = usePatchStore((state) => state.setPanelTab);

  return (
    <div className="panel-tabs" role="tablist" aria-label="Panel">
      {TABS.map(({ tab, label, title }) => (
        <button
          key={tab}
          type="button"
          role="tab"
          className="clip-editor-title panel-tab"
          aria-selected={shown === tab}
          title={title}
          onClick={() => setPanelTab(tab)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
