import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { Modal, TextField } from "@/components/pk/ui";
import { useCreateHandover } from "@/hooks/use-data";
import { ValidationError, amountSchema, check, type ErrKey } from "@/lib/validation";
import type { CashHandover, ClubMember } from "@/types/domain";

/** Receive cash from one collector; the amount defaults to everything they hold. */
export function HandoverForm({
  collector,
  outstanding,
  onClose,
  onSaved,
}: {
  collector: ClubMember;
  outstanding: number;
  onClose: () => void;
  onSaved: (h: CashHandover) => void;
}) {
  const { t, money } = useI18n();
  const create = useCreateHandover();
  const [amount, setAmount] = useState(String(outstanding));
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<ErrKey | null>(null);
  // Client id = idempotency key, so a double tap can't record the handover twice.
  const [id] = useState(() => crypto.randomUUID());
  const value = amount ? Number(amount) : NaN;
  const localErr =
    check(amountSchema, value) ?? (value > outstanding ? "err_handoverTooMuch" : null);
  const error = (submitted ? localErr : null) ?? serverErr;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (localErr || create.isPending) return document.getElementById("handover-amount")?.focus();
    try {
      onSaved(await create.mutateAsync({ id, collector_id: collector.id, amount: value }));
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      setServerErr(ex.key);
    }
  };

  return (
    <Modal open onClose={onClose} title={t("handoverFrom", { name: collector.name })}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <p className="text-sm text-muted-foreground">
          {t("outstanding")}:{" "}
          <span className="num font-bold text-foreground">{money(outstanding)}</span>
        </p>
        <TextField
          id="handover-amount"
          label={t("amount")}
          className="num text-xl font-bold"
          inputMode="numeric"
          value={amount}
          error={error}
          onChange={(e) => {
            setAmount(e.target.value.replace(/\D/g, "").slice(0, 7));
            setServerErr(null);
          }}
        />
        <button
          type="submit"
          className="btn btn-primary w-full text-lg"
          disabled={create.isPending}
        >
          {t("receiveCash")}
        </button>
      </form>
    </Modal>
  );
}
