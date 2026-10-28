import { useI18n } from "@/lib/i18n";
import { CATEGORIES, categoryInfo, type CategoryKey } from "@/lib/categories";
import { isoDate } from "@/lib/format";
import { FieldError, Label, Modal, Spinner, TextField } from "@/components/pk/ui";
import type { ExpenseRecord } from "@/types/domain";
import { useExpenseForm } from "./use-expense-form";
import { VoucherPicker } from "./VoucherPicker";

/**
 * Add-expense sheet (Story 3.1), also used to correct an expense before the lock
 * (`editing`: fields pre-filled; the photo stays as it is). All state and rules live in
 * `useExpenseForm`.
 */
export function ExpenseForm({
  category,
  editing,
  onClose,
  onSaved,
}: {
  category: CategoryKey;
  editing?: ExpenseRecord | undefined;
  onClose: () => void;
  onSaved: (e: ExpenseRecord) => void;
}) {
  const { t } = useI18n();
  const form = useExpenseForm({ category, editing, onSaved });
  const { values, set, error } = form;
  const chips: CategoryKey[] = [...CATEGORIES.map((c) => c.key), ...form.customKeys];

  return (
    <Modal open onClose={onClose} title={t(editing ? "editExpense" : "addExpense")}>
      <form className="space-y-4" onSubmit={form.submit} noValidate>
        <fieldset>
          <legend className="mb-2 block text-sm font-semibold text-muted-foreground">
            {t("category")}
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {chips.map((k) => {
              const info = categoryInfo(k, t);
              const active = !values.other && values.category === k;
              return (
                <button
                  type="button"
                  key={k}
                  className="chip min-w-0 px-2 text-sm"
                  data-active={active}
                  aria-pressed={active}
                  onClick={() => form.pick(k)}
                >
                  <span className="truncate">
                    {info.emoji} {info.label}
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              className="chip px-2 text-sm"
              data-active={values.other}
              aria-pressed={values.other}
              onClick={() => form.pick("other")}
            >
              {t("catOther")}
            </button>
          </div>
        </fieldset>
        {values.other && (
          <TextField
            id="expense-category_name"
            label={t("categoryNameLabel")}
            placeholder={t("categoryNameHint")}
            maxLength={40}
            autoFocus
            value={values.otherName}
            error={error("category_name")}
            onChange={(e) => set("otherName", e.target.value)}
          />
        )}
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
        {!editing && (
          <VoucherPicker
            value={form.voucher}
            onChange={form.setVoucher}
            error={form.voucherError}
          />
        )}
        <FieldError id="expense-form-error" error={form.formError} />
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
