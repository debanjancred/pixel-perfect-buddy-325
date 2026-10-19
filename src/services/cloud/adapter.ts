// Cloud SyncAdapter: sends queued records to Supabase. Every insert is a plain insert where
// "this id already exists" counts as sent (the client UUID is the idempotency key), so retries
// after a lost connection are harmless; voids are a separate update that the server lets only
// treasurers/admins make, once. Records are sent one by one so one rejection doesn't sink
// the batch; a record that depends on a failed one simply fails too and is retried.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SyncAdapter, SyncRecord, SyncResult } from "../sync";
import { ValidationError } from "@/lib/validation";
import { errorKey } from "./errors";

export interface CloudAdapterDeps {
  /** Reads a voucher photo saved on this device (IndexedDB), for upload. */
  loadVoucher: (id: string) => Promise<Blob | null>;
}

/** Storage path for a voucher: one folder per club (see the storage migration). */
export const voucherPath = (clubId: string, expenseId: string) => `${clubId}/${expenseId}.jpg`;
export const isVoucherPath = (id: string) => id.includes("/");

const TABLE = {
  member: "club_members",
  household: "households",
  event: "club_events",
  chanda: "chanda_transactions",
  expense: "expense_records",
  handover: "cash_handovers",
} as const;

/** Drop device-only fields before a row goes to the server. */
function row(record: object) {
  const { sync_status: _local, ...rest } = record as { sync_status?: unknown };
  return rest;
}

export function createCloudAdapter(client: SupabaseClient, deps: CloudAdapterDeps): SyncAdapter {
  /**
   * An UPDATE that row-level security filters out changes nothing *without* an error, so
   * ask for the row back and treat "no row" as refused — otherwise a void the server
   * rejected would be marked synced on the phone and the two would silently diverge.
   */
  const updateOne = async (table: string, id: string, patch: object) => {
    const { data, error } = await client.from(table).update(patch).eq("id", id).select("id");
    if (error) throw error;
    // Row-level security hid the row (or it is missing): the server refused the change.
    if (!data?.length) throw new ValidationError("permission", "err_forbidden");
  };

  /**
   * Not an upsert: PostgreSQL checks an ON CONFLICT insert against the read policies too,
   * and a removed device may still send its cash entries but read nothing
   * (…_removed_device_sessions.sql). A duplicate primary key means an earlier attempt got
   * through.
   */
  const insertOnce = async (table: string, value: object) => {
    const { error } = await client.from(table).insert(value);
    if (error && !(error.code === "23505" && /_pkey\b/.test(error.message))) throw error;
  };

  const voidIfNeeded = async (
    table: string,
    r: {
      id: string;
      voided_at?: string | undefined;
      void_reason?: string | undefined;
      status?: string;
    },
  ) => {
    if (!r.voided_at) return;
    const patch: { voided_at: string; void_reason?: string | undefined; status?: string } = {
      voided_at: r.voided_at,
      void_reason: r.void_reason,
    };
    if (r.status) patch.status = r.status;
    await updateOne(table, r.id, patch);
  };

  const send = async (item: SyncRecord) => {
    switch (item.kind) {
      case "club": {
        const c = item.record;
        const { error } = await client.rpc("create_club", {
          p_id: c.id,
          p_slug: c.slug,
          p_name: c.name_bn,
          p_area: c.area_label,
          p_target: c.target_amount,
          p_year: c.puja_year,
          p_creator_member_id: item.admin.id,
          p_creator_name: item.admin.name,
        });
        if (error) throw error;
        return;
      }
      case "member": {
        await insertOnce(TABLE.member, item.record);
        // Name/role may have changed since the member was first sent.
        await updateOne(TABLE.member, item.record.id, {
          name: item.record.name,
          role: item.record.role,
        });
        return;
      }
      case "household":
      case "event":
        await insertOnce(TABLE[item.kind], item.record);
        return;
      case "event_update": {
        // An admin's edit or (soft) delete; the server refuses anyone else.
        const e = item.record;
        await updateOne(TABLE.event, e.id, {
          title_bn: e.title_bn,
          title_en: e.title_en,
          date: e.date,
          deleted_at: e.deleted_at ?? null,
        });
        return;
      }
      case "chanda":
      case "handover":
        await insertOnce(TABLE[item.kind], row(item.record));
        await voidIfNeeded(TABLE[item.kind], item.record);
        return;
      case "expense": {
        const e = item.record;
        let voucher = e.voucher_image_id;
        if (voucher && !isVoucherPath(voucher)) {
          const blob = await deps.loadVoucher(voucher);
          voucher = undefined;
          if (blob) {
            const path = voucherPath(e.club_id, e.id);
            const { error } = await client.storage
              .from("vouchers")
              .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
            // Already uploaded on an earlier attempt: fine.
            if (error && !/exists|duplicate/i.test(error.message)) throw error;
            voucher = path;
          }
        }
        await insertOnce(TABLE.expense, { ...row(e), voucher_image_id: voucher ?? null });
        await voidIfNeeded(TABLE.expense, e);
        return;
      }
      case "event_delta": {
        const { error } = await client.rpc("register_event", {
          p_event: item.record.event_id,
          p_delta: item.record.delta,
        });
        if (error) throw error;
        return;
      }
    }
  };

  return {
    async push(records) {
      const results: SyncResult[] = [];
      for (const item of records) {
        try {
          await send(item);
          results.push({ id: item.record.id, ok: true });
        } catch (e) {
          results.push({ id: item.record.id, ok: false, error: errorKey(e) });
        }
      }
      return results;
    },
  };
}
