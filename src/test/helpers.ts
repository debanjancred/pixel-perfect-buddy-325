import { api } from "@/services/api";
import { session } from "@/services/session";

/**
 * Seeds the sample club and acts as its admin. The demo itself acts as the collector
 * (SPEC 2.1), which may not void, add expenses, events or members.
 */
export async function seedAsAdmin() {
  await api.seedDemo();
  const admin = (await api.listMembers()).find((m) => m.role === "admin")!;
  session.set({ mode: "demo", member_id: admin.id });
  return admin;
}
