import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createRouter } from "@tanstack/react-router";
import { beforeEach, describe, expect, it } from "vitest";

import { accountsShareText, cashPct, categoryShares } from "@/features/accounts";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { computeSummary } from "@/lib/accounts";
import { routeTree } from "@/routeTree.gen";
import { api } from "@/services/api";
import type { AccountsSummary, ExpenseRecord } from "@/types/domain";

beforeEach(() => localStorage.clear());

const exp = (category: ExpenseRecord["category"], amount: number, voided = false) =>
  ({
    id: crypto.randomUUID(),
    category,
    amount,
    ...(voided ? { voided_at: "2026-10-01T00:00:00Z" } : {}),
  }) as ExpenseRecord;

describe("categoryShares", () => {
  it("sorts largest first, skips void and empty categories, and sums to exactly 100%", () => {
    const shares = categoryShares([
      exp("idol", 1),
      exp("pandal", 1),
      exp("bhog", 1),
      exp("misc", 50, true),
    ]);
    expect(shares.map((s) => s.category).sort()).toEqual(["bhog", "idol", "pandal"]);
    expect(shares.reduce((s, x) => s + x.pct, 0)).toBe(100); // 33.3 × 3 → 34/33/33
    const big = categoryShares([exp("pandal", 700), exp("idol", 300)]);
    expect(big.map((s) => [s.category, s.pct])).toEqual([
      ["pandal", 70],
      ["idol", 30],
    ]);
    expect(categoryShares([])).toEqual([]);
  });
});

describe("cashPct and share text", () => {
  const s = {
    total_collected: 4000,
    collected_cash: 3000,
    collected_upi: 1000,
    total_promised: 501,
    total_expenses: 5000,
    net_balance: -1000,
    collection_target: 10000,
    progress_pct: 40,
    pending_sync_count: 0,
  } satisfies AccountsSummary;

  it("splits cash vs UPI and handles nothing collected", () => {
    expect(cashPct(s)).toBe(75);
    expect(cashPct({ ...s, total_collected: 0, collected_cash: 0 })).toBe(0);
  });

  it("summarises the accounts without a link, negative balance included", async () => {
    await api.seedDemo();
    const club = (await api.getClub())!;
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    act(() => result.current.setLang("en"));
    const text = accountsShareText(club, s, result.current);
    expect(text).toContain("Sample Puja Committee 2026");
    expect(text).toContain("Collected: *₹4,000*");
    expect(text).toContain("Net balance: *−₹1,000*");
    expect(text).toContain("Promised: ₹501");
    expect(text).toContain("(40%)");
    expect(text).not.toMatch(/https?:\/\//);
  });
});

describe("api.getClubAccounts", () => {
  it("reads any club by slug without switching the active club", async () => {
    await api.seedDemo();
    const demo = (await api.getClub())!;
    const other = await api.createClub({
      name: "অন্য ক্লাব",
      para: "",
      zone: "",
      puja_year: 2026,
      target_amount: 100000,
      creator_name: "সম্পাদক ০১",
      creator_phone: "9000000101",
    });
    expect((await api.getClub())!.id).toBe(other.id);

    const acc = (await api.getClubAccounts(demo.slug))!;
    expect(acc.club.id).toBe(demo.id);
    expect(acc.summary).toEqual(computeSummary(demo, await chandaOf(demo.id), acc.expenses));
    expect(acc.expenses).toHaveLength(4);
    expect((await api.getClub())!.id).toBe(other.id); // still the active club
    expect(await api.getClubAccounts("no-such-club")).toBeNull();
  });
});

async function chandaOf(clubId: string) {
  const db = JSON.parse(localStorage.getItem("pk_db_v2")!);
  return db.chanda.filter((c: { club_id: string }) => c.club_id === clubId);
}

describe("accounts routes", () => {
  const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
  it("serves the SPEC path and keeps /audit as an alias", () => {
    expect(router.matchRoutes("/club/sample-puja-committee-2026/accounts").at(-1)?.routeId).toBe(
      "/club/$slug/accounts",
    );
    expect(router.matchRoutes("/audit").at(-1)?.routeId).toBe("/audit");
  });
});
