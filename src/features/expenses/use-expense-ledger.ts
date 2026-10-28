import { useMemo } from "react";
import { useExpenses, useMembers } from "@/hooks/use-data";
import { useI18n } from "@/lib/i18n";
import {
  expenseTotals,
  filterExpenses,
  searchExpenses,
  sortExpenses,
  type CategoryFilter,
} from "./model";

/**
 * The ledger for one category filter and search: sorted rows plus totals across all
 * categories (totals ignore the search, so the chips keep their counts).
 */
export function useExpenseLedger(filter: CategoryFilter, query = "") {
  const expenses = useExpenses();
  const { data: members = [] } = useMembers();
  const { date } = useI18n();
  const all = expenses.data;

  return useMemo(() => {
    const sorted = sortExpenses(all ?? []);
    const shownDate = (iso: string) => date(`${iso}T00:00:00`);
    return {
      all: sorted,
      rows: searchExpenses(filterExpenses(sorted, filter), query, shownDate),
      totals: expenseTotals(sorted),
      members,
      isPending: expenses.isPending,
      isError: expenses.isError,
      refetch: expenses.refetch,
    };
  }, [all, filter, query, date, members, expenses.isPending, expenses.isError, expenses.refetch]);
}
