// The device functions in supabase/migrations/…_devices.sql. Errors come back as the app's
// own keys (err_deviceLimit, err_forbidden, …) via ValidationError("device", …).
import type { SupabaseClient } from "@supabase/supabase-js";
import { ValidationError } from "@/lib/validation";
import type { UserDevice } from "@/types/domain";
import { cloudErrorKey } from "./errors";

export type DeviceCheck =
  | { status: "active"; is_collect: boolean; collect_label: string | null }
  | { status: "removed" }
  | { status: "limit" };

async function call<T>(client: SupabaseClient, fn: string, args: object): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new ValidationError("device", cloudErrorKey(error) ?? "err_syncFailed");
  return data as T;
}

/** Registers this device at login (err_deviceLimit over 3), or checks it in on app open. */
export const touchDevice = (client: SupabaseClient, id: string, label: string, login: boolean) =>
  call<DeviceCheck>(client, "touch_device", { p_device: id, p_label: label, p_login: login });

export const setCollectDevice = (client: SupabaseClient, id: string) =>
  call<DeviceCheck>(client, "set_collect_device", { p_device: id });

export const removeDevice = (client: SupabaseClient, id: string) =>
  call<null>(client, "remove_device", { p_device: id });

export const resetCollectDevice = (client: SupabaseClient, memberId: string) =>
  call<null>(client, "reset_collect_device", { p_member: memberId });

/** The signed-in person's devices (row-level security returns only theirs, not removed). */
export async function listDevices(client: SupabaseClient): Promise<UserDevice[]> {
  const { data, error } = await client
    .from("user_devices")
    .select("id, label, is_collect, created_at, last_seen_at")
    .order("created_at");
  if (error) throw new ValidationError("device", cloudErrorKey(error) ?? "err_syncFailed");
  return data as UserDevice[];
}
