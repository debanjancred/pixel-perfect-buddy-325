// Fetching what other devices sent (cloud mode). Row-level security returns only clubs the
// signed-in user belongs to; `since` makes repeat pulls incremental.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Snapshot } from "./merge";

const TABLES = {
  members: "club_members",
  households: "households",
  chanda: "chanda_transactions",
  expenses: "expense_records",
  handovers: "cash_handovers",
  events: "club_events",
} as const;

async function rows<T>(query: PromiseLike<{ data: unknown[] | null; error: unknown }>) {
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as T[];
}

/** The user's clubs and their members (enough for the club picker and permissions). */
export async function fetchMyClubs(client: SupabaseClient): Promise<Snapshot> {
  const clubs = await rows<Snapshot["clubs"][number]>(client.from("clubs").select("*"));
  const members = clubs.length
    ? await rows<Snapshot["members"][number]>(
        client
          .from("club_members")
          .select("*")
          .in(
            "club_id",
            clubs.map((c) => c.id),
          ),
      )
    : [];
  return { clubs, members, households: [], chanda: [], expenses: [], handovers: [], events: [] };
}

/** Everything in one club changed after `since` (all of it on the first pull). */
export async function fetchClubSnapshot(
  client: SupabaseClient,
  clubId: string,
  since?: string,
): Promise<Snapshot> {
  const changed = (table: string) => {
    let q = client.from(table).select("*").eq("club_id", clubId);
    if (since) q = q.gt("updated_at", since);
    return rows<never>(q);
  };
  const clubQuery = client.from("clubs").select("*").eq("id", clubId);
  const [clubs, members, households, chanda, expenses, handovers, events] = await Promise.all([
    rows<Snapshot["clubs"][number]>(since ? clubQuery.gt("updated_at", since) : clubQuery),
    changed(TABLES.members),
    changed(TABLES.households),
    changed(TABLES.chanda),
    changed(TABLES.expenses),
    changed(TABLES.handovers),
    changed(TABLES.events),
  ]);
  return { clubs, members, households, chanda, expenses, handovers, events };
}

export async function downloadVoucher(client: SupabaseClient, path: string) {
  const { data, error } = await client.storage.from("vouchers").download(path);
  if (error) return null;
  return data;
}

export async function fetchPublicAccounts(client: SupabaseClient, slug: string) {
  const { data, error } = await client.rpc("public_accounts", { p_slug: slug });
  if (error) throw error;
  return data as null | {
    club: {
      slug: string;
      name_bn: string;
      name_en: string;
      area_label: string;
      puja_year: number;
      target_amount: number;
    };
    summary: import("@/types/domain").AccountsSummary;
    expenses_by_category: { category: import("@/types/domain").ExpenseCategory; total: number }[];
  };
}
