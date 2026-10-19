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

  it("shows entries waiting to sync under the header, with a sync-now button", () => {
    const onRetry = vi.fn();
    renderBanner({ pending: 3, onRetry });
    expect(screen.getByRole("status")).toHaveTextContent("৩টি এন্ট্রি সিঙ্কের অপেক্ষায়");
    fireEvent.click(screen.getByRole("button", { name: "এখনই পাঠান" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("says it is sending while a sync runs, without a button", () => {
    renderBanner({ pending: 2, retrying: true });
    expect(screen.getByRole("status")).toHaveTextContent("২টি এন্ট্রি পাঠানো হচ্ছে…");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offline: adds how many entries are waiting to the offline notice", () => {
    renderBanner({ online: false, pending: 2, failed: 1 });
    expect(screen.getByRole("status")).toHaveTextContent("৩টি এন্ট্রি সিঙ্কের অপেক্ষায়");
  });

  it("failed entries take priority over waiting ones", () => {
    renderBanner({ pending: 4, failed: 1 });
    expect(screen.getByRole("alert")).toHaveTextContent("১টি এন্ট্রি সিঙ্ক হয়নি");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
