import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { ZodType } from "zod";
import { useI18n, type TKey } from "@/lib/i18n";
import { usePermission } from "@/hooks/use-data";
import { ValidationError, check, voidReasonSchema, type ErrKey } from "@/lib/validation";
import { FieldError, Label, Modal, Spinner } from "./ui";

/**
 * A short form that asks for a reason before an action: voiding, rejecting an entry,
 * declining a void request. Server refusals (ValidationError) show under the field.
 */
export function ReasonDialog({
  summary,
  title,
  hint,
  label,
  submit: submitLabel,
  schema,
  onSubmit,
  onClose,
}: {
  summary: string;
  title: TKey;
  hint: TKey;
  label: TKey;
  submit: TKey;
  schema: ZodType<string>;
  onSubmit: (reason: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState<ErrKey | null>(null);
  const error = (submitted ? check(schema, reason) : null) ?? serverErr;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (check(schema, reason)) return document.getElementById("void-reason")?.focus();
    setBusy(true);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      setServerErr(ex.key);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={t(title)}>
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="rounded-xl bg-muted p-3 font-mono text-sm font-bold">{summary}</p>
        <p className="text-sm text-muted-foreground">{t(hint)}</p>
        <div>
          <Label htmlFor="void-reason">{t(label)}</Label>
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
            {t(submitLabel)}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * SPEC Story 2.3: voiding needs a reason and never deletes — the entry stays in the
 * ledger struck through and stops counting. Used for chanda, expenses and handovers.
 * Only an admin voids; for anyone else this sends a request the admin decides (ADR 0003).
 */
export function VoidDialog({
  summary,
  onVoid,
  onClose,
}: {
  /** What is being voided, e.g. "PK-2026-C01-0003 · ₹১,০০১". */
  summary: string;
  /** Returns the entry as saved: voided at once, or with a void request on it. */
  onVoid: (reason: string) => Promise<{ voided_at?: string | null }>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const admin = usePermission("entry.approve");
  return (
    <ReasonDialog
      summary={summary}
      title={admin ? "voidTitle" : "voidRequestTitle"}
      hint={admin ? "voidHint" : "voidRequestHint"}
      label="voidReasonLabel"
      submit={admin ? "void" : "sendRequest"}
      schema={voidReasonSchema}
      onClose={onClose}
      onSubmit={async (reason) => {
        const rec = await onVoid(reason);
        toast.success(t(rec.voided_at ? "voided" : "voidRequestSent"));
      }}
    />
  );
}
