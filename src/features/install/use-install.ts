import { useSyncExternalStore } from "react";
import { installPrompt, type InstallState } from "@/lib/pwa";
import { installMode, isIos, type InstallMode } from "./model";

const serverState: InstallState = { canPrompt: false, installed: false };

function standalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** How this browser can install the app, and the action for the "prompt" case. */
export function useInstall(): { mode: InstallMode; install: () => Promise<boolean> } {
  const state = useSyncExternalStore(installPrompt.subscribe, installPrompt.get, () => serverState);
  const mode =
    typeof window === "undefined"
      ? "none"
      : installMode({
          ...state,
          standalone: standalone(),
          ios: isIos(navigator.userAgent, navigator.maxTouchPoints ?? 0),
        });
  return { mode, install: installPrompt.show };
}
