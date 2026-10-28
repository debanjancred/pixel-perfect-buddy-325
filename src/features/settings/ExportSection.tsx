import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  useClub,
  useExpenses,
  useHouseholds,
  useMembers,
  usePermission,
  useTransactions,
} from "@/hooks/use-data";
import { Spinner } from "@/components/pk/ui";
import { isoDate } from "@/lib/format";
import { downloadBlob } from "@/lib/share";
import { xlsxBlob } from "@/lib/xlsx";
import { chandaRows, expenseRows, exportFileName } from "./model";

/**
 * Excel export of both ledgers (UAT: .xlsx; localised headers; cancelled entries marked with
 * their reason). Admins and treasurers only (`data.export`).
 */
export function ExportSection() {
  const i18n = useI18n();
  const { t } = i18n;
  const allowed = usePermission("data.export");
  const { data: club } = useClub();
  const { data: chanda = [] } = useTransactions();
  const { data: households = [] } = useHouseholds();
  const { data: members = [] } = useMembers();
  const { data: expenses = [] } = useExpenses();
  const [busy, setBusy] = useState<"chanda" | "expenses" | null>(null);
  if (!allowed) return null;
  const slug = club?.slug ?? "club";

  const download = async (kind: "chanda" | "expenses") => {
    setBusy(kind);
    try {
      const rows =
        kind === "chanda"
          ? chandaRows(chanda, households, members, i18n)
          : expenseRows(expenses, members, i18n);
      const blob = await xlsxBlob(rows, t(`export_sheet_${kind}`));
      downloadBlob(blob, exportFileName(kind, slug, isoDate()));
    } catch {
      toast.error(t("loadFailedHint"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-3xl border bg-card p-4 shadow-card" aria-labelledby="set-export">
      <h2 id="set-export" className="mb-3 flex items-center gap-2 font-bold">
        <FileSpreadsheet className="h-5 w-5 text-success" aria-hidden /> {t("export")}
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {(["chanda", "expenses"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className="btn btn-outline px-3"
            disabled={busy !== null}
            aria-busy={busy === kind}
            onClick={() => void download(kind)}
          >
            {busy === kind && <Spinner />}
            {t(kind === "chanda" ? "exportChanda" : "exportExpense")}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("exportHint")}</p>
    </section>
  );
}
