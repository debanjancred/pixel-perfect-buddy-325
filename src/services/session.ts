// Who is using the app on this device. Lives in the service layer (with api.ts) because
// the api must know the acting member to enforce permissions — exactly what the Laravel
// API will do with its auth token later.
import { z } from "zod";
import { phoneSchema } from "@/lib/validation";

const KEY = "pk_session_v1";

const sessionSchema = z.union([
  // Demo: acts as `member_id` of the sample club (the sample collector when unset).
  z.object({ mode: z.literal("demo"), member_id: z.string().optional() }),
  z.object({ mode: z.literal("user"), phone: phoneSchema }),
]);
export type Session = z.infer<typeof sessionSchema>;

export const session = {
  /** Returns null for a missing or tampered session so guards treat it as logged out. */
  get(): Session | null {
    try {
      const r = sessionSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? "null"));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  },
  set(s: Session) {
    localStorage.setItem(KEY, JSON.stringify(sessionSchema.parse(s)));
  },
  clear() {
    localStorage.removeItem(KEY);
  },
};
