// Pure helpers for the device list (cloud mode).

/**
 * A short, recognisable name for a device from its user agent, e.g. "Android · Chrome" or
 * "iPhone · Safari". Platform and browser names are proper nouns, the same in both languages.
 */
export function deviceLabel(ua: string): string {
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  // Order matters: Edge and Samsung Internet also say "Chrome"; Chrome also says "Safari".
  const browser = /EdgA?\//.test(ua)
    ? "Edge"
    : /SamsungBrowser\//.test(ua)
      ? "Samsung Internet"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /Chrome\/|CriOS\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "";
  return [os, browser].filter(Boolean).join(" · ") || "Browser";
}
