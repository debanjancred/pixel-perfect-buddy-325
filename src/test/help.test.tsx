import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A released app; cloud mode switched per test, the server under test control.
vi.mock("@/lib/version", () => ({ APP_VERSION: "0.11.0" }));
let cloud = false;
vi.mock("@/services/cloud/config", () => ({ isCloud: () => cloud, otpLength: () => 6 }));
vi.mock("@/services/cloud/client", () => ({ getCloudClient: () => ({}) }));
const fetchMyTickets = vi.fn();
vi.mock("@/services/cloud/help", () => ({
  fetchMyTickets: (...args: unknown[]) => fetchMyTickets(...args),
}));
vi.mock("@/services/cloud/client-events", () => ({ sendClientEvents: async () => 0 }));
const sheet = { open: vi.fn(), close: vi.fn() };
vi.mock("@/hooks/use-search-modal", () => ({ useSearchModal: () => sheet }));

import { HelpSection, helpStatus } from "@/features/help";
import { I18nProvider } from "@/lib/i18n";
import { ValidationError } from "@/lib/validation";
import { api } from "@/services/api";
import { device } from "@/services/device";
import { session } from "@/services/session";
import { localAdapter, setSyncAdapter, type SyncRecord } from "@/services/sync";
import { seedAsAdmin } from "./helpers";

beforeEach(() => {
  localStorage.clear();
  cloud = false;
  fetchMyTickets.mockReset();
  fetchMyTickets.mockResolvedValue([]);
});
afterEach(() => {
  setSyncAdapter(localAdapter);
  vi.unstubAllGlobals();
});

/** A real (non-sample) club, signed in by phone in cloud mode. */
async function cloudMember() {
  const club = await api.createClub({
    name: "আসল ক্লাব",
    para: "লেন ১",
    zone: "",
    puja_year: 2026,
    target_amount: 100000,
    creator_name: "সম্পাদক ০১",
    creator_phone: "9000000101",
  });
  cloud = true;
  session.set({ mode: "user", phone: "9000000101" });
  return club;
}

const request = (over: Partial<Parameters<typeof api.submitHelpRequest>[0]> = {}) => ({
  id: crypto.randomUUID(),
  category: "sync" as const,
  message: "এন্ট্রি অন্য ফোনে যাচ্ছে না",
  include_diagnostics: true,
  ...over,
});

describe("help status", () => {
  it("shows waiting / not sent until the server has it, then the server's status", () => {
    expect(helpStatus({ sync_status: "pending", status: "open" })).toBe("pending");
    expect(helpStatus({ sync_status: "failed", status: "open" })).toBe("failed");
    expect(helpStatus({ sync_status: "synced", status: "open" })).toBe("open");
    expect(helpStatus({ sync_status: "synced", status: "closed" })).toBe("closed");
  });
});

describe("sending help requests", () => {
  it("needs a phone login in cloud mode, outside the sample club", async () => {
    await seedAsAdmin();
    expect(api.helpAvailable()).toBe(false);
    await expect(api.submitHelpRequest(request())).rejects.toBeInstanceOf(ValidationError);
    cloud = true;
    expect(api.helpAvailable()).toBe(false); // still the sample club, demo session
  });

  it("saves on the phone with device details (counts only), once per id", async () => {
    const club = await cloudMember();
    const input = request();
    const t = await api.submitHelpRequest(input);
    expect(t).toMatchObject({
      club_id: club.id,
      category: "sync",
      status: "open",
      sync_status: "pending",
      diagnostics: { app_version: "0.11.0", online: true, device_id: device.id() },
    });
    // The unsent club and member, plus this request.
    expect(t.diagnostics?.pending).toBeGreaterThan(0);
    expect(await api.submitHelpRequest(input)).toEqual(t);
    expect(await api.listHelpRequests()).toHaveLength(1);
  });

  it("leaves device details out when switched off, and validates the message", async () => {
    await cloudMember();
    expect((await api.submitHelpRequest(request({ include_diagnostics: false }))).diagnostics).toBe(
      null,
    );
    await expect(api.submitHelpRequest(request({ message: " ছোট " }))).rejects.toMatchObject({
      key: "err_ticketMessage",
    });
  });

  it("is sent with the next sync, after the club, and counted while waiting", async () => {
    await cloudMember();
    const t = await api.submitHelpRequest(request());
    const sent: SyncRecord[] = [];
    setSyncAdapter({
      push: async (recs) => {
        sent.push(...recs);
        return recs.map((r) => ({ id: r.record.id, ok: true }));
      },
    });
    await api.sync();
    expect(sent.map((s) => s.kind)).toEqual(["club", "ticket"]);
    expect((await api.listHelpRequests())[0]).toMatchObject({ id: t.id, sync_status: "synced" });
    expect(await api.getSyncStatus()).toEqual({ pending: 0, failed: 0 });
  });

  it("shows a refused request in the sync failures, with its message", async () => {
    await cloudMember();
    await api.submitHelpRequest(request());
    setSyncAdapter({
      push: async (recs) =>
        recs.map((r) => ({
          id: r.record.id,
          ok: r.kind !== "ticket",
          ...(r.kind === "ticket" && { error: "err_ticketLimit" as const }),
        })),
    });
    await api.sync();
    expect(await api.listSyncFailures()).toEqual([
      expect.objectContaining({ kind: "ticket", error: "err_ticketLimit" }),
    ]);
  });

  it("takes the server's status and staff note when online", async () => {
    await cloudMember();
    const t = await api.submitHelpRequest(request());
    fetchMyTickets.mockResolvedValue([
      { ...t, status: "closed", staff_note: "ঠিক হয়ে গেছে", closed_at: "2026-10-28T10:00:00Z" },
    ]);
    expect((await api.listHelpRequests())[0]).toMatchObject({
      status: "closed",
      staff_note: "ঠিক হয়ে গেছে",
      sync_status: "synced",
    });
    vi.stubGlobal("navigator", { onLine: false });
    fetchMyTickets.mockRejectedValue(new Error("offline"));
    expect((await api.listHelpRequests())[0]?.status).toBe("closed"); // kept on the phone
  });
});

describe("Settings → Help", () => {
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>{children}</I18nProvider>
    </QueryClientProvider>
  );

  it("asks to log in by phone where requests can't be sent", async () => {
    await seedAsAdmin();
    render(<HelpSection />, { wrapper: wrap });
    expect(await screen.findByText(/ফোন নম্বর দিয়ে লগইন করুন/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /সমস্যা জানান/ })).not.toBeInTheDocument();
  });

  it("lists the member's requests with their status and the reply", async () => {
    const club = await cloudMember();
    fetchMyTickets.mockResolvedValue([
      {
        id: "t1",
        club_id: club.id,
        category: "device",
        message: "ফোন হারিয়ে গেছে, নতুন ফোনে চাঁদা নিতে পারছি না",
        diagnostics: null,
        status: "closed",
        staff_note: "নতুন ফোন চালু করা হয়েছে",
        created_at: "2026-10-27T10:00:00Z",
        closed_at: "2026-10-28T10:00:00Z",
      },
    ]);
    render(<HelpSection />, { wrapper: wrap });
    expect(await screen.findByText("হারানো বা নতুন ফোন")).toBeInTheDocument();
    expect(screen.getByText("সমাধান হয়েছে")).toBeInTheDocument();
    expect(screen.getByText(/নতুন ফোন চালু করা হয়েছে/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /সমস্যা জানান/ }));
    expect(sheet.open).toHaveBeenCalled();
  });

  it("checks the form, then sends and closes the sheet", async () => {
    await cloudMember();
    setSyncAdapter({ push: async (recs) => recs.map((r) => ({ id: r.record.id, ok: true })) });
    sheet.close.mockClear();
    render(<HelpSection open />, { wrapper: wrap });
    const send = await screen.findByRole("button", { name: "পাঠান" });
    fireEvent.click(send);
    expect(await screen.findByText("সমস্যার ধরন বেছে নিন")).toBeInTheDocument();
    expect(screen.getByText("অন্তত ১০ অক্ষরে সমস্যাটি লিখুন")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "সিঙ্ক" }));
    fireEvent.change(screen.getByLabelText("কী হয়েছে লিখুন"), {
      target: { value: "সিঙ্ক হচ্ছে না, লাল দাগ দেখাচ্ছে" },
    });
    expect(screen.getByRole("switch", { name: "ফোনের তথ্য যোগ করুন" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(send);
    await waitFor(() => expect(sheet.close).toHaveBeenCalled());
    expect(await api.listHelpRequests()).toEqual([
      expect.objectContaining({ category: "sync", sync_status: "synced" }),
    ]);
  });
});
