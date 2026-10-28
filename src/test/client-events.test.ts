import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A released app; cloud mode switched per test, the server call under test control.
vi.mock("@/lib/version", () => ({ APP_VERSION: "0.11.0" }));
let cloud = false;
vi.mock("@/services/cloud/config", () => ({ isCloud: () => cloud, otpLength: () => 6 }));
vi.mock("@/services/cloud/client", () => ({ getCloudClient: () => ({}) }));
const sendClientEvents = vi.fn();
vi.mock("@/services/cloud/client-events", () => ({
  sendClientEvents: (...args: unknown[]) => sendClientEvents(...args),
}));

import { api } from "@/services/api";
import { createCloudAdapter } from "@/services/cloud/adapter";
import { isNetworkError } from "@/services/cloud/errors";
import { flushClientEvents, queuedClientEvents } from "@/services/client-events";
import { device } from "@/services/device";
import { session } from "@/services/session";
import { localAdapter, setSyncAdapter, type SyncResult } from "@/services/sync";
import { ValidationError } from "@/lib/validation";
import { seedAsAdmin } from "./helpers";

beforeEach(() => {
  localStorage.clear();
  cloud = false;
  sendClientEvents.mockReset();
});
afterEach(() => {
  setSyncAdapter(localAdapter);
  vi.unstubAllGlobals();
});

async function realClub() {
  return api.createClub({
    name: "আসল ক্লাব",
    para: "লেন ১",
    zone: "",
    puja_year: 2026,
    target_amount: 100000,
    creator_name: "সম্পাদক ০১",
    creator_phone: "9000000101",
  });
}

/** Every record gets the same outcome. */
const answer = (outcome: Omit<SyncResult, "id">) =>
  setSyncAdapter({ push: async (recs) => recs.map((r) => ({ id: r.record.id, ...outcome })) });

describe("reporting sync refusals", () => {
  it("queues a refusal once per record and reason, with keys and ids only", async () => {
    const club = await realClub();
    answer({ ok: false, error: "err_forbidden" });
    await api.sync();
    await api.sync();
    expect(queuedClientEvents()).toEqual([
      {
        id: expect.any(String),
        kind: "sync_failed",
        error_key: "err_forbidden",
        entity_type: "club",
        record_id: club.id,
        club_id: club.id,
      },
    ]);
    answer({ ok: false, error: "err_syncDependency" });
    await api.sync();
    expect(queuedClientEvents().map((e) => e.error_key)).toEqual([
      "err_forbidden",
      "err_syncDependency",
    ]);
  });

  it("reports a record again if it fails after going through", async () => {
    await realClub();
    answer({ ok: false, error: "err_forbidden" });
    await api.sync();
    setSyncAdapter(localAdapter);
    await api.sync();
    await api.createMember({ name: "কর্মী ০২", phone: "9000000102", role: "collector" });
    answer({ ok: false, error: "err_forbidden" });
    await api.sync();
    expect(queuedClientEvents().map((e) => e.entity_type)).toEqual(["club", "member"]);
  });

  it("never reports network failures, or a push that couldn't start", async () => {
    await realClub();
    answer({ ok: false, error: "err_syncFailed", network: true });
    await api.sync();
    setSyncAdapter({
      push: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await api.sync();
    expect(queuedClientEvents()).toEqual([]);
    expect(await api.getSyncStatus()).toEqual({ pending: 0, failed: 1 }); // still shown
  });

  it("never reports the sample club", async () => {
    await seedAsAdmin();
    await api.createHousehold({ resident_name: "নতুন", house_flat_no: "9", lane_block: "ব্লক এ" });
    answer({ ok: false, error: "err_forbidden" });
    await api.sync();
    expect(queuedClientEvents()).toEqual([]);
  });
});

describe("sending reports", () => {
  async function queued() {
    await realClub();
    answer({ ok: false, error: "err_forbidden" });
    await api.sync();
    expect(queuedClientEvents()).toHaveLength(1);
    cloud = true;
    session.set({ mode: "user", phone: "9000000101" });
  }

  it("sends them with this device and app version, then clears the queue", async () => {
    await queued();
    sendClientEvents.mockResolvedValue(1);
    const events = queuedClientEvents();
    expect(await flushClientEvents()).toBe(1);
    expect(sendClientEvents).toHaveBeenCalledWith({}, device.id(), "0.11.0", events);
    expect(queuedClientEvents()).toEqual([]);
  });

  it("keeps them for the next sync when sending fails, and never throws", async () => {
    await queued();
    sendClientEvents.mockRejectedValue(new Error("boom"));
    expect(await flushClientEvents()).toBe(0);
    expect(queuedClientEvents()).toHaveLength(1);
  });

  it("waits while offline, in maintenance, or outside a cloud login", async () => {
    await queued();
    vi.stubGlobal("navigator", { onLine: false });
    await flushClientEvents();
    vi.unstubAllGlobals();
    localStorage.setItem(
      "pk_app_config_v1",
      JSON.stringify({ maintenance: true, min_version: "0.0.0", flags: {} }),
    );
    await flushClientEvents();
    localStorage.removeItem("pk_app_config_v1");
    session.set({ mode: "demo" });
    await flushClientEvents();
    expect(sendClientEvents).not.toHaveBeenCalled();
    expect(queuedClientEvents()).toHaveLength(1);
  });
});

describe("network errors", () => {
  it("tells a dropped connection from a refusal", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError({ message: "TypeError: Load failed", code: "" })).toBe(true);
    expect(isNetworkError({ message: "err_forbidden", code: "P0001" })).toBe(false);
    expect(isNetworkError(new ValidationError("permission", "err_forbidden"))).toBe(false);
  });

  it("the cloud adapter marks them so they aren't reported", async () => {
    const client = {
      from: () => ({
        insert: () => Promise.resolve({ error: { message: "TypeError: Failed to fetch" } }),
      }),
    } as unknown as SupabaseClient;
    const adapter = createCloudAdapter(client, { loadVoucher: async () => null });
    const [result] = await adapter.push([
      {
        kind: "household",
        record: {
          id: "h1",
          club_id: "c1",
          lane_block: "লেন ১",
          house_flat_no: "1",
          resident_name: "আবাসিক",
          created_at: "",
        },
      },
    ]);
    expect(result).toMatchObject({ ok: false, network: true });
  });
});
