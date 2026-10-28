// Role permissions (SPEC Story 6.2), shared by the UI (to hide actions) and api.ts (to
// refuse them). Pure, so the Laravel policies can be checked against the same table.
import type { ClubMember, UserRole } from "@/types/domain";

export type Permission =
  | "chanda.add" // collect chanda, add households
  | "expense.add"
  | "entry.void" // void chanda, expenses and handovers
  | "handover.record" // receive cash from a collector
  | "member.manage"
  | "event.manage"
  | "data.export"; // download the ledgers (Settings → Export)

const ALL: readonly Permission[] = [
  "chanda.add",
  "expense.add",
  "entry.void",
  "handover.record",
  "member.manage",
  "event.manage",
  "data.export",
];

/**
 * SPEC: collectors add chanda; treasurers add expenses and void; admins do everything.
 * Deliberate extra: every role may collect chanda (a treasurer taking cash at the door is
 * normal and low-risk). Treasurers also receive handovers, which Story 6.3 implies, and
 * export the ledgers (UAT 2026-10-28: collectors don't).
 */
export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  admin: ALL,
  treasurer: ["chanda.add", "expense.add", "entry.void", "handover.record", "data.export"],
  collector: ["chanda.add"],
};

export const can = (member: Pick<ClubMember, "role"> | null | undefined, p: Permission) =>
  !!member && ROLE_PERMISSIONS[member.role].includes(p);
