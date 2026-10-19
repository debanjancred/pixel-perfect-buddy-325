import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { ValidationError, check, voidReasonSchema, type ErrKey } from "@/lib/validation";
import { FieldError, Label, Modal, Spinner } from "./ui";

/**
 * SPEC Story 2.3: voiding needs a reason and never deletes — the entry stays in the
 * ledger struck through and stops counting. Used for chanda, expenses and handovers.
 */
export function VoidDialog({
  summary,
  onVoid,
  onClose,
}: {
  /** What is being voided, e.g. "PK-2026-C01-0003 · ₹১,০০১". */
  summary: string;
  onVoid: (reason: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState<ErrKey | null>(null);
  const error = (submitted ? check(voidReasonSchema, reason) : null) ?? serverErr;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (check(voidReasonSchema, reason)) return document.getElementById("void-reason")?.focus();
    setBusy(true);
    try {
      await onVoid(reason.trim());
      onClose();
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      setServerErr(ex.key);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t("voidTitle")}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="rounded-xl bg-muted p-3 font-mono text-sm font-bold">{summary}</p>
        <p className="text-sm text-muted-foreground">{t("voidHint")}</p>
        <div>
          <Label htmlFor="void-reason">{t("voidReasonLabel")}</Label>
          <textarea
            id="void-reason"
            className="field min-h-24 py-3"
            maxLength={200}
            value={reason}
            aria-invalid={!!error}
            aria-describedby={error ? "void-reason-error" : undefined}
            onChange={(e) => {
              setReason(e.target.value);
              setServerErr(null);
            }}
          />
          <FieldError id="void-reason-error" error={error} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>
            {busy && <Spinner />}
            {t("void")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
