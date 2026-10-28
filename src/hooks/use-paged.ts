import { useEffect, useState } from "react";

/** Rows shown at first and added by each "Load more". */
export const PAGE_SIZE = 10;

/**
 * The first `shown` items of a list, growing by PAGE_SIZE. Starts again from the first page
 * whenever `resetKey` changes (a new filter or search).
 */
export function usePaged<T>(list: T[], resetKey: unknown) {
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => setShown(PAGE_SIZE), [resetKey]);
  return {
    rows: list.slice(0, shown),
    shown: Math.min(shown, list.length),
    total: list.length,
    more: () => setShown((s) => s + PAGE_SIZE),
  };
}
