import type { SupabaseClient } from "@supabase/supabase-js";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { sharesFromTotals } from "@/features/accounts";
import { expenseLocked, expenseTotals, filterExpenses, searchExpenses } from "@/features/expenses";
import { LoadMore } from "@/components/pk/LoadMore";
import { usePaged } from "@/hooks/use-paged";
import {
  CUSTOM_COLOR,
  categoryFields,
  categoryKeyOf,
  customCategoryKeys,
  customKeyFor,
} from "@/lib/categories";
import { I18nProvider } from "@/lib/i18n";
import { ValidationError } from "@/lib/validation";
import { api } from "@/services/api";
import { createCloudAdapter } from "@/services/cloud/adapter";
import { session } from "@/services/session";
import type { CashHandover, ExpenseRecord } from "@/types/domain";
import { seedAsAdmin } from "./helpers";

beforeEach(() => localStorage.clear());

const expense = (over: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: crypto.randomUUID(),
  club_id: "c",
  category: "pandal",
  title: "Bamboo",
  amount: 100,
  paid_to: "Vendor 01",
  authorized_by_id: "t1",
  date: "2026-10-12",
  created_at: "2026-10-12T10:00:00Z",
  updated_at: "2026-10-12T10:00:00Z",
  sync_status: "synced",
  ...over,
});
const handover = (over: Partial<CashHandover> = {}): CashHandover => ({
  id: crypto.randomUUID(),
  club_id: "c",
  collector_id: "c1",
  received_by_id: "t1",
  amount: 100,
  created_at: "2026-10-13T10:00:00Z",
  sync_status: "synced",
  ...over,
});

describe("own categories", () => {
  it("are misc plus a name, keyed by the name, case-insensitively unique", () => {
    expect(categoryKeyOf(expense())).toBe("pandal");
    expect(categoryKeyOf(expense({ category: "misc", category_name: "  Sound   system " }))).toBe(
      "custom:Sound system",
    );
    const list = [
      expense({ category: "misc", category_name: "Sound" }),
      expense({ category: "misc", category_name: "sound" }),
      expense({ category: "misc", category_name: "Security" }),
    ];
    expect(customCategoryKeys(list)).toEqual(["custom:Security", "custom:Sound"]);
    expect(customKeyFor(" SOUND ", customCategoryKeys(list))).toBe("custom:Sound");
    expect(categoryFields("custom:Sound")).toEqual({ category: "misc", category_name: "Sound" });
    expect(categoryFields("bhog")).toEqual({ category: "bhog", category_name: null });
  });

  it("get their own totals, filter and chart slice", () => {
    const list = [
      expense({ amount: 500 }),
      expense({ category: "misc", category_name: "Sound", amount: 300 }),
      expense({ category: "misc", category_name: "Sound", amount: 50, voided_at: "x" }),
      expense({ category: "misc", amount: 20 }),
    ];
    const t = expenseTotals(list);
    expect(t.byCategory.at(-1)).toEqual({ key: "custom:Sound", total: 300, count: 1 });
    expect(t.byCategory.find((c) => c.key === "misc")?.total).toBe(20);
    expect(filterExpenses(list, "custom:Sound")).toHaveLength(2);
    expect(sharesFromTotals(t.byCategory).find((s) => s.key === "custom:Sound")?.color).toBe(
      CUSTOM_COLOR,
    );
  });
});

describe("searching expenses", () => {
  const list = [
    expense({ title: "Bamboo poles", paid_to: "Decorator 01", date: "2026-10-12" }),
    expense({ title: "Flowers", paid_to: "Market stall", date: "2026-10-20" }),
  ];
  const shown = (iso: string) => (iso === "2026-10-12" ? "১২ অক্টোবর ২০২৬" : "২০ অক্টোবর ২০২৬");

  it("matches item name, payee, the stored date and the shown date", () => {
    expect(searchExpenses(list, "bamboo", shown)).toHaveLength(1);
    expect(searchExpenses(list, "market", shown)[0]?.title).toBe("Flowers");
    expect(searchExpenses(list, "2026-10-20", shown)[0]?.title).toBe("Flowers");
    expect(searchExpenses(list, "১২ অক্টো", shown)[0]?.title).toBe("Bamboo poles");
    expect(searchExpenses(list, "12 অক্টো", shown)[0]?.title).toBe("Bamboo poles");
    expect(searchExpenses(list, "  ", shown)).toHaveLength(2);
    expect(searchExpenses(list, "nothing", shown)).toHaveLength(0);
  });
});

describe("the edit lock", () => {
  it("locks after a handover involving the recorder, not before or for others", () => {
    const e = expense({ recorded_by_id: "t1" });
    expect(expenseLocked(e, [])).toBe(false);
    expect(expenseLocked(e, [handover({ created_at: "2026-10-11T00:00:00Z" })])).toBe(false);
    expect(expenseLocked(e, [handover({ collector_id: "c1", received_by_id: "a1" })])).toBe(false);
    expect(expenseLocked(e, [handover({ voided_at: "x" })])).toBe(false);
    expect(expenseLocked(e, [handover()])).toBe(true);
    expect(expenseLocked(e, [handover({ collector_id: "t1", received_by_id: "a1" })])).toBe(true);
    expect(expenseLocked(expense({ voided_at: "x" }), [])).toBe(true);
  });

  it("uses the authoriser for older expenses without a recorder", () => {
    expect(expenseLocked(expense({ authorized_by_id: "t1" }), [handover()])).toBe(true);
  });
});

describe("editing through the api", () => {
  async function setup() {
    const admin = await seedAsAdmin();
    const saved = await api.addExpense({
      id: crypto.randomUUID(),
      category: "pandal",
      category_name: "Sound",
      title: "Mic hire",
      amount: 800,
      paid_to: "Vendor 02",
      authorized_by_id: admin.id,
      date: "2026-10-12",
    });
    return { admin, saved };
  }
  const edit = (admin: { id: string }, over = {}) => ({
    category: "bhog" as const,
    category_name: null,
    title: "Mic and speaker hire",
    amount: 850,
    paid_to: "Vendor 02",
    authorized_by_id: admin.id,
    date: "2026-10-12",
    ...over,
  });

  it("saves an own category as misc and records who wrote it", async () => {
    const { admin, saved } = await setup();
    expect(saved).toMatchObject({
      category: "misc",
      category_name: "Sound",
      recorded_by_id: admin.id,
    });
  });

  it("corrects an expense, marks it edited and pending", async () => {
    const { admin, saved } = await setup();
    const e = await api.updateExpense(saved.id, edit(admin));
    expect(e).toMatchObject({
      category: "bhog",
      category_name: null,
      amount: 850,
      edited_by_id: admin.id,
      sync_status: "pending",
    });
    expect(e.edited_at).toBeTruthy();
  });

  it("refuses once a handover involving the recorder happened", async () => {
    const { admin, saved } = await setup();
    const collector = (await api.listMembers()).find((m) => m.role === "collector")!;
    await api.createHandover({ id: crypto.randomUUID(), collector_id: collector.id, amount: 1 });
    await expect(api.updateExpense(saved.id, edit(admin))).rejects.toMatchObject({
      key: "err_expenseLocked",
    });
  });

  it("refuses collectors", async () => {
    const { admin, saved } = await setup();
    const collector = (await api.listMembers()).find((m) => m.role === "collector")!;
    session.set({ mode: "demo", member_id: collector.id });
    await expect(api.updateExpense(saved.id, edit(admin))).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("syncing an edit", () => {
  it("sends the correction as a separate update after the insert", async () => {
    const calls: { op: string; args: unknown }[] = [];
    const client = {
      from: () => ({
        insert: (args: unknown) => {
          calls.push({ op: "insert", args });
          return Promise.resolve({ error: { code: "23505", message: "expense_records_pkey" } });
        },
        update: (args: unknown) => ({
          eq: (_c: string, id: string) => ({
            select: () => {
              calls.push({ op: "update", args });
              return Promise.resolve({ data: [{ id }], error: null });
            },
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    const adapter = createCloudAdapter(client, { loadVoucher: async () => null });
    const [r] = await adapter.push([
      {
        kind: "expense",
        record: expense({ edited_at: "2026-10-13T00:00:00Z", amount: 900, category_name: null }),
      },
    ]);
    expect(r?.ok).toBe(true);
    expect(calls.map((c) => c.op)).toEqual(["insert", "update"]);
    expect(calls[1]?.args).toMatchObject({ amount: 900, edited_at: "2026-10-13T00:00:00Z" });
  });
});

describe("Load more", () => {
  function List({ items }: { items: number[] }) {
    const page = usePaged(items, "same");
    return (
      <>
        <ul>
          {page.rows.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
        <LoadMore shown={page.shown} total={page.total} onMore={page.more} />
      </>
    );
  }

  it("shows 10 at a time and disappears when everything is shown", () => {
    render(<List items={Array.from({ length: 23 }, (_, i) => i)} />, { wrapper: I18nProvider });
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: /আরও দেখুন/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    fireEvent.click(screen.getByRole("button", { name: /আরও দেখুন/ }));
    expect(screen.getAllByRole("listitem")).toHaveLength(23);
    expect(screen.queryByRole("button", { name: /আরও দেখুন/ })).not.toBeInTheDocument();
  });
});
