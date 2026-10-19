import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { ValidationError } from "@/lib/validation";
import { useCollectStanding, useOnline, useResetCollectDevice } from "@/hooks/use-data";
import { ConfirmDialog } from "@/components/pk/ConfirmDialog";
import type { ClubMember } from "@/types/domain";

/** Admin, per member: clear their collecting device (a lost phone); they choose again. */
export function ResetCollectDevice({ member }: { member: ClubMember }) {
  const { t } = useI18n();
  const online = useOnline();
  const { data: standing } = useCollectStanding();
  const reset = useResetCollectDevice();
  const [ask, setAsk] = useState(false);
  if (!standing?.applies) return null;

  return (
    <>
      <button
        type="button"
        className="tap flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground"
        aria-label={`${t("resetCollectDevice")}: ${member.name}`}
        title={t("resetCollectDevice")}
        disabled={!online}
        onClick={() => setAsk(true)}
      >
        <RotateCcw className="h-5 w-5" aria-hidden />
      </button>
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
    </>
  );
}
