// Shared validation for forms and the service layer. Messages are i18n keys so the
// same rule shows in Bengali or English, and the Laravel API can return the same keys.
import { z } from "zod";
import type { TKey } from "./i18n";

export type ErrKey = Extract<TKey, `err_${string}`>;
const m = (message: ErrKey) => ({ message });

export const TARGET_MIN = 1_000;
export const TARGET_MAX = 100_000_000; // ₹10 crore
export const AMOUNT_MAX = 1_000_000; // ₹10 lakh per receipt

/** Strip spaces, dashes and a leading +91 / 0 so pasted numbers still validate. */
export function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d.slice(0, 10);
}

export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, m("err_phone"));
export const otpSchema = z.string().regex(/^\d{4}$/, m("err_otp"));

export const clubSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, m("err_required"))
    .min(3, m("err_clubNameShort"))
    .max(80, m("err_tooLong")),
  para: z.string().trim().max(60, m("err_tooLong")),
  zone: z.string().trim().max(40, m("err_tooLong")),
  puja_year: z.number().int().min(2000).max(2100),
  target_amount: z
    .number({ invalid_type_error: "err_target" })
    .int(m("err_target"))
    .min(TARGET_MIN, m("err_target"))
    .max(TARGET_MAX, m("err_target")),
});
export type ClubInput = z.infer<typeof clubSchema>;

export const amountSchema = z
  .number({ invalid_type_error: "err_amount" })
  .int(m("err_amount"))
  .min(1, m("err_amount"))
  .max(AMOUNT_MAX, m("err_amount"));

export const householdSchema = z.object({
  resident_name: z
    .string()
    .trim()
    .min(1, m("err_required"))
    .min(2, m("err_nameShort"))
    .max(80, m("err_tooLong")),
  house_no: z.string().trim().min(1, m("err_required")).max(20, m("err_tooLong")),
  lane_bn: z.string().trim().min(1, m("err_required")),
  lane_en: z.string().trim().min(1, m("err_required")),
  // Phone is optional for a household, but must be a valid mobile when given.
  phone: z.string().refine((v) => v === "" || phoneSchema.safeParse(v).success, m("err_phone")),
  pledged_amount: amountSchema,
});
export type HouseholdInput = z.infer<typeof householdSchema>;

export const chandaSchema = z.object({
  household_id: z.string().nullable(),
  payer_name: z.string().trim().min(1, m("err_required")).max(80, m("err_tooLong")),
  amount: amountSchema,
  payment_mode: z.enum(["cash", "upi"]),
  collector_id: z.string().min(1, m("err_collector")),
});
export type ChandaInput = z.infer<typeof chandaSchema>;

/** Club names compare case- and space-insensitively. */
export const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

export class ValidationError extends Error {
  field: string;
  key: ErrKey;
  constructor(field: string, key: ErrKey) {
    super(key);
    this.name = "ValidationError";
    this.field = field;
    this.key = key;
  }
}

/** Parse in the service layer, throwing the first issue as a ValidationError. */
export function parseOrThrow<S extends z.ZodTypeAny>(schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  const issue = r.error.issues[0]!;
  throw new ValidationError(String(issue.path[0] ?? ""), issue.message as ErrKey);
}

/** First error key for a single value, or null when valid. */
export function check(schema: z.ZodTypeAny, value: unknown): ErrKey | null {
  const r = schema.safeParse(value);
  return r.success ? null : (r.error.issues[0]!.message as ErrKey);
}

/** First error key per field of an object schema. */
export function fieldErrors<S extends z.AnyZodObject>(schema: S, value: unknown) {
  type Field = keyof z.infer<S> & string;
  const r = schema.safeParse(value);
  const out: Partial<Record<Field, ErrKey>> = {};
  if (!r.success)
    for (const i of r.error.issues) out[String(i.path[0]) as Field] ??= i.message as ErrKey;
  return out;
}
