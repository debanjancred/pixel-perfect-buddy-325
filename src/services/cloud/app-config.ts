import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppConfig } from "@/lib/app-status";

/** The owner's single app_config row (…_app_config.sql); readable by anyone. */
export async function fetchAppConfig(client: SupabaseClient): Promise<AppConfig> {
  const { data, error } = await client
    .from("app_config")
    .select(
      "maintenance, maintenance_message_bn, maintenance_message_en, min_version, " +
        "announcement_bn, announcement_en, announcement_url, flags, updated_at",
    )
    .single();
  if (error) throw error;
  return data as unknown as AppConfig;
}
