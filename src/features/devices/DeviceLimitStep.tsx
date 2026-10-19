import { useI18n } from "@/lib/i18n";
import { useDevices } from "@/hooks/use-data";
import { DeviceList } from "./DeviceList";

/**
 * Login on a 4th device: the person removes one of their 3 devices, then login continues
 * (`onRemoved` retries registering this device).
 */
export function DeviceLimitStep({ onRemoved }: { onRemoved: () => void }) {
  const { t } = useI18n();
  const devices = useDevices(true);
  return (
    <div className="space-y-3">
      <h2 className="text-xl font-extrabold">{t("deviceLimitTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("deviceLimitHint")}</p>
      {devices.isPending ? (
        <div className="h-40 animate-pulse rounded-2xl bg-muted" aria-busy="true" />
      ) : devices.isError ? (
        <p role="alert" className="rounded-2xl bg-primary-soft p-3 text-sm text-primary">
          {t("loadFailedHint")}
        </p>
      ) : (
        <div className="rounded-2xl border bg-card px-3">
          <DeviceList devices={devices.data} canSwitch={false} onRemoved={onRemoved} />
        </div>
      )}
    </div>
  );
}
