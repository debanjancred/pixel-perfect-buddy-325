import { useState } from "react";
import { HandCoins, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { ValidationError } from "@/lib/validation";
import { useRemoveDevice, useSetCollectDevice } from "@/hooks/use-data";
import { ConfirmDialog } from "@/components/pk/ConfirmDialog";
import { Spinner } from "@/components/pk/ui";
import { orderDevices, type ListedDevice } from "./model";

/**
 * A person's devices, with the collecting one marked. `canSwitch` offers "collect on this
 * one"; removing asks first, since that device logs out the next time it opens.
 */
export function DeviceList({
  devices,
  canSwitch = true,
  onRemoved,
}: {
  devices: ListedDevice[];
  canSwitch?: boolean;
  onRemoved?: () => void;
}) {
  const { t, date } = useI18n();
  const setCollect = useSetCollectDevice();
  const remove = useRemoveDevice();
  const [removing, setRemoving] = useState<ListedDevice | null>(null);
  const fail = (e: unknown) =>
    toast.error(e instanceof ValidationError ? t(e.key) : t("loadFailedHint"));

  return (
    <>
      <ul className="divide-y">
        {orderDevices(devices).map((d) => (
          <li key={d.id} className="py-3">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${d.is_collect ? "bg-gold-soft text-gold-ink" : "bg-muted text-muted-foreground"}`}
                aria-hidden
              >
                {d.is_collect ? (
                  <HandCoins className="h-5 w-5" />
                ) : (
                  <Smartphone className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{d.label}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  {d.this_device && (
                    <span className="rounded-full bg-primary-soft px-2 py-0.5 font-bold text-primary">
                      {t("thisDevice")}
                    </span>
                  )}
                  {d.is_collect && (
                    <span className="rounded-full bg-gold-soft px-2 py-0.5 font-bold text-gold-ink">
                      {t("collectDevice")}
                    </span>
                  )}
                  <span>{t("lastSeen", { date: date(d.last_seen_at) })}</span>
                </div>
              </div>
            </div>
            {(!d.is_collect && canSwitch) || !d.this_device ? (
              <div className="mt-2 flex flex-wrap justify-end gap-2 pl-14">
                {!d.is_collect && canSwitch && (
                  <button
                    type="button"
                    className="btn btn-gold min-h-12 px-3 text-sm"
                    disabled={setCollect.isPending}
                    aria-busy={setCollect.isPending && setCollect.variables === d.id}
                    onClick={() =>
                      setCollect.mutate(d.id, {
                        onSuccess: () => d.this_device && toast.success(t("collectDeviceSet")),
                        onError: fail,
                      })
                    }
                  >
                    {setCollect.isPending && setCollect.variables === d.id && <Spinner />}
                    {t("useForCollecting")}
                  </button>
                )}
                {!d.this_device && (
                  <button
                    type="button"
                    className="btn btn-outline min-h-12 px-3 text-sm text-destructive"
                    onClick={() => setRemoving(d)}
                  >
                    {t("removeDevice")}
                  </button>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {removing && (
        <ConfirmDialog
          title={t("removeDeviceConfirm", { name: removing.label })}
          confirmLabel={t("removeDevice")}
          busy={remove.isPending}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            remove.mutate(removing.id, {
              onSuccess: () => {
                setRemoving(null);
                onRemoved?.();
              },
              onError: fail,
            })
          }
        >
          <p>{t("removeDeviceHint")}</p>
        </ConfirmDialog>
      )}
    </>
  );
}
