import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { ValidationError } from "@/lib/validation";
import { useCollectStanding, useOnline, useResetCollectDevice } from "@/hooks/use-data";
import { ConfirmDialog } from "@/components/pk/ConfirmDialog";
import type { ClubMember } from "@/types/domain";

/**
 * Admin, in a member's sheet: clear their collecting device (a lost phone); they choose
 * again. Cloud mode only; needs the network.
 */
export function ResetCollectDevice({ member }: { member: ClubMember }) {
  const { t } = useI18n();
  const online = useOnline();
  const { data: standing } = useCollectStanding();
  const reset = useResetCollectDevice();
  const [ask, setAsk] = useState(false);
  if (!standing?.applies) return null;

  return (
    <div className="mt-5 border-t pt-4">
      <p className="font-semibold">{t("collectDevice")}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">{t("collectDeviceRowHint")}</p>
      <button
        type="button"
        className="btn btn-outline mt-3 w-full"
        disabled={!online}
        onClick={() => setAsk(true)}
      >
        <RotateCcw className="h-5 w-5" aria-hidden /> {t("resetCollectDevice")}
      </button>
      {!online && <p className="mt-1 text-xs text-muted-foreground">{t("collectGateOffline")}</p>}
      {ask && (
        <ConfirmDialog
          title={t("resetCollectDevice")}
          busy={reset.isPending}
          onCancel={() => setAsk(false)}
          onConfirm={() =>
            reset.mutate(member.id, {
              onSuccess: () => {
                setAsk(false);
                toast.success(t("collectDeviceReset"));
              },
              onError: (e) =>
                toast.error(e instanceof ValidationError ? t(e.key) : t("loadFailedHint")),
            })
          }
        >
          <p>{t("resetCollectDeviceConfirm", { name: member.name })}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
