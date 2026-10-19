import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InstallApp } from "@/features/install";
import { I18nProvider } from "@/lib/i18n";

describe("InstallApp on iPhone", () => {
  it("explains Share → Add to Home Screen (iOS has no install dialog)", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1",
    );
    render(<InstallApp variant="card" />, { wrapper: I18nProvider });
    expect(screen.getByText(/Add to Home Screen/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
