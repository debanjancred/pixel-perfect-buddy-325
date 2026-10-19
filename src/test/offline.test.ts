import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { shouldRegister } from "@/lib/pwa";
import { api } from "@/services/api";
import { localAdapter, setSyncAdapter, type SyncAdapter } from "@/services/sync";

beforeEach(() => localStorage.clear());
afterEach(() => {
  setSyncAdapter(localAdapter);
  vi.restoreAllMocks();
});

describe("service worker registration (SPEC 5.2)", () => {
  const env = { prod: true, hostname: "pujo-khata.lovable.app", inIframe: false };
  it("runs on a production build served directly", () => {
    expect(shouldRegister(env)).toBe(true);
    expect(shouldRegister({ ...env, hostname: "localhost" })).toBe(true); // vite preview
  });
  it("is disabled in development and in the Lovable preview", () => {
    expect(shouldRegister({ ...env, prod: false })).toBe(false);
    expect(shouldRegister({ ...env, inIframe: true })).toBe(false);
    expect(shouldRegister({ ...env, hostname: "id-preview--abc123.lovable.app" })).toBe(false);
    expect(shouldRegister({ ...env, hostname: "abc123.lovableproject.com" })).toBe(false);
  });
});

describe("web app manifest (SPEC 5.2)", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  it("has the SPEC name and colours and a separate maskable icon", () => {
    expect(manifest.short_name).toBe("পুজো খাতা");
    expect(manifest.theme_color).toBe("#B71C1C");
    expect(manifest.background_color).toBe("#FDFBF7");
    expect(manifest.icons).toContainEqual(
      expect.objectContaining({ src: "/icon-maskable-512.png", purpose: "maskable" }),
    );
    expect(manifest.icons.some((i: { purpose: string }) => i.purpose === "any maskable")).toBe(
      false,
    );
  });
});

describe("sync adapter (SPEC 5.1)", () => {
  /** A real (non-sample) club with three pending chanda entries — the sample club never syncs. */
  async function pendingDemo() {
    await api.createClub({
      name: "সিঙ্ক ক্লাব",
      para: "লেন ১",
      zone: "",
      puja_year: 2026,
      target_amount: 100000,
      creator_name: "সম্পাদক ০১",
      creator_phone: "9000000101",
    });
    const admin = (await api.listMembers())[0]!;
    const hh = await api.createHousehold({
      resident_name: "আবাসিক ০১",
      house_flat_no: "1",
      lane_block: "লেন ১",
    });
    const ids: string[] = [];
    for (const amount of [101, 201, 301]) {
      const c = await api.addTransaction({
        id: crypto.randomUUID(),
        household_id: hh.id,
        amount,
        payment_method: "cash",
        status: "collected",
        collector_id: admin.id,
      });
      ids.push(c.id);
    }
    return ids;
  }

  it("does nothing offline — saving never waits for the network", async () => {
    await pendingDemo();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await api.sync()).toEqual({ synced: 0, failed: 0 });
    expect((await api.getSyncStatus()).pending).toBeGreaterThanOrEqual(3);
  });

  it("marks records the adapter rejects as failed, and a retry clears them", async () => {
    const ids = await pendingDemo();
    const before = (await api.getSyncStatus()).pending;
    const rejectFirst: SyncAdapter = {
      push: async (recs) => recs.map((r) => ({ id: r.record.id, ok: r.record.id !== ids[0] })),
    };
    setSyncAdapter(rejectFirst);
    expect(await api.sync()).toEqual({ synced: before - 1, failed: 1 });
    expect(await api.getSyncStatus()).toEqual({ pending: 0, failed: 1 });
    expect((await api.listChanda()).find((c) => c.id === ids[0])!.sync_status).toBe("failed");

    setSyncAdapter(localAdapter);
    expect(await api.sync()).toEqual({ synced: 1, failed: 0 });
    expect(await api.getSyncStatus()).toEqual({ pending: 0, failed: 0 });
  });

  it("keeps the server's reason for each failed record, and clears it once it syncs", async () => {
    const ids = await pendingDemo();
    setSyncAdapter({
      push: async (recs) =>
        recs.map((r) =>
          r.record.id === ids[0]
            ? { id: r.record.id, ok: false, error: "err_forbidden" as const }
            : { id: r.record.id, ok: true },
        ),
    });
    await api.sync();
    expect(await api.listSyncFailures()).toEqual([
      expect.objectContaining({ id: ids[0], kind: "chanda", amount: 101, error: "err_forbidden" }),
    ]);
    setSyncAdapter(localAdapter);
    await api.sync();
    expect(await api.listSyncFailures()).toEqual([]);
  });

  it("treats an adapter crash (e.g. network error) as every record failed", async () => {
    await pendingDemo();
    setSyncAdapter({ push: () => Promise.reject(new Error("timeout")) });
    const r = await api.sync();
    expect(r.synced).toBe(0);
    expect(r.failed).toBeGreaterThanOrEqual(3);
  });

  it("sends each record with its kind, so a backend adapter can route it", async () => {
    await pendingDemo();
    const seen: string[] = [];
    setSyncAdapter({
      push: async (recs) => {
        recs.forEach((r) => seen.push(r.kind));
        return recs.map((r) => ({ id: r.record.id, ok: true }));
      },
    });
    await api.sync();
    expect(new Set(seen)).toContain("chanda");
  });

  it("runs overlapping syncs one after another, so nothing is sent twice", async () => {
    await pendingDemo();
    const sent: string[] = [];
    setSyncAdapter({
      push: async (recs) => {
        recs.forEach((r) => sent.push(r.record.id));
        await new Promise((done) => setTimeout(done, 300)); // a slow network
        return recs.map((r) => ({ id: r.record.id, ok: true }));
      },
    });
    const [a, b] = await Promise.all([api.sync(), api.sync()]);
    expect(new Set(sent).size).toBe(sent.length);
    expect(a.failed + b.failed).toBe(0);
    expect(b.synced).toBe(0);
    expect(await api.getSyncStatus()).toEqual({ pending: 0, failed: 0 });
  });

  it("keeps entries saved while a push is in flight", async () => {
    const ids = await pendingDemo();
    const admin = (await api.listMembers())[0]!;
    const hh = (await api.listHouseholds())[0]!;
    let later = "";
    setSyncAdapter({
      push: async (recs) => {
        const c = await api.addTransaction({
          id: crypto.randomUUID(),
          household_id: hh.id,
          amount: 501,
          payment_method: "cash",
          status: "collected",
          collector_id: admin.id,
        });
        later = c.id;
        return recs.map((r) => ({ id: r.record.id, ok: true }));
      },
    });
    await api.sync();
    const chanda = await api.listChanda();
    expect(chanda.find((c) => c.id === ids[0])!.sync_status).toBe("synced");
    expect(chanda.find((c) => c.id === later)!.sync_status).toBe("pending");
  });
});
