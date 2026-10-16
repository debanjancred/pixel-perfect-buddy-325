import { Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/** Shown in place of a screen or form the current member's role doesn't allow. */
export function NoAccess() {
  const { t } = useI18n();
  return (
    <div role="status" className="mt-8 rounded-2xl border border-dashed bg-card p-6 text-center">
      <Lock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
      <p className="mt-2 font-bold">{t("noAccess")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("noAccessHint")}</p>
    </div>
  );
}
