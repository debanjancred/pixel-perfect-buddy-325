import type { ReactNode } from "react";
import { Globe, Hash, Moon } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LangToggle, Switch } from "@/components/pk/ui";

/** Language, Bengali numerals and dark mode — all persisted inside i18n.tsx. */
export function PreferencesSection() {
  const { t, dark, setDark, bnDigits, setBnDigits } = useI18n();
  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="set-prefs">
      <h2 id="set-prefs" className="mb-2 font-bold">
        {t("preferences")}
      </h2>
      <Row icon={<Globe className="h-5 w-5" />} label={t("language")}>
        <LangToggle />
      </Row>
      <Row icon={<Hash className="h-5 w-5" />} label={t("bnDigits")}>
        <Switch label={t("bnDigits")} on={bnDigits} set={setBnDigits} />
      </Row>
      <Row icon={<Moon className="h-5 w-5" />} label={t("darkMode")}>
        <Switch label={t("darkMode")} on={dark} set={setDark} />
      </Row>
    </section>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center gap-3 border-b py-2 last:border-0">
      <span className="text-muted-foreground" aria-hidden>
        {icon}
      </span>
      <span className="flex-1 font-semibold">{label}</span>
      {children}
    </div>
  );
}
