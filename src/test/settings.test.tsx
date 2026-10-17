import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { chandaCsv, expensesCsv, exportFileName, membersByRole } from "@/features/settings";
import { csvCell, toCsv } from "@/lib/csv";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { ValidationError } from "@/lib/validation";
import { api } from "@/services/api";
import type { ClubMember } from "@/types/domain";
import { seedAsAdmin } from "./helpers";

beforeEach(() => localStorage.clear());

const keyOf = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ValidationError) => e.key,
  );

describe("csv", () => {
  it("quotes text, writes numbers bare and neutralises formulas", () => {
    expect(csvCell("আবাসিক ০১")).toBe('"আবাসিক ০১"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(1001)).toBe("1001");
    expect(csvCell(undefined)).toBe("");
    for (const evil of ["=HYPERLINK(1)", "+1", "-2+3", "@SUM(A1)"])
      expect(csvCell(evil)).toBe(`"'${evil}"`);
  });

  it("starts with a BOM and uses CRLF rows", () => {
    expect(
      toCsv([
        ["a", 1],
        ["b", 2],
      ]),
    ).toBe('﻿"a",1\r\n"b",2');
  });
});

describe("ledger exports", () => {
  async function demo() {
    await seedAsAdmin();
    const [chanda, households, members, expenses] = await Promise.all([
      api.listChanda(),
      api.listHouseholds(),
      api.listMembers(),
      api.listExpenses(),
    ]);
    const { result } = renderHook(() => useI18n(), { wrapper: I18nProvider });
    return { chanda, households, members, expenses, f: result };
  }

  it("localises headers and labels, keeps amounts numeric, marks void rows", async () => {
    const { chanda, households, members, f } = await demo();
    const rows = chandaCsv(chanda, households, members, f.current);
    expect(rows[0]![0]).toBe("রসিদ নং");
    expect(rows).toHaveLength(chanda.length + 1);
    expect(rows.slice(1).every((r) => typeof r[5] === "number")).toBe(true);
    const voided = chanda.find((c) => c.voided_at)!;
    const vRow = rows.find((r) => r[0] === voided.receipt_no)!;
    expect(vRow[7]).toBe("বাতিল");
    expect(vRow[9]).toBe(voided.void_reason);

    act(() => f.current.setLang("en"));
    const en = chandaCsv(chanda, households, members, f.current);
    expect(en[0]).toContain("Receipt no.");
    expect(en.slice(1).map((r) => r[6])).toContain("Cash");
  });

  it("exports expenses by date with localised categories", async () => {
    const { expenses, members, f } = await demo();
    act(() => f.current.setLang("en"));
    const rows = expensesCsv(expenses, members, f.current);
    expect(rows[0]).toEqual([
      "Date",
      "Category",
      "Item",
      "Amount (₹)",
      "Paid to",
      "Authorised by",
      "Status",
      "Void reason",
    ]);
    const dates = rows.slice(1).map((r) => r[0] as string);
    expect(dates).toEqual([...dates].sort());
    expect(rows.slice(1).map((r) => r[1])).toContain("Pandal");
  });

  it("names files by kind, club and date", () => {
    expect(exportFileName("chanda", "sample", "2026-10-17")).toBe(
      "pujo-khata-chanda-sample-2026-10-17.csv",
    );
  });
});

describe("members", () => {
  it("groups by role in admin → treasurer → collector order, empty groups kept", () => {
    const m = (name: string, role: ClubMember["role"]) => ({ name, role }) as ClubMember;
    const groups = membersByRole([m("খ", "collector"), m("ক", "collector"), m("অ", "admin")]);
    expect(groups.map((g) => [g.role, g.members.map((x) => x.name)])).toEqual([
      ["admin", ["অ"]],
      ["treasurer", []],
      ["collector", ["ক", "খ"]],
    ]);
  });

  it("refuses a duplicate phone in the same club", async () => {
    await seedAsAdmin();
    const [first] = await api.listMembers();
    expect(
      await keyOf(api.createMember({ name: "নতুন", phone: first!.phone, role: "collector" })),
    ).toBe("err_memberExists");
  });

  it("never demotes the last admin, but allows it once another admin exists", async () => {
    await seedAsAdmin();
    const admin = (await api.listMembers()).find((m) => m.role === "admin")!;
    expect(await keyOf(api.updateMemberRole(admin.id, "collector"))).toBe("err_lastAdmin");
    await api.createMember({ name: "দ্বিতীয় অ্যাডমিন", phone: "9000000999", role: "admin" });
    await expect(api.updateMemberRole(admin.id, "treasurer")).resolves.toMatchObject({
      role: "treasurer",
    });
  });
});
