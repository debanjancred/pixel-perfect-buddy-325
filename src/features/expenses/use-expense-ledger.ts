import { useMemo } from "react";
import { useExpenses, useMembers } from "@/hooks/use-data";
import { expenseTotals, filterExpenses, sortExpenses, type CategoryFilter } from "./model";

/** The ledger for one category filter: sorted rows plus totals across all categories. */
export function useExpenseLedger(filter: CategoryFilter) {
  const expenses = useExpenses();
  const { data: members = [] } = useMembers();
  const all = expenses.data;

  return useMemo(() => {
    const sorted = sortExpenses(all ?? []);
    return {
      all: sorted,
      rows: filterExpenses(sorted, filter),
      totals: expenseTotals(sorted),
      members,
      isPending: expenses.isPending,
      isError: expenses.isError,
      refetch: expenses.refetch,
    };
  }, [all, filter, members, expenses.isPending, expenses.isError, expenses.refetch]);
}
