import { useI18n } from "@/lib/i18n";
import { SyncBadge } from "@/components/pk/ui";
import type { ExpenseRecord } from "@/types/domain";
import { isVoid } from "@/lib/accounts";
import { categoryInfo, categoryKeyOf } from "@/lib/categories";
import { VoucherThumb } from "./Voucher";

export function ExpenseList({
  rows,
  onOpen,
}: {
  rows: ExpenseRecord[];
  onOpen: (e: ExpenseRecord) => void;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((e) => (
        <li key={e.id}>
          <ExpenseRow expense={e} onOpen={() => onOpen(e)} />
        </li>
      ))}
    </ul>
  );
}

/** One ledger row, kept to the essentials; the whole row opens the details (Story 3.2). */
function ExpenseRow({ expense: e, onOpen }: { expense: ExpenseRecord; onOpen: () => void }) {
  const { t, money, date } = useI18n();
  const info = categoryInfo(categoryKeyOf(e), t);
  const voided = isVoid(e);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full gap-3 rounded-2xl border bg-card p-3 text-left shadow-card active:bg-muted"
    >
      <VoucherThumb id={e.voucher_image_id} />
      <span className="min-w-0 flex-1">
        <span className={`block font-bold leading-snug ${voided ? "line-through opacity-60" : ""}`}>
          {e.title}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {info.emoji} {info.label} · {e.paid_to}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
            {date(`${e.date}T00:00:00`)}
          </span>
          {voided && (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">
              {t("receiptVoid")}
            </span>
          )}
          <SyncBadge status={e.sync_status} />
        </span>
      </span>
      <span
        className={`num font-extrabold text-primary ${voided ? "line-through opacity-60" : ""}`}
      >
        {money(e.amount)}
      </span>
    </button>
  );
}
