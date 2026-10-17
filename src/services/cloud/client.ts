import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cloudConfig } from "./config";

let client: SupabaseClient | null = null;

/** The Supabase client, created on first use in the browser. Throws if cloud mode is off. */
export function getCloudClient(): SupabaseClient {
  if (client) return client;
  const config = cloudConfig();
  if (!config) throw new Error("Cloud mode is not configured (VITE_SUPABASE_URL / ANON_KEY)");
  client = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "pk_cloud_auth" },
  });
  return client;
}

/** Tests inject a fake client. */
export const setCloudClient = (next: SupabaseClient | null) => {
  client = next;
};
