import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppNotice } from "@/features/app-status";
import { appStatus, compareVersions, visibleAnnouncement, type AppConfig } from "@/lib/app-status";
import { I18nProvider } from "@/lib/i18n";

const config = (over: Partial<AppConfig> = {}): AppConfig => ({
  maintenance: false,
  maintenance_message_bn: null,
  maintenance_message_en: null,
  min_version: "0.0.0",
  announcement_bn: null,
  announcement_en: null,
  announcement_url: null,
  flags: {},
  updated_at: "2026-10-20T10:00:00Z",
  ...over,
});

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("app status (ADR 0002 §3)", () => {
  it("compares versions numerically, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
    expect(compareVersions("0.10.0", "0.11.0")).toBe(-1);
  });

  it("asks an older app to update and pauses its sync", () => {
    expect(appStatus(config({ min_version: "0.11.0" }), "0.10.0")).toEqual({
      updateRequired: true,
      maintenance: false,
      syncPaused: true,
    });
    expect(appStatus(config({ min_version: "0.10.0" }), "0.10.0").updateRequired).toBe(false);
  });

  it("pauses sync for maintenance; never tells a development build to update", () => {
    expect(appStatus(config({ maintenance: true }), "0.10.0").syncPaused).toBe(true);
    expect(appStatus(config({ min_version: "9.0.0" }), "dev").updateRequired).toBe(false);
  });

  it("fails open with no config (first open with no signal, or device-only mode)", () => {
    expect(appStatus(null, "0.10.0")).toEqual({
      updateRequired: false,
      maintenance: false,
      syncPaused: false,
    });
  });

  it("shows an announcement until this one is closed; a new one shows again", () => {
    const c = config({ announcement_en: "Meeting on Sunday", announcement_bn: null });
    expect(visibleAnnouncement(c, null)?.en).toBe("Meeting on Sunday");
    expect(visibleAnnouncement(c, null)?.bn).toBe("Meeting on Sunday"); // falls back
    expect(visibleAnnouncement(c, c.updated_at)).toBeNull();
    expect(visibleAnnouncement({ ...c, updated_at: "later" }, c.updated_at)).not.toBeNull();
  });
});

describe("AppNotice", () => {
  const show = (c: AppConfig | null) => render(<AppNotice config={c} />, { wrapper: I18nProvider });

  it("shows nothing when all is normal", () => {
    const { container } = show(config());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the owner's maintenance message and says entries are safe", () => {
    show(config({ maintenance: true, maintenance_message_bn: "রাত ১০টা পর্যন্ত কাজ চলবে।" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("রাত ১০টা পর্যন্ত কাজ চলবে।");
    expect(status).toHaveTextContent("এন্ট্রি ফোনে জমা থাকবে");
  });

  it("closes an announcement and remembers it", () => {
    const c = config({ announcement_bn: "রবিবার সভা", announcement_url: "https://example.org" });
    const { unmount } = show(c);
    expect(screen.getByRole("link", { name: /বিস্তারিত/ })).toHaveAttribute(
      "href",
      "https://example.org",
    );
    fireEvent.click(screen.getByRole("button", { name: "ঘোষণা বন্ধ করুন" }));
    expect(screen.queryByText("রবিবার সভা")).toBeNull();
    unmount();
    show(c);
    expect(screen.queryByText("রবিবার সভা")).toBeNull();
  });
});
