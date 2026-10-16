import { useMemo } from "react";
import { useClub, useHouseholds, useMembers, useTransactions } from "@/hooks/use-data";
import { toReceipt, type Receipt } from "./model";

/**
 * Resolves a receipt by chanda id from the cached collections. Works the same right after
 * saving (mutations refetch before resolving) and when re-opened later from a link.
 */
export function useReceipt(transactionId: string | null | undefined): {
  receipt: Receipt | null;
  isPending: boolean;
} {
  const club = useClub();
  const households = useHouseholds();
  const members = useMembers();
  const transactions = useTransactions();
  const isPending = [club, households, members, transactions].some((q) => q.isPending);

  const receipt = useMemo(
    () =>
      transactionId
        ? toReceipt(
            transactions.data?.find((c) => c.id === transactionId),
            {
              club: club.data,
              households: households.data ?? [],
              members: members.data ?? [],
            },
          )
        : null,
    [transactionId, transactions.data, club.data, households.data, members.data],
  );

  return { receipt, isPending };
}
