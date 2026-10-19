// Devices view model (cloud mode). Pure, so it is unit-tested without a server.
import type { UserDevice } from "@/types/domain";

export type ListedDevice = UserDevice & { this_device: boolean };

/** The collecting device first, then this device, then the most recently used. */
export function orderDevices(list: ListedDevice[]): ListedDevice[] {
  const rank = (d: ListedDevice) => (d.is_collect ? 0 : d.this_device ? 1 : 2);
  return [...list].sort(
    (a, b) => rank(a) - rank(b) || b.last_seen_at.localeCompare(a.last_seen_at),
  );
}

/** What the collect screen shows on a device that doesn't collect: who does, if anyone. */
export function collectGateMessage(collectLabel: string | null) {
  return collectLabel
    ? ({ key: "collectGateOther", name: collectLabel } as const)
    : ({ key: "collectGateNone" } as const);
}
