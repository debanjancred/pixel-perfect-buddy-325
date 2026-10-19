import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deviceLabel } from "@/lib/device";
import { ValidationError } from "@/lib/validation";
import { collectGateMessage, orderDevices, type ListedDevice } from "@/features/devices";
import { api } from "@/services/api";
import { setCloudClient } from "@/services/cloud/client";
import { device } from "@/services/device";
import { session } from "@/services/session";

// Cloud mode on, without a real Supabase project: the client is a fake (below).
vi.mock("@/services/cloud/config", () => ({
  cloudConfig: () => ({ url: "https://x.supabase.co", anonKey: "k" }),
  isCloud: () => true,
  otpLength: () => 6,
}));

type Rpc = { fn: string; args: Record<string, unknown> };
function fakeClient(reply: (call: Rpc) => { data?: unknown; error?: { message: string } }) {
  const calls: Rpc[] = [];
  const client = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      const r = reply({ fn, args });
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
    },
    auth: { signOut: () => Promise.resolve({ error: null }) },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

beforeEach(() => localStorage.clear());
afterEach(() => setCloudClient(null));

describe("device labels", () => {
  it.each([
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36",
      "Android · Chrome",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1",
      "iPhone · Safari",
    ],
    [
      "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
      "Android · Samsung Internet",
    ],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0",
      "Mac · Edge",
    ],
    ["", "Browser"],
  ])("names %s", (ua, label) => expect(deviceLabel(ua)).toBe(label));
});

describe("devices view model", () => {
  const d = (id: string, over: Partial<ListedDevice> = {}): ListedDevice => ({
    id,
    label: id,
    is_collect: false,
    this_device: false,
    created_at: "2026-10-01T00:00:00Z",
    last_seen_at: "2026-10-01T00:00:00Z",
    ...over,
  });
  it("lists the collecting device, then this one, then the most recently used", () => {
    const list = [
      d("old"),
      d("recent", { last_seen_at: "2026-10-18T00:00:00Z" }),
      d("here", { this_device: true }),
      d("collect", { is_collect: true }),
    ];
    expect(orderDevices(list).map((x) => x.id)).toEqual(["collect", "here", "recent", "old"]);
  });
  it("says which device collects, or that none is chosen", () => {
    expect(collectGateMessage("Android · Chrome")).toEqual({
      key: "collectGateOther",
      name: "Android · Chrome",
    });
    expect(collectGateMessage(null)).toEqual({ key: "collectGateNone" });
  });
});

describe("device registration and check-in", () => {
  it("registers at login and remembers whether this device collects", async () => {
    const { client, calls } = fakeClient(() => ({
      data: { status: "active", is_collect: false, collect_label: "Android · Chrome" },
    }));
    setCloudClient(client);
    await expect(api.registerDevice()).resolves.toEqual({
      is_collect: false,
      collect_label: "Android · Chrome",
    });
    expect(calls[0]).toMatchObject({
      fn: "touch_device",
      args: { p_device: device.id(), p_login: true },
    });
  });

  it("turns the server's device limit into err_deviceLimit", async () => {
    setCloudClient(fakeClient(() => ({ error: { message: "err_deviceLimit" } })).client);
    await expect(api.registerDevice()).rejects.toMatchObject({ key: "err_deviceLimit" });
  });

  it("learns on check-in that it was removed elsewhere, and logging out frees its slot", async () => {
    const { client, calls } = fakeClient(({ fn }) =>
      fn === "touch_device" ? { data: { status: "removed" } } : {},
    );
    setCloudClient(client);
    session.set({ mode: "user", phone: "9000000001" });
    expect(await api.checkDevice()).toBe("removed");
    await api.signOut();
    expect(session.get()).toBeNull();
    expect(calls.map((c) => c.fn)).toEqual(["touch_device", "remove_device"]);
  });
});

describe("collecting on one device (cloud mode)", () => {
  async function realClub() {
    await api.createClub({
      name: "ডিভাইস ক্লাব",
      para: "লেন ১",
      zone: "",
      puja_year: 2026,
      target_amount: 100000,
      creator_name: "সম্পাদক ০১",
      creator_phone: "9000000101",
    });
    const me = (await api.listMembers())[0]!;
    const hh = await api.createHousehold({
      resident_name: "আবাসিক ০১",
      house_flat_no: "1",
      lane_block: "লেন ১",
    });
    return (amount = 101) =>
      api.addTransaction({
        id: crypto.randomUUID(),
        household_id: hh.id,
        amount,
        payment_method: "cash",
        status: "collected",
        collector_id: me.id,
      });
  }

  it("refuses chanda on a device the server says doesn't collect, even offline", async () => {
    const pay = await realClub();
    device.setState({ is_collect: false, collect_label: "Android · Chrome" });
    const err = await pay().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err).toMatchObject({ key: "err_notCollectDevice" });
    expect(await api.getCollectStanding()).toEqual({
      applies: true,
      is_collect: false,
      collect_label: "Android · Chrome",
    });
  });

  it("records chanda on the collect device with its device id", async () => {
    const pay = await realClub();
    device.setState({ is_collect: true, collect_label: "Mac · Chrome" });
    await expect(pay()).resolves.toMatchObject({ device_id: device.id() });
  });

  it("leaves the sample club alone", async () => {
    await api.seedDemo();
    device.setState({ is_collect: false, collect_label: null });
    expect((await api.getCollectStanding()).applies).toBe(false);
  });
});
