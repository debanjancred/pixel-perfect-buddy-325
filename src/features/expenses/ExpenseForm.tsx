import { useI18n } from "@/lib/i18n";
import { CATEGORIES } from "@/lib/categories";
import { isoDate } from "@/lib/format";
import { FieldError, Label, Modal, Spinner, TextField } from "@/components/pk/ui";
import type { ExpenseCategory, ExpenseRecord } from "@/types/domain";
import { useExpenseForm } from "./use-expense-form";
import { VoucherPicker } from "./VoucherPicker";

/** Add-expense sheet (Story 3.1). All state and rules live in `useExpenseForm`. */
export function ExpenseForm({
  category,
  onClose,
  onSaved,
}: {
  category: ExpenseCategory;
  onClose: () => void;
  onSaved: (e: ExpenseRecord) => void;
}) {
  const { t } = useI18n();
  const form = useExpenseForm({ category, onSaved });
  const { values, set, error } = form;

  return (
    <Modal open onClose={onClose} title={t("addExpense")}>
      <form className="space-y-4" onSubmit={form.submit} noValidate>
        <fieldset>
          <legend className="mb-2 block text-sm font-semibold text-muted-foreground">
            {t("category")}
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {CATEGORIES.map((c) => (
              <button
                type="button"
                key={c.key}
                className="chip px-2 text-sm"
                data-active={values.category === c.key}
                aria-pressed={values.category === c.key}
                onClick={() => set("category", c.key)}
              >
                {c.emoji} {t(c.t)}
              </button>
            ))}
          </div>
        </fieldset>
        <TextField
          id="expense-title"
          label={t("itemName")}
          maxLength={120}
          value={values.title}
          error={error("title")}
          onChange={(e) => set("title", e.target.value)}
        />
        <TextField
          id="expense-amount"
          label={t("amount")}
          className="num text-xl font-bold"
          inputMode="numeric"
          placeholder="₹"
          value={values.amount}
          error={error("amount")}
          onChange={(e) => set("amount", e.target.value.replace(/\D/g, "").slice(0, 7))}
        />
        <TextField
          id="expense-paid_to"
          label={t("paidTo")}
          maxLength={80}
          value={values.paid_to}
          error={error("paid_to")}
          onChange={(e) => set("paid_to", e.target.value)}
        />
        <TextField
          id="expense-date"
          label={t("date")}
          type="date"
          value={values.date}
          max={isoDate()}
          error={error("date")}
          onChange={(e) => set("date", e.target.value)}
        />
        <div>
          <Label htmlFor="expense-authorized_by_id">{t("approvedBy")}</Label>
          <select
            id="expense-authorized_by_id"
            className="field"
            value={values.authorized_by_id}
            aria-invalid={!!error("authorized_by_id")}
            aria-describedby={
              error("authorized_by_id") ? "expense-authorized_by_id-error" : undefined
            }
            onChange={(e) => set("authorized_by_id", e.target.value)}
          >
            {form.approvers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {t(`role_${m.role}`)}
              </option>
            ))}
          </select>
          <FieldError id="expense-authorized_by_id-error" error={error("authorized_by_id")} />
        </div>
        <VoucherPicker value={form.voucher} onChange={form.setVoucher} error={form.voucherError} />
        <button
          type="submit"
          className="btn btn-primary w-full text-lg"
          disabled={form.saving}
          aria-busy={form.saving}
        >
          {form.saving && <Spinner />}
          {t("save")}
        </button>
      </form>
    </Modal>
  );
}
