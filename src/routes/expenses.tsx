import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/pk/AppShell";
import { useSearchModal } from "@/hooks/use-search-modal";
import { usePermission } from "@/hooks/use-data";
import { LoadMore } from "@/components/pk/LoadMore";
import { usePaged } from "@/hooks/use-paged";
import type { CategoryKey } from "@/lib/categories";
import {
  CategoryChips,
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
const categoryParam = z.custom<CategoryKey>(
  (v) =>
    typeof v === "string" &&
    (/^(pandal|idol|lighting|bhog|cultural|misc)$/.test(v) || /^custom:.{2,40}$/.test(v)),
);
const searchSchema = z.object({
  category: categoryParam.optional().catch(undefined),
  q: z.string().max(60).optional().catch(undefined),
  add: z.boolean().optional().catch(undefined),
  expense: z.string().uuid().optional().catch(undefined),
  photo: z.boolean().optional().catch(undefined),
  edit: z.boolean().optional().catch(undefined),
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
  const query = search.q ?? "";
  const ledger = useExpenseLedger(filter, query);
  const page = usePaged(ledger.rows, `${filter}|${query}`);
  const addSheet = useSearchModal("add");
  const detailSheet = useSearchModal("expense");
  const photoView = useSearchModal("photo");
  const editSheet = useSearchModal("edit");
  const canAdd = usePermission("expense.add");

  const setFilter = (c: CategoryFilter) =>
    navigate({
      search: (s) => ({ ...s, category: c === "all" ? undefined : c }),
      replace: true,
    });
  const setQuery = (q: string) =>
    navigate({ search: (s) => ({ ...s, q: q || undefined }), replace: true });
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
          <div className="relative mt-4">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              className="field pl-11"
              placeholder={t("searchExpenses")}
              aria-label={t("searchExpenses")}
              maxLength={60}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="mt-3">
            {page.rows.length ? (
              <>
                <ExpenseList rows={page.rows} onOpen={(e) => detailSheet.open(e.id)} />
                <LoadMore shown={page.shown} total={page.total} onMore={page.more} />
              </>
            ) : (
              <p className="py-12 text-center text-muted-foreground">
                {t(query ? "noSearchResults" : "noExpensesInCategory")}
              </p>
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
      {selected && !search.photo && !search.edit && (
        <ExpenseDetail
          expense={selected}
          members={ledger.members}
          onClose={detailSheet.close}
          onViewPhoto={() => photoView.open()}
          onEdit={() => editSheet.open()}
        />
      )}
      {selected && search.edit && canAdd && (
        <ExpenseForm
          category={search.category ?? "pandal"}
          editing={selected}
          onClose={editSheet.close}
          onSaved={() => {
            toast.success(t("expenseUpdated"));
            void editSheet.close();
          }}
        />
      )}
      {selected?.voucher_image_id && search.photo && (
        <VoucherViewer id={selected.voucher_image_id} onClose={photoView.close} />
      )}
    </AppShell>
  );
}
