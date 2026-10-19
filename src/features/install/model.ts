// Which install help a browser gets. Android Chrome/Edge: our button opens the browser's own
// install dialog. iPhone/iPad: no such dialog exists, so a one-line Share → Add to Home Screen
// hint. Already installed, or a browser that can't install: nothing.

export type InstallMode = "installed" | "prompt" | "ios" | "none";

export interface InstallEnv {
  /** Running from the home screen (display-mode standalone, or iOS navigator.standalone). */
  standalone: boolean;
  /** Installed during this visit. */
  installed: boolean;
  /** The browser offered installation (beforeinstallprompt). */
  canPrompt: boolean;
  ios: boolean;
}

export function installMode({ standalone, installed, canPrompt, ios }: InstallEnv): InstallMode {
  if (standalone || installed) return "installed";
  if (canPrompt) return "prompt";
  if (ios) return "ios";
  return "none";
}

/** iPhone/iPad, including iPadOS, which reports itself as a Mac with a touch screen. */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true;
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}
