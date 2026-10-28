import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClientEvent } from "../client-events";

/** Sends failure reports to log_client_events (…_client_events.sql); returns how many stored. */
export async function sendClientEvents(
  client: SupabaseClient,
  deviceId: string,
  appVersion: string,
  events: ClientEvent[],
): Promise<number> {
  const { data, error } = await client.rpc("log_client_events", {
    p_device: deviceId,
    p_app_version: appVersion,
    p_events: events,
  });
  if (error) throw error;
  return data as number;
}
