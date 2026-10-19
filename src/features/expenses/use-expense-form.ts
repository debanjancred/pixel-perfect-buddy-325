import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAddExpense, useCurrentMember, useMembers } from "@/hooks/use-data";
import { isoDate } from "@/lib/format";
import { newId } from "@/lib/id";
import { ValidationError, expenseSchema, fieldErrors, type ErrKey } from "@/lib/validation";
import type { ExpenseCategory, ExpenseRecord } from "@/types/domain";
import { approversOf, defaultApprover } from "./model";

/** Form fields in focus order; ids are `expense-<field>`. */
export const EXPENSE_FIELDS = ["title", "amount", "paid_to", "date", "authorized_by_id"] as const;
export type ExpenseField = (typeof EXPENSE_FIELDS)[number];

interface Values {
  category: ExpenseCategory;
  title: string;
  /** Raw digits as typed; converted on validation. */
  amount: string;
  paid_to: string;
  date: string;
  authorized_by_id: string;
}

const blank = (category: ExpenseCategory): Values => ({
  category,
  title: "",
  amount: "",
  paid_to: "",
  date: isoDate(),
  authorized_by_id: "",
});

/**
 * State, validation and submit for the add-expense form (Story 3.1). Field rules are the
 * same zod schema api.ts enforces; server-side errors map back onto the field they name.
 */
export function useExpenseForm({
  category,
  onSaved,
}: {
  category: ExpenseCategory;
  onSaved: (e: ExpenseRecord) => void;
}) {
  const { data: members = [] } = useMembers();
  const me = useCurrentMember();
  const addExpense = useAddExpense();
  const [values, setValues] = useState<Values>(() => blank(category));
  const [voucher, setVoucher] = useState<Blob | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<{ field: string; key: ErrKey } | null>(null);
  // Client-generated id = idempotency key: a retry or double tap can't save twice.
  const idRef = useRef<string | null>(null);

  const approvers = useMemo(() => approversOf(members), [members]);
  const fallbackApprover = defaultApprover(members, me)?.id ?? "";
  const authorized_by_id = values.authorized_by_id || fallbackApprover;

  // Opening the form from a filtered list preselects that category.
  useEffect(() => setValues((v) => ({ ...v, category })), [category]);

  const input = {
    ...values,
    id: idRef.current ?? "pending",
    amount: values.amount ? Number(values.amount) : NaN,
    authorized_by_id,
  };
  const errors = fieldErrors(expenseSchema, input);
  const error = (f: ExpenseField): ErrKey | undefined =>
    (submitted ? errors[f] : undefined) ?? (serverErr?.field === f ? serverErr.key : undefined);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (serverErr?.field === key) setServerErr(null);
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (addExpense.isPending) return;
    setSubmitted(true);
    const first = EXPENSE_FIELDS.find((f) => errors[f]);
    if (first) return document.getElementById(`expense-${first}`)?.focus();
    setServerErr(null);
    idRef.current ??= newId();
    try {
      const saved = await addExpense.mutateAsync({ ...input, id: idRef.current, voucher });
      idRef.current = null;
      setValues(blank(values.category));
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
    voucher,
    setVoucher,
    approvers,
    error,
    /** Error for the photo itself (e.g. rejected by the store). */
    voucherError: serverErr?.field === "voucher" ? serverErr.key : undefined,
    submit,
    saving: addExpense.isPending,
  };
}
