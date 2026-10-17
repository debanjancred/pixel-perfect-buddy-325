import { useI18n } from "@/lib/i18n";
import { session, useCurrentMember, useMembers, useSetDemoActor } from "@/hooks/use-data";

/** Demo only: switch which sample member the app acts as, to try each role's view. */
export function DemoActorSection() {
  const { t } = useI18n();
  const { data: members = [] } = useMembers();
  const me = useCurrentMember();
  const setActor = useSetDemoActor();
  if (session.get()?.mode !== "demo") return null;

  return (
    <section
      className="rounded-3xl border-2 border-gold/50 bg-gold-soft p-4"
      aria-labelledby="set-actor"
    >
      <label htmlFor="demo-actor" id="set-actor" className="font-bold text-gold-ink">
        {t("actingAs")}
      </label>
      <p className="text-sm text-muted-foreground">{t("actingAsHint")}</p>
      <select
        id="demo-actor"
        className="field mt-2"
        value={me?.id ?? ""}
        onChange={(e) => void setActor(e.target.value)}
      >
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name} — {t(`role_${m.role}`)}
          </option>
        ))}
      </select>
    </section>
  );
}
