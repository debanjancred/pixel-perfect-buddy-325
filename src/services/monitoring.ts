// Error monitoring (ADR 0002): crashes and unhandled errors go to Sentry from production
// builds when VITE_SENTRY_DSN is set; without it nothing is sent. Nothing personal leaves the
// phone: every event and breadcrumb passes through scrubEvent / scrubBreadcrumb first, and the
// only identifiers are this browser's random device id, the club id, role and app version.
// The SDK loads lazily so device-only builds don't carry it.
import type { Breadcrumb, ErrorEvent } from "@sentry/react";
import { isCloud } from "./cloud/config";
import { device } from "./device";

type Sdk = typeof import("@sentry/react");

/** Per page load: a bug that fires on every render can't use up the monthly quota. */
const MAX_EVENTS = 25;

/** Noise we can't act on: offline fetches, browser quirks, extensions. */
const IGNORE_ERRORS = [
  "Failed to fetch",
  "NetworkError when attempting to fetch resource",
  "Load failed",
  "The Internet connection appears to be offline",
  "ResizeObserver loop",
  "AbortError",
];
const DENY_URLS = [/^(chrome|moz|safari(-web)?)-extension:\/\//i, /extensions\//i];

export interface MonitoringContext {
  club_id?: string | undefined;
  role?: string | undefined;
  mode?: "demo" | "user" | undefined;
  locale?: string | undefined;
}

let sdk: Sdk | null = null;
let starting = false;
let sent = 0;
let context: MonitoringContext = {};

export const monitoringDsn = () => import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** Starts monitoring once, in the browser, for production builds with a DSN. */
export async function initMonitoring(): Promise<void> {
  const dsn = monitoringDsn();
  if (typeof window === "undefined" || !dsn || !import.meta.env.PROD || sdk || starting) return;
  starting = true;
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      release: `pujo-khata@${__APP_VERSION__}`,
      environment: environmentOf(window.location.hostname),
      // Collect nothing about the person or their requests beyond the browser name; the
      // device id below is the only user identifier.
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: { request: { allow: ["User-Agent"] }, response: false },
        httpBodies: [],
        urlQueryParams: false,
      },
      // Errors only: no performance tracing or session replay.
      tracesSampleRate: 0,
      maxBreadcrumbs: 30,
      // Errors from a phone without signal wait on the device and are sent later.
      transport: Sentry.makeBrowserOfflineTransport(Sentry.makeFetchTransport),
      // Console output can hold anything the app logged; DOM clicks, fetches and page
      // changes are enough to follow what happened.
      integrations: (defaults) => defaults.filter((i) => i.name !== "Console"),
      ignoreErrors: IGNORE_ERRORS,
      denyUrls: DENY_URLS,
      beforeBreadcrumb: scrubBreadcrumb,
      beforeSend: (event) => (sent++ < MAX_EVENTS ? scrubEvent(event) : null),
    });
    Sentry.setUser({ id: device.id() });
    Sentry.setTag("cloud", String(isCloud()));
    sdk = Sentry;
    applyContext();
  } catch {
    // Monitoring must never break the app.
  } finally {
    starting = false;
  }
}

/** Who and where, as ids only; updated when the club, role or language changes. */
export function setMonitoringContext(next: MonitoringContext) {
  context = next;
  applyContext();
}

function applyContext() {
  if (!sdk) return;
  sdk.setTags({
    club_id: context.club_id ?? "none",
    role: context.role ?? "none",
    mode: context.mode ?? "none",
    locale: context.locale ?? "none",
  });
}

/** Reports an error caught by an error boundary (the SDK sees uncaught ones itself). */
export function captureError(error: unknown, where: string) {
  sdk?.captureException(error, { tags: { boundary: where } });
}

export function environmentOf(hostname: string): string {
  const local =
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
  return local ? "local" : "production";
}

// --- Scrubbing -----------------------------------------------------------------------------

/**
 * Masks what could identify a person or reveal money in free text: Indian phone numbers,
 * rupee amounts, any other long number, and Bengali-script words (names, addresses and
 * notes are typed in Bengali; the app's own error messages are English or i18n keys).
 */
export function scrubText(s: string): string {
  return s
    .replace(/(?<![\w-])(?:\+?91[\s-]?)?[6-9]\d{9}(?![\w-])/g, "[phone]")
    .replace(/₹\s?[\d০-৯,.]+/g, "₹[n]")
    .replace(/(?<![\w-])\d{5,}(?![\w-])/g, "[n]")
    .replace(/[ঀ-৿]+/g, "[bn]");
}

/** Keeps a URL's path, drops its query and hash (search params carry ids and filters). */
export function scrubUrl(url: string): string {
  return url.replace(/[?#].*$/, "");
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.message) event.message = scrubText(event.message);
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubText(ex.value);
    for (const f of ex.stacktrace?.frames ?? []) {
      if (f.filename) f.filename = scrubUrl(f.filename);
      if (f.abs_path) f.abs_path = scrubUrl(f.abs_path);
    }
  }
  if (event.request) {
    const ua = event.request.headers?.["User-Agent"];
    event.request = {
      ...(event.request.url && { url: scrubUrl(event.request.url) }),
      ...(ua && { headers: { "User-Agent": ua } }),
    };
  }
  if (event.user) {
    if (event.user.id) event.user = { id: event.user.id };
    else delete event.user;
  }
  delete event.extra;
  delete event.server_name;
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((b): b is Breadcrumb => b !== null);
  }
  return event;
}

export function scrubBreadcrumb(b: Breadcrumb): Breadcrumb | null {
  if (b.category === "console") return null;
  const out: Breadcrumb = { ...b };
  if (out.message) out.message = scrubText(out.message);
  if (out.data) {
    const d = out.data as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof d["method"] === "string") data["method"] = d["method"];
    if (typeof d["status_code"] === "number") data["status_code"] = d["status_code"];
    for (const key of ["url", "from", "to"]) {
      const v = d[key];
      if (typeof v === "string") data[key] = scrubUrl(v);
    }
    out.data = data;
  }
  return out;
}
