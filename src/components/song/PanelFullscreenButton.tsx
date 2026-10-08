import { usePatchStore } from "../../store/usePatchStore";

/** Shows the panel in the place of the editor, which is not drawn meanwhile, and back. */
export function PanelFullscreenButton() {
  const fullscreen = usePatchStore((state) => state.panelFullscreen);
  const setPanelFullscreen = usePatchStore((state) => state.setPanelFullscreen);

  return (
    <button
      type="button"
      className="remove-badge panel-fullscreen-button"
      aria-label={fullscreen ? "Exit full screen" : "Full screen"}
      aria-pressed={fullscreen}
      title={fullscreen ? "Back to the editor (Esc)" : "Show only the panel, without the editor"}
      onClick={() => setPanelFullscreen(!fullscreen)}
    >
      <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        <path
          d={fullscreen ? "M3 1v2H1M5 1v2h2M3 7V5H1M5 7V5h2" : "M1 3V1h2M7 3V1H5M1 5v2h2M7 5v2H5"}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
