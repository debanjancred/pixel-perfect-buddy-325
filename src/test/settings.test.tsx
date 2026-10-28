import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  chandaRows,
  expenseRows,
  exportFileName,
  initialOf,
  membersByRole,
  phoneDisplay,
} from "@/features/settings";
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

describe("member rows", () => {
  it("shows the first letter whole, without a dangling hasanta", () => {
    expect(initialOf("অ্যাডমিন ০১")).toBe("অ");
    expect(initialOf("কোষাধ্যক্ষ")).toBe("কো");
    expect(initialOf("  শ্রীমতী অনুরাধা")).toBe("শ্রী");
    expect(initialOf("Acme smith")).toBe("A");
    expect(initialOf("")).toBe("?");
  });
  it("groups a mobile number 5 + 5", () => {
    expect(phoneDisplay("9830012345")).toBe("98300 12345");
    expect(phoneDisplay("12345")).toBe("12345");
  });
});

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

  it("Excel rows: requested columns, numeric amounts, Cancelled with reason, else N/A", async () => {
    const { chanda, households, members, f } = await demo();
    const rows = chandaRows(chanda, households, members, f.current);
    expect(rows).toHaveLength(chanda.length + 1);
    expect(rows.slice(1).every((r) => typeof r[4] === "number")).toBe(true);
    const voided = chanda.find((c) => c.voided_at)!;
    const vRow = rows.find((r) => r[1] === voided.receipt_no)!;
    expect(vRow[7]).toBe("বাতিল");
    expect(vRow[8]).toBe(voided.void_reason);
    const live = rows.find((r) => r[1] !== voided.receipt_no && r !== rows[0])!;
    expect(live[8]).toBe("প্রযোজ্য নয়");

    act(() => f.current.setLang("en"));
    const en = chandaRows(chanda, households, members, f.current);
    expect(en[0]).toEqual([
      "Date",
      "Receipt no.",
      "Resident",
      "Lane / Block",
      "Amount (₹)",
      "Method",
      "Collector",
      "Status",
      "Remarks",
    ]);
    expect(en.slice(1).map((r) => r[5])).toContain("Cash");
    expect(en.find((r) => r[1] === voided.receipt_no)![7]).toBe("Cancelled");
    expect(en.slice(1).map((r) => r[8])).toContain("N/A");
  });

  it("exports expenses by date with localised categories and the same Status/Remarks", async () => {
    const { expenses, members, f } = await demo();
    act(() => f.current.setLang("en"));
    const rows = expenseRows(expenses, members, f.current);
    expect(rows[0]).toEqual([
      "Date",
      "Category",
      "Item",
      "Amount (₹)",
      "Paid to",
      "Authorised by",
      "Status",
      "Remarks",
    ]);
    const dates = rows.slice(1).map((r) => r[0] as string);
    expect(dates).toEqual([...dates].sort());
    expect(rows.slice(1).map((r) => r[1])).toContain("Pandal");
    expect(rows.slice(1).every((r) => r[6] === "Recorded" || r[6] === "Cancelled")).toBe(true);
  });

  it("names files by kind, club and date, as .xlsx", () => {
    expect(exportFileName("chanda", "sample", "2026-10-17")).toBe(
      "pujo-khata-chanda-sample-2026-10-17.xlsx",
    );
  });

  it("writes a real .xlsx file", async () => {
    const { xlsxBlob } = await import("@/lib/xlsx");
    const blob = await xlsxBlob(
      [
        ["Date", "Amount (₹)"],
        ["=SUM(A1)", 1001],
      ],
      "Chanda",
    );
    // jsdom's Blob has no arrayBuffer(); FileReader works everywhere.
    const buffer = await new Promise<ArrayBuffer>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(blob);
    });
    const bytes = new Uint8Array(buffer);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // a zip archive ("PK")
    expect(blob.size).toBeGreaterThan(1000);
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
