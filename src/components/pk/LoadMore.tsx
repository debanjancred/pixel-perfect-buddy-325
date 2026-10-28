import { ChevronDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** "Showing 10 of 34" with a Load more button; renders nothing when everything is shown. */
export function LoadMore({
  shown,
  total,
  onMore,
}: {
  shown: number;
  total: number;
  onMore: () => void;
}) {
  const { t, n } = useI18n();
  if (shown >= total) return null;
  return (
    <div className="mt-3 text-center">
      <button type="button" className="btn btn-outline w-full" onClick={onMore}>
        <ChevronDown className="h-5 w-5" aria-hidden /> {t("loadMore")}
      </button>
      <p className="mt-1.5 text-xs text-muted-foreground" aria-live="polite">
        {t("showingCount", { shown: n(String(shown)), total: n(String(total)) })}
      </p>
    </div>
  );
}
