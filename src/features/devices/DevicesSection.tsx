import { useI18n } from "@/lib/i18n";
import { useCollectStanding, useDevices, useOnline } from "@/hooks/use-data";
import { DeviceList } from "./DeviceList";

/** Settings → Devices: where this person is logged in and which device collects chanda. */
export function DevicesSection() {
  const { t } = useI18n();
  const online = useOnline();
  const { data: standing } = useCollectStanding();
  const devices = useDevices(online && !!standing?.applies);
  if (!standing?.applies) return null;

  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="set-devices">
      <h2 id="set-devices" className="font-bold">
        {t("devices")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("devicesHint")}</p>
      {!online ? (
        <p role="status" className="mt-3 rounded-2xl bg-muted p-3 text-sm">
          {t("devicesOffline")}
        </p>
      ) : devices.isPending ? (
        <div className="mt-3 h-32 animate-pulse rounded-2xl bg-muted" aria-busy="true" />
      ) : devices.isError ? (
        <p role="alert" className="mt-3 rounded-2xl bg-primary-soft p-3 text-sm text-primary">
          {t("loadFailedHint")}
        </p>
      ) : (
        <div className="mt-2">
          <DeviceList devices={devices.data} />
        </div>
      )}
    </section>
  );
}
