import { Eye, FileSpreadsheet } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useI18n } from "@/lib/i18n";
import { useClub, useExpenses, useHouseholds, useMembers, useTransactions } from "@/hooks/use-data";
import { csvBlob } from "@/lib/csv";
import { isoDate } from "@/lib/format";
import { downloadBlob } from "@/lib/share";
import { chandaCsv, expensesCsv, exportFileName } from "./model";

/** CSV export of both ledgers (UTF-8 with BOM, localised headers, ASCII amounts). */
export function ExportSection() {
  const i18n = useI18n();
  const { t } = i18n;
  const { data: club } = useClub();
  const { data: chanda = [] } = useTransactions();
  const { data: households = [] } = useHouseholds();
  const { data: members = [] } = useMembers();
  const { data: expenses = [] } = useExpenses();
  const slug = club?.slug ?? "club";

  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="set-export">
      <h2 id="set-export" className="mb-3 flex items-center gap-2 font-bold">
        <FileSpreadsheet className="h-5 w-5 text-success" aria-hidden /> {t("export")}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className="btn btn-outline px-3"
          onClick={() =>
            downloadBlob(
              csvBlob(chandaCsv(chanda, households, members, i18n)),
              exportFileName("chanda", slug, isoDate()),
            )
          }
        >
          {t("exportChanda")}
        </button>
        <button
          type="button"
          className="btn btn-outline px-3"
          onClick={() =>
            downloadBlob(
              csvBlob(expensesCsv(expenses, members, i18n)),
              exportFileName("expenses", slug, isoDate()),
            )
          }
        >
          {t("exportExpense")}
        </button>
      </div>
      <Link to="/audit" className="btn btn-gold mt-2 w-full">
        <Eye className="h-5 w-5" aria-hidden /> {t("publicAudit")}
      </Link>
    </section>
  );
}
