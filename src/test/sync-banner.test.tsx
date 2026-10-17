import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SyncBanner } from "@/components/pk/SyncBanner";
import { I18nProvider } from "@/lib/i18n";

const renderBanner = (props: Partial<Parameters<typeof SyncBanner>[0]>) =>
  render(<SyncBanner online failed={0} retrying={false} onRetry={() => {}} {...props} />, {
    wrapper: I18nProvider,
  });

describe("SyncBanner (SPEC 5.1)", () => {
  it("shows the SPEC offline text when offline", () => {
    renderBanner({ online: false, failed: 3 });
    expect(screen.getByRole("status")).toHaveTextContent(
      "অফলাইন মোড — ডেটা আপনার ফোনে সংরক্ষিত হচ্ছে",
    );
  });

  it("offers a retry for failed records when online", () => {
    const onRetry = vi.fn();
    renderBanner({ failed: 2, onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("২টি এন্ট্রি সিঙ্ক হয়নি");
    fireEvent.click(screen.getByRole("button", { name: "আবার চেষ্টা" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("disables retry while a sync is running, and hides when all is well", () => {
    const { rerender } = renderBanner({ failed: 1, retrying: true });
    expect(screen.getByRole("button", { name: "আবার চেষ্টা" })).toBeDisabled();
    rerender(<SyncBanner online failed={0} retrying={false} onRetry={() => {}} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });
});
