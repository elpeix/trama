import { describe, expect, it } from "vitest";
import { browserSupport } from "./browserSupport";

const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const FIREFOX_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const chromium = (mobile = false) => ({ brands: [{ brand: "Chromium", version: "130" }, { brand: "Brave", version: "130" }], mobile });

describe("browserSupport", () => {
  it("knows the desktop browsers built on Chromium, as tested", () => {
    expect(browserSupport({ userAgent: CHROME_MAC, maxTouchPoints: 0, userAgentData: chromium() })).toBe("tested");
  });

  it("tells Safari and Firefox on a desktop apart, as untested", () => {
    expect(browserSupport({ userAgent: SAFARI_MAC, maxTouchPoints: 0 })).toBe("untested");
    expect(browserSupport({ userAgent: FIREFOX_MAC, maxTouchPoints: 0 })).toBe("untested");
  });

  it("knows phones and tablets, whatever their browser", () => {
    expect(browserSupport({ userAgent: CHROME_ANDROID, maxTouchPoints: 5, userAgentData: chromium(true) })).toBe("mobile");
    expect(browserSupport({ userAgent: CHROME_ANDROID, maxTouchPoints: 5 })).toBe("mobile");
    expect(browserSupport({ userAgent: SAFARI_IPHONE, maxTouchPoints: 5 })).toBe("mobile");
  });

  it("knows an iPad, which says it is a Mac but can be touched", () => {
    expect(browserSupport({ userAgent: SAFARI_MAC, maxTouchPoints: 5 })).toBe("mobile");
  });
});
