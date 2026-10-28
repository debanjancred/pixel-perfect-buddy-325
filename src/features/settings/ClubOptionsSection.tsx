import { HandCoins, Megaphone } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";

/** Club options for every member: share the public accounts (moved from Home) and cash. */
export function ClubOptionsSection() {
  const { t } = useI18n();
  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="set-club">
      <h2 id="set-club" className="mb-3 font-bold">
        {t("clubOptions")}
      </h2>
      <Link to="/audit" className="btn btn-gold w-full">
        <Megaphone className="h-5 w-5" aria-hidden /> {t("shareAccounts")}
      </Link>
      <Link to="/cash" className="btn btn-outline mt-2 w-full">
        <HandCoins className="h-5 w-5" aria-hidden /> {t("cashTitle")}
      </Link>
    </section>
  );
}
