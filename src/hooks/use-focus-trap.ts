import { useEffect, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard/screen-reader focus for a dialog: moves focus into it on open, keeps Tab and
 * Shift+Tab inside it, and returns focus to whatever opened it on close.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const opener = document.activeElement as HTMLElement | null;
    // Structural check (no layout reads): skip anything inside hidden / aria-hidden content.
    const items = () =>
      [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (e) => !e.closest('[hidden], [aria-hidden="true"]'),
      );
    // Prefer the first form field; otherwise the dialog itself (announces its label).
    (root.querySelector<HTMLElement>("input, select, textarea") ?? root).focus({
      preventScroll: true,
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !root.contains(document.activeElement ?? root)) return;
      const list = items();
      if (!list.length) return e.preventDefault();
      const first = list[0]!;
      const last = list[list.length - 1]!;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [ref, active]);
}
