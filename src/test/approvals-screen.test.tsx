import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (orig) => ({
  ...(await orig<typeof import("@tanstack/react-router")>()),
  Link: ({ children }: { children: ReactNode }) => <a href="#x">{children}</a>,
}));

import {
  ApprovalQueue,
  approvalCounts,
  approvalRows,
  filterApprovals,
  splitApprovals,
  visibleSelection,
} from "@/features/approvals";
import { chandaRows, expenseRows } from "@/features/settings";
import { toReceipt } from "@/features/receipt";
import { VoidDialog } from "@/components/pk/VoidDialog";
import { I18nProvider } from "@/lib/i18n";
import { api } from "@/services/api";
import { session } from "@/services/session";
import type { UserRole } from "@/types/domain";

beforeEach(() => localStorage.clear());

const t = (k: string) => k;
const f = { t } as never;

async function actAs(role: UserRole) {
  const m = (await api.listMembers()).find((x) => x.role === role)!;
  session.set({ mode: "demo", member_id: m.id });
  return m;
}

/** Sample club with two collector chanda, one treasurer expense and a void request. */
async function seedQueue() {
  await api.seedDemo();
  const collector = await actAs("collector");
  const [h1, h2] = await api.listHouseholds();
  const chanda = async (household_id: string, amount: number) =>
    api.createChanda({
      id: crypto.randomUUID(),
      household_id,
      amount,
      payment_method: "cash",
      status: "collected",
      collector_id: collector.id,
    });
  const c1 = await chanda(h1!.id, 501);
  const c2 = await chanda(h2!.id, 1001);
  const treasurer = await actAs("treasurer");
  const e = await api.createExpense({
    id: crypto.randomUUID(),
    category: "bhog",
    title: "Rice",
    amount: 400,
    paid_to: "Shop 01",
    authorized_by_id: treasurer.id,
    date: "2026-10-12",
  });
  // A treasurer asks to void an approved sample entry.
  const old = (await api.listChanda()).find((x) => x.status === "collected" && !x.approval_status)!;
  await api.voidChanda(old.id, "entered twice");
  const admin = await actAs("admin");
  return { c1, c2, e, old, admin, collector, treasurer };
}

const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <I18nProvider>{children}</I18nProvider>
  </QueryClientProvider>
);

describe("approvals model", () => {
  it("lists each waiting item with who and what, void requests apart", async () => {
    const { c1, e, old, collector, treasurer } = await seedQueue();
    const rows = approvalRows(
      await api.listApprovals(),
      { members: await api.listMembers(), households: await api.listHouseholds() },
      f,
    );
    const c1Row = rows.find((r) => r.ref.id === c1.id)!;
    expect(c1Row).toMatchObject({
      action: "entry",
      amount: 501,
      by: collector.name,
      receipt_id: c1.id,
    });
    expect(c1Row.detail).toContain(c1.receipt_no!);
    expect(rows.find((r) => r.ref.id === e.id)).toMatchObject({
      title: "Rice",
      by: treasurer.name,
      edited: false,
    });
    expect(rows.find((r) => r.ref.id === old.id)).toMatchObject({
      action: "void",
      reason: "entered twice",
      by: treasurer.name,
    });

    expect(approvalCounts(rows)).toEqual({ all: 4, chanda: 3, expense: 1, handover: 0 });
    expect(filterApprovals(rows, "expense").map((r) => r.ref.id)).toEqual([e.id]);
    const { voids, entries } = splitApprovals(rows);
    expect(voids.map((r) => r.ref.id)).toEqual([old.id]);
    expect(entries).toHaveLength(3);
  });

  it("bulk approve only sends selected entries still listed", async () => {
    const { c1, c2, old } = await seedQueue();
    const rows = approvalRows(
      await api.listApprovals(),
      { members: await api.listMembers(), households: await api.listHouseholds() },
      f,
    );
    const keys = new Set([`chanda:${c1.id}`, `chanda:${old.id}`, "chanda:gone"]);
    // The void request is not an entry to approve, and "gone" was decided elsewhere.
    expect(visibleSelection(keys, rows).map((r) => r.ref.id)).toEqual([c1.id]);
    expect(visibleSelection(keys, filterApprovals(rows, "expense"))).toEqual([]);
    expect(c2).toBeTruthy();
  });

  it("marks an edited expense, and a rejected receipt as cancelled", async () => {
    const { e, c1, treasurer } = await seedQueue();
    await actAs("treasurer");
    await api.updateExpense(e.id, {
      category: "bhog",
      title: "Rice 2",
      amount: 450,
      paid_to: "Shop 01",
      authorized_by_id: treasurer.id,
      date: "2026-10-12",
    });
    await actAs("admin");
    const rows = approvalRows(
      await api.listApprovals(),
      { members: await api.listMembers(), households: await api.listHouseholds() },
      f,
    );
    expect(rows.find((r) => r.ref.id === e.id)?.edited).toBe(true);

    await api.reviewEntries([{ kind: "chanda", id: c1.id }], "rejected", "wrong house");
    const tx = (await api.listChanda()).find((x) => x.id === c1.id);
    const sources = {
      club: await api.getClub(),
      households: await api.listHouseholds(),
      members: await api.listMembers(),
    };
    expect(toReceipt(tx, sources)).toMatchObject({
      voided: true,
      rejected: true,
      waiting: false,
      void_reason: "wrong house",
    });
  });

  it("the Excel export says what waits and what was rejected", async () => {
    const { c1, c2, e } = await seedQueue();
    await api.reviewEntries([{ kind: "chanda", id: c1.id }], "rejected", "wrong house");
    const members = await api.listMembers();
    const rows = chandaRows(await api.listChanda(), await api.listHouseholds(), members, f);
    const byReceipt = (no: string | null | undefined) => rows.find((r) => r[1] === no)!;
    expect(byReceipt(c1.receipt_no).slice(-2)).toEqual(["approvalRejected", "wrong house"]);
    expect(byReceipt(c2.receipt_no).slice(-2)).toEqual([
      "status_collected (approvalWaiting)",
      "export_na",
    ]);
    const ex = expenseRows(await api.listExpenses(), members, f);
    expect(ex.find((r) => r[2] === e.title)!.slice(-2)).toEqual([
      "status_recorded (approvalWaiting)",
      "export_na",
    ]);
  });
});

describe("approvals screen", () => {
  it("bulk-approves the ticked entries and counts them in the totals", async () => {
    const { c1, c2 } = await seedQueue();
    const before = (await api.getSummary()).total_collected;
    render(<ApprovalQueue kind="chanda" onKind={() => {}} />, { wrapper: wrap });

    const tick = await screen.findAllByRole("checkbox");
    expect(tick).toHaveLength(2);
    fireEvent.click(tick[0]!);
    fireEvent.click(tick[1]!);
    fireEvent.click(screen.getByRole("button", { name: /Approve 2 selected|২টি অনুমোদন/ }));

    await waitFor(async () =>
      expect((await api.getSummary()).total_collected).toBe(before + 501 + 1001),
    );
    const left = await api.listApprovals();
    expect(left.some((x) => x.record.id === c1.id || x.record.id === c2.id)).toBe(false);
  });

  it("rejecting needs a reason; declining a void keeps the entry", async () => {
    const { e, old } = await seedQueue();
    render(<ApprovalQueue kind="all" onKind={() => {}} />, { wrapper: wrap });

    const rice = (await screen.findByText("Rice")).closest("li")!;
    fireEvent.click(within(rice).getByRole("button", { name: /Reject|প্রত্যাখ্যান/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^(Reject|প্রত্যাখ্যান)$/ }));
    expect(await within(dialog).findByText(/at least 3|অন্তত ৩/)).toBeTruthy();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "no bill" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /^(Reject|প্রত্যাখ্যান)$/ }));
    await waitFor(async () =>
      expect((await api.listExpenses()).find((x) => x.id === e.id)?.approval_status).toBe(
        "rejected",
      ),
    );

    const voidRow = (await screen.findByText(/entered twice/)).closest("li")!;
    fireEvent.click(within(voidRow).getByRole("button", { name: /Decline|নাকচ/ }));
    const d2 = await screen.findByRole("dialog");
    fireEvent.change(within(d2).getByRole("textbox"), { target: { value: "it was real" } });
    fireEvent.click(within(d2).getByRole("button", { name: /Decline|নাকচ/ }));
    await waitFor(async () => {
      const tx = (await api.listChanda()).find((x) => x.id === old.id)!;
      expect(tx.void_requested_at).toBeNull();
      expect(tx.voided_at).toBeFalsy();
      expect(tx.void_declined_reason).toBe("it was real");
    });
  });
});

describe("void dialog", () => {
  it("a treasurer sends a request instead of cancelling", async () => {
    await api.seedDemo();
    await actAs("treasurer");
    const tx = (await api.listChanda()).find((x) => x.status === "collected")!;
    render(
      <VoidDialog
        summary="x"
        onClose={() => {}}
        onVoid={(reason) => api.voidChanda(tx.id, reason)}
      />,
      { wrapper: wrap },
    );
    const send = await screen.findByRole("button", { name: /Send request|অনুরোধ পাঠান/ });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "duplicate" } });
    fireEvent.click(send);
    await waitFor(async () => {
      const saved = (await api.listChanda()).find((x) => x.id === tx.id)!;
      expect(saved.void_requested_at).toBeTruthy();
      expect(saved.voided_at).toBeFalsy();
    });
  });
});
