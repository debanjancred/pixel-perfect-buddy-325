// Service worker registration (SPEC Story 5.2; approach in AGENTS.md).
import { APP_VERSION } from "./version";

export interface PwaEnv {
  prod: boolean;
  hostname: string;
  inIframe: boolean;
}

/**
 * The worker runs only in production builds served directly — never on the dev server
 * (`prod` false) or in the Lovable preview, where caching would show stale code while
 * editing. A local `vite preview` of a production build does register, for testing.
 */
export const shouldRegister = ({ prod, hostname, inIframe }: PwaEnv) =>
  prod &&
  !inIframe &&
  !hostname.startsWith("id-preview--") &&
  !hostname.endsWith(".lovableproject.com");

/** Same-origin page + assets and font URLs this page has already loaded. */
function loadedUrls(): string[] {
  const urls = new Set<string>([location.href, "/home"]);
  for (const e of performance.getEntriesByType("resource")) {
    const u = new URL(e.name);
    if (u.origin === location.origin || u.hostname.startsWith("fonts.g")) urls.add(u.href);
  }
  for (const l of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'))
    urls.add(l.href);
  return [...urls];
}

export async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const env: PwaEnv = {
    prod: import.meta.env.PROD,
    hostname: location.hostname,
    inIframe: window.self !== window.top,
  };
  if (!shouldRegister(env)) {
    // A worker left over from an earlier build must not serve stale code here.
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    return;
  }
  try {
    await navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(APP_VERSION)}`);
    const ready = await navigator.serviceWorker.ready;
    ready.active?.postMessage({ type: "CACHE_URLS", urls: loadedUrls() });
  } catch {
    /* the app works without it; it just won't open offline */
  }
}
