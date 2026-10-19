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

// --- Install prompt ------------------------------------------------------------------------
// Chrome/Edge on Android offer installation through a `beforeinstallprompt` event, which can
// fire before the screen with the install button is open. The root route starts listening as
// the app loads (listenForInstallPrompt); src/features/install reads this store.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallState {
  /** The browser offered installation and we haven't used the offer yet. */
  canPrompt: boolean;
  /** Installed during this visit (`appinstalled`). */
  installed: boolean;
}

let deferred: InstallPromptEvent | null = null;
let installState: InstallState = { canPrompt: false, installed: false };
const listeners = new Set<() => void>();

function setInstallState(next: InstallState) {
  installState = next;
  for (const l of listeners) l();
}

let listening = false;
export function listenForInstallPrompt() {
  if (typeof window === "undefined" || listening) return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // show our own button instead of the browser's mini-bar
    deferred = e as InstallPromptEvent;
    setInstallState({ ...installState, canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    setInstallState({ canPrompt: false, installed: true });
  });
}

export const installPrompt = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => installState,
  /** Shows the browser's install dialog; true when the person accepted. */
  async show(): Promise<boolean> {
    const e = deferred;
    if (!e) return false;
    deferred = null; // an offer can be used once
    setInstallState({ ...installState, canPrompt: false });
    await e.prompt();
    return (await e.userChoice).outcome === "accepted";
  },
};
