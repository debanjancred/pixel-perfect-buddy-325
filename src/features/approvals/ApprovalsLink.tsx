import { Link } from "@tanstack/react-router";
import { ChevronRight, ClipboardCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useApprovals, usePermission } from "@/hooks/use-data";

/** The admin's way into the queue, shown only while something waits (Home). */
export function ApprovalsLink() {
  const { t, n } = useI18n();
  const admin = usePermission("entry.approve");
  const { data: items = [] } = useApprovals();
  if (!admin || items.length === 0) return null;
  return (
    <Link
      to="/approvals"
      className="mt-4 flex min-h-14 items-center gap-3 rounded-2xl border-2 border-info/30 bg-info-soft p-3 text-info"
    >
      <ClipboardCheck className="h-6 w-6 shrink-0" aria-hidden />
      <span className="flex-1 font-semibold">
        {t("approvalsWaiting", { count: n(String(items.length)) })}
      </span>
      <ChevronRight className="h-5 w-5" aria-hidden />
    </Link>
  );
}
