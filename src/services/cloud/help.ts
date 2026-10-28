// Help requests (…_support_tickets.sql): row-level security returns only the signed-in
// person's own requests; they are created through submit_support_ticket (sync adapter).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportTicket } from "@/types/domain";

/** This person's requests in a club, as the server has them (status, staff note). */
export async function fetchMyTickets(
  client: SupabaseClient,
  clubId: string,
): Promise<Omit<SupportTicket, "sync_status">[]> {
  const { data, error } = await client
    .from("support_tickets")
    .select(
      "id, club_id, category, message, diagnostics, status, staff_note, created_at, closed_at",
    )
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as Omit<SupportTicket, "sync_status">[];
}
