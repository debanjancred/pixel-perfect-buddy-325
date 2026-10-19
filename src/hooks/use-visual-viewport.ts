import { useEffect, useState } from "react";

export interface VisibleArea {
  top: number;
  height: number;
}

/**
 * The part of the screen the user can actually see — above the on-screen keyboard. Phones
 * keep `position: fixed; inset: 0` the full screen height when the keyboard opens (iOS
 * always, Android by default), so a bottom sheet would sit behind the keyboard; sizing the
 * overlay to this area keeps it above. Null where there's no visualViewport (old browsers,
 * SSR): the CSS layout applies unchanged.
 */
export function useVisibleArea(active: boolean): VisibleArea | null {
  const [area, setArea] = useState<VisibleArea | null>(null);
  useEffect(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    if (!active || !vv) return;
    const update = () => {
      setArea({ top: vv.offsetTop, height: vv.height });
      // Keep the field being typed in visible once the keyboard has resized the view.
      const el = document.activeElement;
      if (el instanceof HTMLElement && el.closest('[role="dialog"]'))
        el.scrollIntoView({ block: "nearest" });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return active ? area : null;
}
