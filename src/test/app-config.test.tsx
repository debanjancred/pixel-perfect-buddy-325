import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A released app (0.10.0) in cloud mode, with the server read under test control.
vi.mock("@/lib/version", () => ({ APP_VERSION: "0.10.0" }));
vi.mock("@/services/cloud/config", () => ({ isCloud: () => true, otpLength: () => 6 }));
vi.mock("@/services/cloud/client", () => ({ getCloudClient: () => ({}) }));
const fetchAppConfig = vi.fn();
vi.mock("@/services/cloud/app-config", () => ({ fetchAppConfig: () => fetchAppConfig() }));

import { AppNotice } from "@/features/app-status";
import type { AppConfig } from "@/lib/app-status";
import { I18nProvider } from "@/lib/i18n";
import { cachedAppConfig, refreshAppConfig } from "@/services/app-config";

const row = (over: Partial<AppConfig> = {}): AppConfig => ({
  maintenance: false,
  maintenance_message_bn: null,
  maintenance_message_en: null,
  min_version: "0.0.0",
  announcement_bn: null,
  announcement_en: null,
  announcement_url: null,
  flags: {},
  updated_at: "t1",
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  fetchAppConfig.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("reading app_config (never blocks the app)", () => {
  it("keeps a fresh copy on the phone", async () => {
    fetchAppConfig.mockResolvedValue(row({ maintenance: true }));
    expect((await refreshAppConfig())?.maintenance).toBe(true);
    expect(cachedAppConfig()?.maintenance).toBe(true);
  });

  it("falls back to the last copy when the server can't be reached", async () => {
    localStorage.setItem("pk_app_config_v1", JSON.stringify(row({ min_version: "0.9.0" })));
    fetchAppConfig.mockRejectedValue(new Error("network"));
    expect((await refreshAppConfig())?.min_version).toBe("0.9.0");
  });

  it("gives up after 5 seconds instead of hanging (no copy yet: fails open)", async () => {
    vi.useFakeTimers();
    fetchAppConfig.mockReturnValue(new Promise(() => {})); // never answers
    const result = refreshAppConfig();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await result).toBeNull();
  });
});

describe("AppNotice on a released app", () => {
  it("asks for an update when the app is older than the owner allows", () => {
    render(<AppNotice config={row({ min_version: "0.11.0" })} />, { wrapper: I18nProvider });
    expect(screen.getByRole("alert")).toHaveTextContent("আপনার এন্ট্রি ফোনে নিরাপদ আছে");
    expect(screen.getByRole("button", { name: "এখনই আপডেট" })).toBeInTheDocument();
  });

  it("says nothing when the app is new enough", () => {
    const { container } = render(<AppNotice config={row({ min_version: "0.10.0" })} />, {
      wrapper: I18nProvider,
    });
    expect(container).toBeEmptyDOMElement();
  });
});
