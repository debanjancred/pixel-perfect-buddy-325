import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogOut, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useClub, useResetDemo } from "@/hooks/use-data";
import { api } from "@/services/api";
import { ConfirmDialog } from "@/components/pk/ConfirmDialog";
import { DEMO_SLUG } from "@/mocks/mockData";
import { APP_VERSION } from "@/lib/version";

/** Reset demo (sample club only), log out — both confirmed — and the app version. */
export function AccountSection() {
  const { t, n } = useI18n();
  const navigate = useNavigate();
  const { data: club } = useClub();
  const resetDemo = useResetDemo();
  const [ask, setAsk] = useState<"reset" | "logout" | null>(null);
  const isDemo = club?.slug === DEMO_SLUG;

  return (
    <section aria-label={t("logout")}>
      <div className={`grid gap-2 ${isDemo ? "grid-cols-2" : "grid-cols-1"}`}>
        {isDemo && (
          <button type="button" className="btn btn-outline px-3" onClick={() => setAsk("reset")}>
            <RotateCcw className="h-5 w-5" aria-hidden /> {t("resetDemo")}
          </button>
        )}
        <button
          type="button"
          className="btn btn-outline px-3 text-destructive"
          onClick={() => setAsk("logout")}
        >
          <LogOut className="h-5 w-5" aria-hidden /> {t("logout")}
        </button>
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        {t("app")} · {t("appVersion")} <span className="num">{n(APP_VERSION)}</span>
      </p>

      {ask === "reset" && (
        <ConfirmDialog
          title={t("resetDemo")}
          busy={resetDemo.isPending}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await resetDemo.mutateAsync();
            setAsk(null);
            toast.success(t("refreshed"));
          }}
        >
          <p>{t("resetDemoConfirm")}</p>
        </ConfirmDialog>
      )}
      {ask === "logout" && (
        <ConfirmDialog
          title={t("logoutConfirm")}
          confirmLabel={t("logout")}
          onCancel={() => setAsk(null)}
          onConfirm={async () => {
            await api.signOut();
            navigate({ to: "/" });
          }}
        />
      )}
    </section>
  );
}
