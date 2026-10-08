export type BrowserSupport = "tested" | "untested" | "mobile";

interface BrowserInfo {
  userAgent: string;
  maxTouchPoints: number;
  userAgentData?: { brands: { brand: string }[]; mobile: boolean };
}

const MOBILE = /Android|iPhone|iPad|iPod|Mobile/;

/** Whether Trama is tested on this browser: desktop browsers built on Chromium; phones and tablets not at all. */
export function browserSupport({ userAgent, maxTouchPoints, userAgentData }: BrowserInfo): BrowserSupport {
  const iPad = /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  if (userAgentData?.mobile || MOBILE.test(userAgent) || iPad) {
    return "mobile";
  }
  return userAgentData?.brands.some(({ brand }) => brand === "Chromium") ? "tested" : "untested";
}
