// Shared validation for forms and the service layer. Messages are i18n keys so the
// same rule shows in Bengali or English, and the Laravel API can return the same keys.
import { z } from "zod";
import type { TKey } from "./i18n";
import { isoDate } from "./format";

export type ErrKey = Extract<TKey, `err_${string}`>;
const m = (message: ErrKey) => ({ message });

export const TARGET_MIN = 1_000;
export const TARGET_MAX = 100_000_000; // ₹10 crore
export const AMOUNT_MAX = 1_000_000; // ₹10 lakh per receipt
/** Stored voucher photos are compressed on the device first; this guards the store. */
export const VOUCHER_MAX_BYTES = 1_500_000;

/** Strip spaces, dashes and a leading +91 / 0 so pasted numbers still validate. */
export function normalizePhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d.slice(0, 10);
}

export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, m("err_phone"));
/** OTP of `length` digits: 4 for the device-only mock, 6 for Supabase Auth (cloud mode). */
export const otpSchemaFor = (length: number) =>
  z.string().regex(new RegExp(`^\\d{${length}}$`), m("err_otp"));
export const otpSchema = otpSchemaFor(4);

const personName = z
  .string()
  .trim()
  .min(1, m("err_required"))
  .min(2, m("err_nameShort"))
  .max(80, m("err_tooLong"));

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
  // Whoever creates the club becomes its first admin, so it can collect and approve at once.
  creator_name: personName,
  creator_phone: phoneSchema,
});
export type ClubInput = z.infer<typeof clubSchema>;

export const amountSchema = z
  .number({ invalid_type_error: "err_amount" })
  .int(m("err_amount"))
  .min(1, m("err_amount"))
  .max(AMOUNT_MAX, m("err_amount"));

const optionalPhone = z
  .string()
  .optional()
  .refine((v) => !v || phoneSchema.safeParse(v).success, m("err_phone"));

export const householdSchema = z.object({
  resident_name: z
    .string()
    .trim()
    .min(1, m("err_residentName"))
    .min(2, m("err_nameShort"))
    .max(80, m("err_tooLong")),
  // Optional (UAT 2026-10-28): many households have no flat or house number.
  house_flat_no: z.string().trim().max(20, m("err_tooLong")).optional().default(""),
  lane_block: z.string().trim().min(1, m("err_lane")).max(60, m("err_tooLong")),
  // Phone is optional for a household, but must be a valid mobile when given.
  phone_number: optionalPhone,
});
export type HouseholdInput = z.input<typeof householdSchema>;

const id = z.string().min(1, m("err_required"));

/** New chanda entries are collected or promised; 'void' only comes from voidChanda(). */
export const chandaSchema = z.object({
  id,
  household_id: z.string().min(1, m("err_household")),
  amount: amountSchema,
  payment_method: z.enum(["cash", "upi"]),
  status: z.enum(["collected", "promised"]),
  collector_id: z.string().min(1, m("err_collector")),
});
export type ChandaInput = z.infer<typeof chandaSchema>;

export const expenseSchema = z.object({
  id,
  category: z.enum(["pandal", "idol", "lighting", "bhog", "cultural", "misc"]),
  /** The club's own category (stored with category "misc"); empty for a built-in one. */
  category_name: z
    .string()
    .trim()
    .transform((s) => s.replace(/\s+/g, " "))
    .refine((s) => s === "" || s.length >= 2, m("err_categoryName"))
    .refine((s) => s.length <= 40, m("err_tooLong"))
    .optional()
    .nullable(),
  title: z.string().trim().min(1, m("err_required")).max(120, m("err_tooLong")),
  amount: amountSchema,
  paid_to: z.string().trim().min(1, m("err_required")).max(80, m("err_tooLong")),
  authorized_by_id: z.string().min(1, m("err_authorizer")),
  voucher_image_id: z.string().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, m("err_date"))
    .refine((v) => !Number.isNaN(Date.parse(v)), m("err_date"))
    // ISO dates compare correctly as strings; "today" is the device's local date.
    .refine((v) => v <= isoDate(), m("err_dateFuture")),
});
export type ExpenseInput = z.input<typeof expenseSchema>;

/** Correcting an expense: the same fields, without the id or the photo. */
export const expenseEditSchema = expenseSchema.omit({ id: true, voucher_image_id: true });
export type ExpenseEditInput = z.input<typeof expenseEditSchema>;

/** User-entered event: one title as typed (stored in both language slots, like club names). */
const eventTitle = z
  .string()
  .trim()
  .min(1, m("err_required"))
  .min(2, m("err_nameShort"))
  .max(80, m("err_tooLong"));
const eventDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, m("err_date"))
  .refine((v) => !Number.isNaN(Date.parse(v)), m("err_date"));
export const eventSchema = z.object({
  title: eventTitle,
  // New events are planned ahead; a past date is almost always a typo.
  date: eventDate.refine((v) => v >= isoDate(), m("err_eventPast")),
});
export type EventInput = z.infer<typeof eventSchema>;

/** Editing an event: a new date must be today or later; its current date may stay. */
export const eventEditSchema = (currentDate: string) =>
  z.object({
    title: eventTitle,
    date: eventDate.refine((v) => v === currentDate || v >= isoDate(), m("err_eventPast")),
  });

/** A collector hands cash to the treasurer/admin recording it (SPEC 6.3). */
export const handoverSchema = z.object({
  id,
  collector_id: z.string().min(1, m("err_collector")),
  amount: amountSchema,
});
export type HandoverInput = z.infer<typeof handoverSchema>;

export const memberSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, m("err_memberName"))
    .min(2, m("err_nameShort"))
    .max(80, m("err_tooLong")),
  phone: phoneSchema,
  role: z.enum(["admin", "treasurer", "collector"]),
});
export type MemberInput = z.infer<typeof memberSchema>;

/** Settings → Help: what it's about and what happened, in the member's words. */
export const helpSchema = z.object({
  id,
  category: z.enum(["login", "sync", "device", "entry", "other"], {
    errorMap: () => m("err_ticketCategory"),
  }),
  message: z.string().trim().min(10, m("err_ticketMessage")).max(1000, m("err_tooLong")),
  include_diagnostics: z.boolean(),
});
export type HelpInput = z.infer<typeof helpSchema>;

export const rejectReasonSchema = z
  .string()
  .trim()
  .min(3, m("err_rejectReason"))
  .max(200, m("err_tooLong"));

export const voidReasonSchema = z
  .string()
  .trim()
  .min(3, m("err_voidReason"))
  .max(200, m("err_tooLong"));

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
