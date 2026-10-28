import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  useAddExpense,
  useCurrentMember,
  useExpenses,
  useMembers,
  useUpdateExpense,
} from "@/hooks/use-data";
import {
  categoryFields,
  categoryKeyOf,
  customCategoryKeys,
  customKeyFor,
  type CategoryKey,
} from "@/lib/categories";
import { isoDate } from "@/lib/format";
import { newId } from "@/lib/id";
import { ValidationError, expenseSchema, fieldErrors, type ErrKey } from "@/lib/validation";
import type { ExpenseRecord } from "@/types/domain";
import { approversOf, defaultApprover } from "./model";

/** Form fields in focus order; ids are `expense-<field>`. */
export const EXPENSE_FIELDS = [
  "category_name",
  "title",
  "amount",
  "paid_to",
  "date",
  "authorized_by_id",
] as const;
export type ExpenseField = (typeof EXPENSE_FIELDS)[number];

interface Values {
  category: CategoryKey;
  /** "+ Other" chosen: a new category name is being typed. */
  other: boolean;
  otherName: string;
  title: string;
  /** Raw digits as typed; converted on validation. */
  amount: string;
  paid_to: string;
  date: string;
  authorized_by_id: string;
}

const blank = (category: CategoryKey): Values => ({
  category,
  other: false,
  otherName: "",
  title: "",
  amount: "",
  paid_to: "",
  date: isoDate(),
  authorized_by_id: "",
});

const fromExpense = (e: ExpenseRecord): Values => ({
  category: categoryKeyOf(e),
  other: false,
  otherName: "",
  title: e.title,
  amount: String(e.amount),
  paid_to: e.paid_to,
  date: e.date,
  authorized_by_id: e.authorized_by_id,
});

/**
 * State, validation and submit for the expense form (Story 3.1): adding, or correcting one
 * before the lock (`editing`). Field rules are the same zod schema api.ts enforces;
 * server-side errors map back onto the field they name.
 */
export function useExpenseForm({
  category,
  editing,
  onSaved,
}: {
  category: CategoryKey;
  editing?: ExpenseRecord | undefined;
  onSaved: (e: ExpenseRecord) => void;
}) {
  const { data: members = [] } = useMembers();
  const { data: expenses = [] } = useExpenses();
  const me = useCurrentMember();
  const addExpense = useAddExpense();
  const updateExpense = useUpdateExpense();
  const [values, setValues] = useState<Values>(() =>
    editing ? fromExpense(editing) : blank(category),
  );
  const [voucher, setVoucher] = useState<Blob | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<{ field: string; key: ErrKey } | null>(null);
  // Client-generated id = idempotency key: a retry or double tap can't save twice.
  const idRef = useRef<string | null>(null);
  const saving = addExpense.isPending || updateExpense.isPending;

  const approvers = useMemo(() => approversOf(members), [members]);
  const customKeys = useMemo(() => customCategoryKeys(expenses), [expenses]);
  const fallbackApprover = defaultApprover(members, me)?.id ?? "";
  const authorized_by_id = values.authorized_by_id || fallbackApprover;

  // Opening the form from a filtered list preselects that category.
  useEffect(() => {
    if (!editing) setValues((v) => ({ ...v, category }));
  }, [category, editing]);

  const key = values.other ? customKeyFor(values.otherName, customKeys) : values.category;
  const fields = values.other
    ? { category: "misc" as const, category_name: values.otherName }
    : categoryFields(key);
  const input = {
    ...fields,
    title: values.title,
    paid_to: values.paid_to,
    date: values.date,
    id: idRef.current ?? "pending",
    amount: values.amount ? Number(values.amount) : NaN,
    authorized_by_id,
  };
  const errors: Partial<Record<ExpenseField, ErrKey>> = {
    ...fieldErrors(expenseSchema, input),
    ...(values.other && values.otherName.trim().length < 2
      ? { category_name: "err_categoryName" as const }
      : {}),
  };
  const error = (f: ExpenseField): ErrKey | undefined =>
    (submitted ? errors[f] : undefined) ?? (serverErr?.field === f ? serverErr.key : undefined);

  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [k]: value }));
    if (serverErr?.field === k) setServerErr(null);
  };
  /** Picks a category chip; "+ Other" opens the name field instead. */
  const pick = (next: CategoryKey | "other") =>
    setValues((v) =>
      next === "other" ? { ...v, other: true } : { ...v, category: next, other: false },
    );

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (saving) return;
    setSubmitted(true);
    const first = EXPENSE_FIELDS.find((f) => errors[f]);
    if (first) return document.getElementById(`expense-${first}`)?.focus();
    setServerErr(null);
    // A typed name that matches an existing own category reuses its spelling.
    const stored = { ...input, ...categoryFields(key) };
    try {
      if (editing) {
        const { id: _id, ...edit } = stored;
        onSaved(await updateExpense.mutateAsync({ ...edit, id: editing.id }));
        return;
      }
      idRef.current ??= newId();
      const saved = await addExpense.mutateAsync({ ...stored, id: idRef.current, voucher });
      idRef.current = null;
      setValues(blank(values.other ? key : values.category));
      setVoucher(null);
      setSubmitted(false);
      onSaved(saved);
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      setServerErr({ field: ex.field, key: ex.key });
    }
  };

  return {
    values: { ...values, authorized_by_id },
    set,
    pick,
    customKeys,
    voucher,
    setVoucher,
    approvers,
    error,
    /** An error that belongs to no field (e.g. the expense got locked meanwhile). */
    formError:
      serverErr &&
      !EXPENSE_FIELDS.includes(serverErr.field as ExpenseField) &&
      serverErr.field !== "voucher"
        ? serverErr.key
        : undefined,
    /** Error for the photo itself (e.g. rejected by the store). */
    voucherError: serverErr?.field === "voucher" ? serverErr.key : undefined,
    submit,
    saving,
  };
}
