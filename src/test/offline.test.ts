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
  async function pendingDemo() {
    await api.seedDemo();
    // Fixtures arrive synced; make a few records pending, as fresh local saves would be.
    const db = JSON.parse(localStorage.getItem("pk_db_v2")!);
    db.chanda.slice(0, 3).forEach((c: { sync_status: string }) => (c.sync_status = "pending"));
    localStorage.setItem("pk_db_v2", JSON.stringify(db));
    return db.chanda.slice(0, 3).map((c: { id: string }) => c.id) as string[];
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
});
