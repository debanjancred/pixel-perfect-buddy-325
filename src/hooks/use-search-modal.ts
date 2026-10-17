import { useCallback } from "react";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** Search key of the sheet this history entry opened (see useSearchModal). */
    modal?: string;
  }
}

/**
 * Drives a modal/sheet from a search param, so it survives refresh, can be linked to, and
 * the phone's back button closes it instead of leaving the page.
 *
 * Opening pushes a history entry tagged with the key; closing pops that entry when we
 * pushed it, or strips the param in place when the page was opened directly at that URL.
 */
export function useSearchModal<K extends string>(key: K) {
  const navigate = useNavigate();
  const router = useRouter();
  const location = useLocation();
  const openedHere = location.state.modal === key;

  const open = useCallback(
    (value: unknown = true) =>
      navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => ({ ...prev, [key]: value }),
        state: (prev) => ({ ...prev, modal: key }),
      }),
    [navigate, key],
  );

  const close = useCallback(() => {
    if (openedHere) return router.history.back();
    return navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => {
        const { [key]: _removed, ...rest } = prev;
        return rest;
      },
      replace: true,
    });
  }, [openedHere, router, navigate, key]);

  return { open, close };
}
