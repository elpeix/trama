import { useContext, useState, useSyncExternalStore } from "react";
import type { AudioEngine } from "../audio/AudioEngine";
import { Logo } from "../components/header/Logo";
import { GuideContext } from "./GuideContext";
import { Modal } from "./Modal";
import { issueUrl, REPOSITORY, TESTED_BROWSERS, VERSION } from "./release";

/** The logo on the bar, which opens what Trama is: its version, where to report a problem, its source and license. */
export function AboutButton({ engine }: { engine: Pick<AudioEngine, "state" | "subscribe"> }) {
  const [open, setOpen] = useState(false);
  const running = useSyncExternalStore(engine.subscribe, () => engine.state === "running");
  const openGuide = useContext(GuideContext);

  return (
    <h1 className="logo" aria-label="Trama">
      <button
        type="button"
        className={running ? "logo-button running" : "logo-button"}
        aria-label="About Trama"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Logo />
      </button>
      {open && (
        <Modal title={<Logo />} label="About Trama" className="about-card" onClose={() => setOpen(false)}>
          <p className="about-version">Version {VERSION} · beta</p>
          <p>A modular synthesizer in the browser: put modules, join them with cables and play.</p>
          <p>Tested on {TESTED_BROWSERS}.</p>
          <ul className="about-links">
            {openGuide && (
              <li>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setOpen(false);
                    openGuide();
                  }}
                >
                  Getting started
                </button>
              </li>
            )}
            <li>
              <a href={issueUrl({ userAgent: navigator.userAgent })} target="_blank" rel="noreferrer">
                Report a problem
              </a>
            </li>
            <li>
              <a href={REPOSITORY} target="_blank" rel="noreferrer">
                Source code
              </a>
            </li>
            <li>
              License:{" "}
              <a href={`${REPOSITORY}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                GPL-3.0
              </a>
            </li>
          </ul>
        </Modal>
      )}
    </h1>
  );
}
