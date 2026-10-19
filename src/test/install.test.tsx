import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InstallApp, installMode, isIos } from "@/features/install";
import { I18nProvider } from "@/lib/i18n";
import { listenForInstallPrompt } from "@/lib/pwa";

describe("install model", () => {
  const env = { standalone: false, installed: false, canPrompt: false, ios: false };

  it("hides once installed, offers the browser prompt, else an iPhone hint, else nothing", () => {
    expect(installMode({ ...env, standalone: true, canPrompt: true })).toBe("installed");
    expect(installMode({ ...env, installed: true })).toBe("installed");
    expect(installMode({ ...env, canPrompt: true })).toBe("prompt");
    expect(installMode({ ...env, ios: true })).toBe("ios");
    expect(installMode(env)).toBe("none");
  });

  it("recognises iPhone and iPadOS (which says Macintosh) but not a Mac or Android", () => {
    expect(isIos("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isIos("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isIos("Mozilla/5.0 (Linux; Android 14; Pixel 8)", 5)).toBe(false);
  });
});

describe("InstallApp", () => {
  listenForInstallPrompt();
  afterEach(() => vi.restoreAllMocks());

  const offerInstall = (outcome: "accepted" | "dismissed") => {
    const e = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome }),
    });
    act(() => {
      window.dispatchEvent(e);
    });
    return e;
  };

  it("shows nothing until the browser offers installation", () => {
    const { container } = render(<InstallApp variant="card" />, { wrapper: I18nProvider });
    expect(container).toBeEmptyDOMElement();
  });

  it("opens the browser's install dialog from our button, once", async () => {
    render(<InstallApp variant="card" />, { wrapper: I18nProvider });
    const e = offerInstall("accepted");
    expect(e.defaultPrevented).toBe(true); // no browser mini-bar; our button instead
    fireEvent.click(screen.getByRole("button", { name: "অ্যাপ ইনস্টল করুন" }));
    await waitFor(() => expect(e.prompt).toHaveBeenCalledOnce());
    // The offer is used up: the button goes away.
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  });

  it("disappears when the app gets installed", () => {
    render(<InstallApp variant="inline" />, { wrapper: I18nProvider });
    offerInstall("dismissed");
    expect(screen.getByRole("button", { name: "অ্যাপ ইনস্টল করুন" })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new Event("appinstalled"));
    });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
