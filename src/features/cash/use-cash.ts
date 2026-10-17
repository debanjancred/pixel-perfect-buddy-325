import { useMemo } from "react";
import { useHandovers, useMembers, useTransactions } from "@/hooks/use-data";
import { cashByCollector } from "@/lib/accounts";

/** Cash position per collector plus handover history, from the cached collections. */
export function useCash() {
  const members = useMembers();
  const chanda = useTransactions();
  const handovers = useHandovers();
  return useMemo(() => {
    const list = members.data ?? [];
    const rows = cashByCollector(list, chanda.data ?? [], handovers.data ?? []).map((r) => ({
      ...r,
      member: list.find((m) => m.id === r.member_id)!,
    }));
    return {
      rows,
      totalOutstanding: rows.reduce((s, r) => s + Math.max(0, r.outstanding), 0),
      handovers: handovers.data ?? [],
      members: list,
      isPending: members.isPending || chanda.isPending || handovers.isPending,
    };
  }, [
    members.data,
    chanda.data,
    handovers.data,
    members.isPending,
    chanda.isPending,
    handovers.isPending,
  ]);
}
