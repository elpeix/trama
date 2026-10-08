import { useState } from "react";
import type { BrowserSupport } from "./browserSupport";
import { TESTED_BROWSERS } from "./release";

const DISMISSED_KEY = "trama:browser-notice";

interface NoticeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const MESSAGES: Record<Exclude<BrowserSupport, "tested">, string> = {
  untested: `Trama is tested on ${TESTED_BROWSERS}. In this browser it may sound or behave differently.`,
  mobile: `Phones and tablets are not supported yet: Trama is tested on ${TESTED_BROWSERS}.`,
};

const read = (storage: NoticeStorage | undefined) => {
  try {
    return storage?.getItem(DISMISSED_KEY) ?? null;
  } catch {
    return null;
  }
};

interface BrowserNoticeProps {
  support: BrowserSupport;
  storage: NoticeStorage | undefined;
}

/** A bar that tells when this browser is not one Trama is tested on, until it is dismissed. */
export function BrowserNotice({ support, storage }: BrowserNoticeProps) {
  const [dismissed, setDismissed] = useState(() => read(storage) === support);

  if (support === "tested" || dismissed) {
    return null;
  }

  const dismiss = () => {
    setDismissed(true);
    try {
      storage?.setItem(DISMISSED_KEY, support);
    } catch {
      return;
    }
  };

  return (
    <div className="browser-notice" role="status" aria-label="Browser support">
      <p>{MESSAGES[support]}</p>
      <button type="button" className="hw" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
}
