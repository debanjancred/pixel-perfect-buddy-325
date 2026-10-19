import { Download, Share } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useInstall } from "./use-install";

/**
 * Install the app on the home screen. `card` is the Settings section; `inline` sits under the
 * login form. Renders nothing once installed or where the browser can't install.
 */
export function InstallApp({ variant }: { variant: "card" | "inline" }) {
  const { t } = useI18n();
  const { mode, install } = useInstall();
  if (mode === "installed" || mode === "none") return null;

  const onInstall = async () => {
    if (await install()) toast.success(t("installDone"));
  };

  const action =
    mode === "prompt" ? (
      <button type="button" className="btn btn-outline w-full" onClick={onInstall}>
        <Download className="h-5 w-5" aria-hidden /> {t("installApp")}
      </button>
    ) : (
      <p className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-sm">
        <Share className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{t("installIos")}</span>
      </p>
    );

  if (variant === "inline") return action;
  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="set-install">
      <h2 id="set-install" className="font-bold">
        {t("installTitle")}
      </h2>
      <p className="mt-1 mb-3 text-sm text-muted-foreground">{t("installHint")}</p>
      {action}
    </section>
  );
}
