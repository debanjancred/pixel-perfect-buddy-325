// Public surface of the help module (ADR 0002 §7): Settings → Help, cloud mode. Server side:
// supabase/migrations/…_support_tickets.sql.
export { HelpSection } from "./HelpSection";
export { HELP_CATEGORIES, helpStatus, type HelpStatus } from "./model";
