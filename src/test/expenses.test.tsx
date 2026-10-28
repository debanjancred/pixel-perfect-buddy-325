import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  defaultApprover,
  expenseFields,
  expenseTotals,
  filterExpenses,
  sortExpenses,
} from "@/features/expenses";
import { useAddExpense } from "@/hooks/use-data";
import { isoDate } from "@/lib/format";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { ValidationError } from "@/lib/validation";
import { api } from "@/services/api";
import type { ClubMember, ExpenseRecord } from "@/types/domain";
import { seedAsAdmin } from "./helpers";

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const expense = (over: Partial<ExpenseRecord>): ExpenseRecord => ({
  id: crypto.randomUUID(),
  club_id: "c",
  category: "pandal",
  title: "x",
  amount: 100,
  paid_to: "y",
  authorized_by_id: "t1",
  date: "2026-10-10",
  created_at: "2026-10-10T10:00:00.000Z",
  updated_at: "2026-10-10T10:00:00.000Z",
  sync_status: "synced",
  ...over,
});

const member = (id: string, role: ClubMember["role"]): ClubMember => ({
  id,
  club_id: "c",
  name: id,
  role,
  phone: "9000000000",
  collector_code: "X01",
  created_at: "2026-01-01T00:00:00.000Z",
});

describe("expense ledger model", () => {
  const rows = [
    expense({ category: "pandal", amount: 5000 }),
    expense({ category: "pandal", amount: 1000, voided_at: "2026-10-11T00:00:00.000Z" }),
    expense({ category: "bhog", amount: 2500 }),
  ];

  it("totals per category exclude voided expenses and keep display order", () => {
    const t = expenseTotals(rows);
    expect(t.total).toBe(7500);
    expect(t.count).toBe(2);
    expect(t.byCategory.map((c) => c.key)).toEqual([
      "pandal",
      "idol",
      "lighting",
      "bhog",
      "cultural",
      "misc",
    ]);
    expect(t.byCategory[0]).toEqual({ key: "pandal", total: 5000, count: 1 });
    expect(t.byCategory[3]).toEqual({ key: "bhog", total: 2500, count: 1 });
  });

  it("filters by category but keeps voided rows visible", () => {
    expect(filterExpenses(rows, "all")).toHaveLength(3);
    expect(filterExpenses(rows, "pandal")).toHaveLength(2);
    expect(filterExpenses(rows, "idol")).toHaveLength(0);
  });

  it("sorts by expense date, then by when it was recorded", () => {
    const a = expense({ date: "2026-10-01", created_at: "2026-10-05T00:00:00Z" });
    const b = expense({ date: "2026-10-03", created_at: "2026-10-03T00:00:00Z" });
    const c = expense({ date: "2026-10-03", created_at: "2026-10-04T00:00:00Z" });
    expect(sortExpenses([a, b, c]).map((e) => e.id)).toEqual([c.id, b.id, a.id]);
  });

  it("defaults the approver to the current member only when they may authorise", () => {
    const admin = member("a1", "admin");
    const treasurer = member("t1", "treasurer");
    const collector = member("c1", "collector");
    const all = [admin, treasurer, collector];
    expect(defaultApprover(all, admin)).toBe(admin);
    expect(defaultApprover(all, collector)).toBe(treasurer);
    expect(defaultApprover(all, undefined)).toBe(treasurer);
    expect(defaultApprover([admin, collector], collector)).toBe(admin);
    expect(defaultApprover([collector], collector)).toBeUndefined();
  });

  it("describes an expense with localised labels and the expense's own date", () => {
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    act(() => result.current.setLang("en"));
    const fields = expenseFields(
      expense({ category: "bhog", paid_to: "Vendor 01", date: "2026-10-03" }),
      [member("t1", "treasurer")],
      result.current,
    );
    expect(Object.fromEntries(fields.map((f) => [f.key, f.value]))).toMatchObject({
      category: "🍛 Bhog",
      paidTo: "Vendor 01",
      date: "3 October 2026",
      approvedBy: "t1",
    });
  });
});

describe("expense validation and voucher store", () => {
  async function seeded() {
    await seedAsAdmin();
    const treasurer = (await api.listMembers()).find((m) => m.role === "treasurer")!;
    return {
      id: crypto.randomUUID(),
      category: "misc" as const,
      title: "Test",
      amount: 500,
      paid_to: "Vendor 01",
      authorized_by_id: treasurer.id,
      date: isoDate(),
    };
  }

  it("accepts today and rejects a future date", async () => {
    const input = await seeded();
    await expect(api.addExpense(input)).resolves.toMatchObject({ date: input.date });
    const tomorrow = isoDate(new Date(Date.now() + 86_400_000));
    const err = await api
      .addExpense({ ...input, id: crypto.randomUUID(), date: tomorrow })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).key).toBe("err_dateFuture");
  });

  it("refuses non-images and oversized blobs before touching IndexedDB", async () => {
    const keyOf = (p: Promise<unknown>) =>
      p.then(
        () => null,
        (e: ValidationError) => e.key,
      );
    expect(await keyOf(api.saveVoucherImage(new Blob(["x"], { type: "text/plain" })))).toBe(
      "err_photoType",
    );
    const huge = new Blob([new Uint8Array(1_500_001)], { type: "image/jpeg" });
    expect(await keyOf(api.saveVoucherImage(huge))).toBe("err_photoTooLarge");
  });
});

describe("useAddExpense photo cleanup", () => {
  function setup() {
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    vi.spyOn(api, "saveVoucherImage").mockResolvedValue("new-photo");
    const del = vi.spyOn(api, "deleteVoucherImage").mockResolvedValue();
    vi.spyOn(api, "sync").mockResolvedValue({ synced: 0, failed: 0 });
    const { result } = renderHook(() => useAddExpense(), { wrapper });
    const input = {
      id: "e1",
      category: "misc" as const,
      title: "t",
      amount: 1,
      paid_to: "p",
      authorized_by_id: "a",
      date: "2026-10-01",
      voucher: new Blob(["img"], { type: "image/jpeg" }),
    };
    return { result, del, input };
  }

  it("deletes the saved photo when the expense is rejected", async () => {
    const { result, del, input } = setup();
    vi.spyOn(api, "addExpense").mockRejectedValue(
      new ValidationError("authorized_by_id", "err_authorizer"),
    );
    await act(() => result.current.mutateAsync(input).catch(() => {}));
    expect(del).toHaveBeenCalledWith("new-photo");
  });

  it("deletes the new photo when a retry returns the expense saved earlier", async () => {
    const { result, del, input } = setup();
    vi.spyOn(api, "addExpense").mockResolvedValue(expense({ voucher_image_id: "first-photo" }));
    await act(() => result.current.mutateAsync(input));
    expect(del).toHaveBeenCalledWith("new-photo");
  });

  it("keeps the photo when the expense points at it", async () => {
    const { result, del, input } = setup();
    vi.spyOn(api, "addExpense").mockResolvedValue(expense({ voucher_image_id: "new-photo" }));
    await act(() => result.current.mutateAsync(input));
    expect(del).not.toHaveBeenCalled();
  });
});
