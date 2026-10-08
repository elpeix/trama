export const VERSION = __APP_VERSION__;

export const REPOSITORY = "https://github.com/elpeix/trama";

export const TESTED_BROWSERS = "desktop browsers built on Chromium, such as Chrome and Brave";

interface Issue {
  userAgent: string;
  title?: string;
  details?: string;
}

/** A link that opens a new issue on the repository, with the version and the browser written in. */
export function issueUrl({ userAgent, title = "", details }: Issue) {
  const body = [
    "What happened, and what did you expect?",
    "",
    "",
    ...(details ? ["Error:", "```", details, "```", ""] : []),
    `Trama ${VERSION}`,
    `Browser: ${userAgent}`,
    "",
    "If you can, attach the patch (Save) that shows the problem.",
  ].join("\n");
  return `${REPOSITORY}/issues/new?${new URLSearchParams({ title, body })}`;
}
