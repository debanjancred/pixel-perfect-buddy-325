import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ReceiptCard,
  receiptFields,
  receiptFileName,
  receiptText,
  toReceipt,
} from "@/features/receipt";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { api } from "@/services/api";
import type { ChandaTransaction } from "@/types/domain";

beforeEach(() => localStorage.clear());

/** Live i18n context (defaults: Bengali, Bengali numerals) that tests can switch. */
function renderI18n() {
  return renderHook(() => useI18n(), { wrapper: I18nProvider });
}

async function demoReceiptSources() {
  await api.seedDemo();
  const [club, households, members] = await Promise.all([
    api.getClub(),
    api.listHouseholds(),
    api.listMembers(),
  ]);
  const collector = members.find((m) => m.role === "collector")!;
  const household = households.find((h) => h.phone_number)!;
  const tx = await api.addTransaction({
    id: crypto.randomUUID(),
    household_id: household.id,
    amount: 1001,
    payment_method: "cash",
    status: "collected",
    collector_id: collector.id,
  });
  return { tx, household, collector, sources: { club, households, members } };
}

describe("toReceipt", () => {
  it("joins the entry with its club, household and collector", async () => {
    const { tx, household, collector, sources } = await demoReceiptSources();
    const r = toReceipt(tx, sources)!;
    expect(r).toMatchObject({
      id: tx.id,
      receipt_no: tx.receipt_no,
      amount: 1001,
      voided: false,
      donor: { name: household.resident_name, phone: household.phone_number },
      collector_name: collector.name,
    });
  });

  it("has no receipt for pledges or missing data", async () => {
    const { tx, sources } = await demoReceiptSources();
    const pledge: ChandaTransaction = { ...tx, status: "promised" };
    expect(toReceipt(pledge, sources)).toBeNull();
    expect(toReceipt(undefined, sources)).toBeNull();
    expect(toReceipt(tx, { ...sources, club: null })).toBeNull();
  });

  it("keeps voided entries, marked void", async () => {
    const { tx, sources } = await demoReceiptSources();
    const voided = await api.voidChanda(tx.id, "duplicate entry");
    expect(toReceipt(voided, sources)).toMatchObject({
      voided: true,
      void_reason: "duplicate entry",
    });
  });
});

describe("receipt text", () => {
  it("is self-contained Bengali text with the amount in words and no link", async () => {
    const { tx, household, sources } = await demoReceiptSources();
    const { result } = renderI18n();
    const text = receiptText(toReceipt(tx, sources)!, result.current);

    expect(text).toContain(sources.club!.name_bn);
    expect(text).toContain(`রসিদ নং: ${tx.receipt_no}`);
    expect(text).toContain(`দাতা: ${household.resident_name}`);
    expect(text).toContain("*₹১,০০১* (এক হাজার এক টাকা মাত্র)");
    expect(text).toContain("মাধ্যম: নগদ");
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("switches fully to English", async () => {
    const { tx, sources } = await demoReceiptSources();
    const { result } = renderI18n();
    act(() => result.current.setLang("en"));
    const text = receiptText(toReceipt(tx, sources)!, result.current);

    expect(text).toContain(sources.club!.name_en);
    expect(text).toContain("*₹1,001* (Rupees One Thousand One Only)");
    expect(text).toContain("Paid via: Cash");
    expect(text).toContain("Thank you for your chanda");
  });

  it("flags voided receipts", async () => {
    const { tx, sources } = await demoReceiptSources();
    const { result } = renderI18n();
    const voided = await api.voidChanda(tx.id, "duplicate entry");
    expect(receiptText(toReceipt(voided, sources)!, result.current)).toContain("বাতিল");
  });

  it("lists fields in order, skipping the ones without data", async () => {
    const { tx, sources } = await demoReceiptSources();
    const { result } = renderI18n();
    const r = toReceipt(tx, sources)!;
    const keys = (x: typeof r) => receiptFields(x, result.current).map((f) => f.key);

    expect(keys(r)).toEqual(["donor", "address", "paidVia", "collector", "date"]);
    expect(keys({ ...r, collector_name: undefined, donor: { name: "x" } })).toEqual([
      "donor",
      "paidVia",
      "date",
    ]);
  });

  it("names files after the receipt number", async () => {
    const { tx, sources } = await demoReceiptSources();
    expect(receiptFileName(toReceipt(tx, sources)!, "png")).toBe(`${tx.receipt_no}.png`);
  });
});

describe("ReceiptCard", () => {
  it("renders the receipt in the current language", async () => {
    const { tx, sources } = await demoReceiptSources();
    render(<ReceiptCard receipt={toReceipt(tx, sources)!} />, { wrapper: I18nProvider });

    expect(screen.getByRole("article")).toHaveAccessibleName(`চাঁদার রসিদ ${tx.receipt_no}`);
    expect(screen.getByText("এক হাজার এক টাকা মাত্র")).toBeInTheDocument();
    expect(screen.getByText("₹১,০০১")).toBeInTheDocument();
  });
});

describe("i18n t() interpolation", () => {
  it("fills placeholders and leaves unknown ones intact", () => {
    const { result } = renderI18n();
    expect(result.current.t("amountInWords", { words: "দশ" })).toBe("দশ টাকা মাত্র");
    expect(result.current.t("amountInWords", {})).toBe("{words} টাকা মাত্র");
    expect(result.current.words(1001)).toBe("এক হাজার এক");
  });
});

describe("locale persistence (SPEC 1.2)", () => {
  it("stores the language under app_locale and reads the old prefs key once", async () => {
    localStorage.setItem(
      "pk_prefs_v1",
      JSON.stringify({ lang: "en", bnDigits: true, dark: false }),
    );
    const { result } = renderI18n();
    await waitFor(() => expect(result.current.lang).toBe("en"));
    expect(localStorage.getItem("app_locale")).toBe("en");
    act(() => result.current.setLang("bn"));
    await waitFor(() => expect(localStorage.getItem("app_locale")).toBe("bn"));
    expect(JSON.parse(localStorage.getItem("pk_prefs_v1")!)).toEqual({
      bnDigits: true,
      dark: false,
    });
  });
});
