// App control (ADR 0002 §3): what the owner's app_config row means for this copy of the app.
// Pure, so the rules are unit-tested; the row is read in src/services/app-config.ts.

export interface AppConfig {
  maintenance: boolean;
  maintenance_message_bn: string | null;
  maintenance_message_en: string | null;
  /** Oldest app version still allowed to sync, "x.y.z". */
  min_version: string;
  announcement_bn: string | null;
  announcement_en: string | null;
  announcement_url: string | null;
  flags: Record<string, unknown>;
  updated_at: string;
}

export interface AppStatus {
  /** This app is older than min_version: ask to update; don't sync. */
  updateRequired: boolean;
  /** The owner paused syncing for maintenance. */
  maintenance: boolean;
  /** Either of the above: entries stay on the phone until it clears. */
  syncPaused: boolean;
}

const parts = (v: string) => v.split(".").map((x) => Number.parseInt(x, 10) || 0);

/** -1, 0 or 1, comparing "x.y.z" versions numerically. */
export function compareVersions(a: string, b: string): number {
  const [pa, pb] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

const isRelease = (v: string) => /^\d+\.\d+\.\d+$/.test(v);

export function appStatus(config: AppConfig | null, version: string): AppStatus {
  // No config yet (device-only mode, or first open with no signal): fail open.
  if (!config) return { updateRequired: false, maintenance: false, syncPaused: false };
  // Development builds ("dev") are never told to update.
  const updateRequired = isRelease(version) && compareVersions(version, config.min_version) < 0;
  return {
    updateRequired,
    maintenance: config.maintenance,
    syncPaused: updateRequired || config.maintenance,
  };
}

/** The announcement to show, unless this one (identified by its updated_at) was closed. */
export function visibleAnnouncement(
  config: AppConfig | null,
  dismissedAt: string | null,
): { bn: string; en: string; url: string | null; id: string } | null {
  if (!config || !(config.announcement_bn || config.announcement_en)) return null;
  if (dismissedAt === config.updated_at) return null;
  return {
    bn: config.announcement_bn ?? config.announcement_en ?? "",
    en: config.announcement_en ?? config.announcement_bn ?? "",
    url: config.announcement_url,
    id: config.updated_at,
  };
}
