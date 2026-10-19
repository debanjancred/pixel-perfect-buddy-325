import { HandCoins } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { ValidationError } from "@/lib/validation";
import { useOnline, useSetCollectDevice } from "@/hooks/use-data";
import { Spinner } from "@/components/pk/ui";
import { collectGateMessage } from "./model";

/**
 * Shown on the collect screen of a device that doesn't collect: says which device does and
 * offers to collect here instead (needs the network; the server moves it).
 */
export function CollectDeviceGate({ collectLabel }: { collectLabel: string | null }) {
  const { t } = useI18n();
  const online = useOnline();
  const setCollect = useSetCollectDevice();
  const msg = collectGateMessage(collectLabel);

  return (
    <div role="status" className="mt-6 rounded-3xl border bg-card p-5 text-center shadow-card">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-soft text-gold-ink">
        <HandCoins className="h-7 w-7" aria-hidden />
      </div>
      <p className="mt-3 text-lg font-bold">{t("collectGateTitle")}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {msg.key === "collectGateOther" ? t(msg.key, { name: msg.name }) : t(msg.key)}
      </p>
      {online ? (
        <button
          type="button"
          className="btn btn-primary mt-4 w-full"
          disabled={setCollect.isPending}
          aria-busy={setCollect.isPending}
          onClick={() =>
            setCollect.mutate(undefined, {
              onSuccess: () => toast.success(t("collectDeviceSet")),
              onError: (e) =>
                toast.error(e instanceof ValidationError ? t(e.key) : t("loadFailedHint")),
            })
          }
        >
          {setCollect.isPending && <Spinner />}
          {t("useForCollecting")}
        </button>
      ) : (
        <p className="mt-4 rounded-2xl bg-muted p-3 text-sm">{t("collectGateOffline")}</p>
      )}
    </div>
  );
}
