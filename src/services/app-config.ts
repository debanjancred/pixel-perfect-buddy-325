// App control (ADR 0002 §3). The app checks the owner's app_config row on every open, in the
// background, and never waits for it: the last copy is kept on the phone and used until a
// fresh one arrives. With no copy and no signal it fails open — everything on the phone
// works, and syncing simply waits (src/features/app-status decides what the row means).
import { appStatus, type AppConfig, type AppStatus } from "@/lib/app-status";
import { APP_VERSION } from "@/lib/version";
import { getCloudClient } from "./cloud/client";
import { fetchAppConfig } from "./cloud/app-config";
import { isCloud } from "./cloud/config";

const KEY = "pk_app_config_v1";
const DISMISSED = "pk_announcement_closed";
const TIMEOUT_MS = 5000;

export function cachedAppConfig(): AppConfig | null {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AppConfig) : null;
  } catch {
    return null;
  }
}

/** Fetches a fresh copy (cloud mode, online, within 5 s) and keeps it; else the cached one. */
export async function refreshAppConfig(): Promise<AppConfig | null> {
  const cached = cachedAppConfig();
  if (!isCloud() || (typeof navigator !== "undefined" && !navigator.onLine)) return cached;
  try {
    const fresh = await Promise.race([
      fetchAppConfig(getCloudClient()),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS)),
    ]);
    localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return cached;
  }
}

/** What the last known config means for this app (sync paused, update needed …). */
export const currentAppStatus = (): AppStatus => appStatus(cachedAppConfig(), APP_VERSION);

export const announcementClosed = () => {
  try {
    return localStorage.getItem(DISMISSED);
  } catch {
    return null;
  }
};
export const closeAnnouncement = (id: string) => {
  try {
    localStorage.setItem(DISMISSED, id);
  } catch {
    /* it shows again next time; harmless */
  }
};
