// Client events (ADR 0002 §2). When the server refuses a record, the phone notes why and sends
// the note the next time it syncs, so the owner sees failures nobody calls about. Reported
// once per record and reason; network failures never (weak signal is normal); never the
// sample club. Sending is in the background: it never holds up a sync or shows an error, and
// what can't be sent waits for the next sync.
import type { ErrKey } from "@/lib/validation";
import { newId } from "@/lib/id";
import { APP_VERSION } from "@/lib/version";
import { currentAppStatus } from "./app-config";
import { getCloudClient } from "./cloud/client";
import { sendClientEvents } from "./cloud/client-events";
import { isCloud } from "./cloud/config";
import { device } from "./device";
import { session } from "./session";
import type { SyncRecord } from "./sync";

const KEY = "pk_client_events_v1";
/** Unsent reports kept on the phone; the oldest go first (the server caps 50 a day anyway). */
const MAX_QUEUED = 100;
/** Records remembered as already reported, so a retry that fails the same way isn't. */
const MAX_REPORTED = 500;

export interface ClientEvent {
  id: string;
  kind: "sync_failed";
  error_key: ErrKey;
  entity_type: SyncRecord["kind"];
  record_id: string;
  club_id: string;
}
export type SyncFailureReport = Pick<
  ClientEvent,
  "error_key" | "entity_type" | "record_id" | "club_id"
>;

interface Saved {
  queue: ClientEvent[];
  /** record id → the reason last reported for it. */
  reported: Record<string, ErrKey>;
}

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (saved && Array.isArray(saved.queue) && saved.reported) return saved;
  } catch {
    /* start afresh */
  }
  return { queue: [], reported: {} };
}

function save(s: Saved) {
  const reported = Object.entries(s.reported);
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        queue: s.queue.slice(-MAX_QUEUED),
        reported: Object.fromEntries(reported.slice(-MAX_REPORTED)),
      }),
    );
  } catch {
    /* storage full: reports are best effort */
  }
}

export const queuedClientEvents = () => load().queue;

/**
 * After a sync: queues a report for each refusal not already reported with that reason, and
 * forgets records that went through (a later refusal of the same record is new).
 */
export function recordSyncOutcome(failures: SyncFailureReport[], synced: string[]) {
  const s = load();
  const forget = synced.filter((id) => id in s.reported);
  if (!failures.length && !forget.length) return;
  for (const id of forget) delete s.reported[id];
  for (const f of failures) {
    if (s.reported[f.record_id] === f.error_key) continue;
    s.reported[f.record_id] = f.error_key;
    s.queue.push({ id: newId(), kind: "sync_failed", ...f });
  }
  save(s);
}

let sending: Promise<number> | null = null;

/** Sends queued reports when signed in to the cloud and online. Never throws. */
export function flushClientEvents(): Promise<number> {
  sending ??= send().finally(() => {
    sending = null;
  });
  return sending;
}

async function send(): Promise<number> {
  const queue = load().queue;
  if (!queue.length || !isCloud() || session.get()?.mode !== "user") return 0;
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  if (currentAppStatus().syncPaused) return 0;
  try {
    const stored = await sendClientEvents(getCloudClient(), device.id(), APP_VERSION, queue);
    // The server skipped or capped some? Still done: resending would be skipped again.
    const sent = new Set(queue.map((e) => e.id));
    const s = load();
    s.queue = s.queue.filter((e) => !sent.has(e.id));
    save(s);
    return stored;
  } catch {
    return 0; // kept for the next sync
  }
}
