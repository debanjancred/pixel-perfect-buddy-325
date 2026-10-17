import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Modal } from "@/components/pk/ui";
import { byRecentActivity } from "@/lib/households";
import { I18nProvider, themeBootScript } from "@/lib/i18n";
import type { ChandaTransaction, Household } from "@/types/domain";

describe("byRecentActivity (SPEC 2.1: recent households on top)", () => {
  const h = (id: string, created_at: string) => ({ id, created_at }) as Household;
  const c = (household_id: string, created_at: string) =>
    ({ household_id, created_at }) as ChandaTransaction;

  it("orders by the later of added-at and newest entry", () => {
    const list = [h("old", "2026-01-01"), h("new", "2026-03-01"), h("active", "2026-01-02")];
    const chanda = [c("active", "2026-04-01"), c("old", "2026-02-01")];
    expect(byRecentActivity(list, chanda).map((x) => x.id)).toEqual(["active", "new", "old"]);
  });
});

describe("theme boot script", () => {
  it("applies dark mode from saved preferences before React runs", () => {
    document.documentElement.classList.remove("dark");
    localStorage.setItem("pk_prefs_v1", JSON.stringify({ dark: true }));
    new Function(themeBootScript)();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    localStorage.setItem("pk_prefs_v1", "{broken");
    document.documentElement.classList.remove("dark");
    expect(() => new Function(themeBootScript)()).not.toThrow();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("Modal focus management", () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>open</button>
        <Modal open={open} onClose={() => setOpen(false)} title="Dialog">
          <input aria-label="first field" />
          <button>last</button>
        </Modal>
      </>
    );
  }

  it("moves focus in, keeps Tab inside, and returns focus on close", () => {
    render(<Harness />, { wrapper: I18nProvider });
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByLabelText("first field")).toHaveFocus();

    // From the last focusable, Tab wraps to the first (the close button, in DOM order).
    screen.getByRole("button", { name: "last" }).focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(screen.getByRole("button", { name: "last" }));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(opener).toHaveFocus();
  });
});

describe("laneOptions (SPEC SHOULD: lane/block filter)", () => {
  it("lists lanes once with counts, in natural order even with Bengali digits", async () => {
    const { laneOptions } = await import("@/lib/households");
    const h = (lane_block: string) => ({ lane_block }) as Household;
    expect(laneOptions([h("লেন ১০"), h("লেন ২"), h("ব্লক এ"), h("লেন ২")])).toEqual([
      { lane: "ব্লক এ", count: 1 }, // ব sorts before ল
      { lane: "লেন ২", count: 2 }, // numeric: ২ before ১০
      { lane: "লেন ১০", count: 1 },
    ]);
  });
});
