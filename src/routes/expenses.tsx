import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/pk/AppShell";
import { useSearchModal } from "@/hooks/use-search-modal";
import { usePermission } from "@/hooks/use-data";
import {
  CategoryChips,
  EXPENSE_CATEGORIES,
  ExpenseDetail,
  ExpenseForm,
  ExpenseList,
  ExpenseSummary,
  VoucherViewer,
  useExpenseLedger,
  type CategoryFilter,
} from "@/features/expenses";

// Filter and sheets live in the URL: refresh keeps them, they can be linked to, and the
// phone's back button closes a sheet. `.catch` drops a malformed param instead of failing.
const searchSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).optional().catch(undefined),
  add: z.boolean().optional().catch(undefined),
  expense: z.string().uuid().optional().catch(undefined),
  photo: z.boolean().optional().catch(undefined),
});

export const Route = createFileRoute("/expenses")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Expense Ledger — Pujo Khata" },
      {
        name: "description",
        content:
          "Category-wise puja expenses — pandal, idol, lighting, bhog — with receipt photos.",
      },
      { property: "og:title", content: "Expense Ledger — Pujo Khata" },
      {
        property: "og:description",
        content: "Every puja expense with approvals and receipt photos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { t, money } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filter: CategoryFilter = search.category ?? "all";
  const ledger = useExpenseLedger(filter);
  const addSheet = useSearchModal("add");
  const detailSheet = useSearchModal("expense");
  const photoView = useSearchModal("photo");
  const canAdd = usePermission("expense.add");

  const setFilter = (c: CategoryFilter) =>
    navigate({
      search: (s) => ({ ...s, category: c === "all" ? undefined : c }),
      replace: true,
    });
  const selected = search.expense ? ledger.all.find((e) => e.id === search.expense) : undefined;

  return (
    <AppShell
      fab={
        canAdd && (
          <button
            type="button"
            onClick={() => addSheet.open()}
            className="btn btn-primary shadow-fab fixed bottom-24 right-4 z-40 h-16 rounded-full px-6"
          >
            <Plus className="h-6 w-6" /> {t("addExpense")}
          </button>
        )
      }
    >
      <h1 className="text-2xl font-extrabold">{t("expenseLedger")}</h1>
      <div className="mt-3">
        <CategoryChips value={filter} totals={ledger.totals} onChange={setFilter} />
      </div>

      {ledger.isError && (
        <div
          role="alert"
          className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-warning-soft p-3 text-sm font-semibold text-warning"
        >
          {t("loadFailedHint")}
          <button className="btn btn-outline shrink-0 text-sm" onClick={() => ledger.refetch()}>
            {t("tryAgain")}
          </button>
        </div>
      )}

      {ledger.isPending ? (
        <div className="mt-4 space-y-2" aria-busy="true">
          <div className="h-24 animate-pulse rounded-2xl bg-muted" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : ledger.all.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed bg-card p-6 text-center">
          <p className="font-bold">{t("noExpenses")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noExpensesHint")}</p>
        </div>
      ) : (
        <>
          <div className="mt-4">
            <ExpenseSummary totals={ledger.totals} filter={filter} onPick={setFilter} />
          </div>
          <div className="mt-4">
            {ledger.rows.length ? (
              <ExpenseList rows={ledger.rows} onOpen={(e) => detailSheet.open(e.id)} />
            ) : (
              <p className="py-12 text-center text-muted-foreground">{t("noExpensesInCategory")}</p>
            )}
          </div>
        </>
      )}
      <div className="h-16" />

      {search.add && canAdd && (
        <ExpenseForm
          category={search.category ?? "pandal"}
          onClose={addSheet.close}
          onSaved={(e) => {
            toast.success(navigator.onLine ? `${money(e.amount)} ✓` : t("offlineSaved"));
            void addSheet.close();
          }}
        />
      )}
      {selected && !search.photo && (
        <ExpenseDetail
          expense={selected}
          members={ledger.members}
          onClose={detailSheet.close}
          onViewPhoto={() => photoView.open()}
        />
      )}
      {selected?.voucher_image_id && search.photo && (
        <VoucherViewer id={selected.voucher_image_id} onClose={photoView.close} />
      )}
    </AppShell>
  );
}
