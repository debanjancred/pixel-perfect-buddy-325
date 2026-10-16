import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { isoDate } from "@/lib/format";
import { Modal, TextField } from "@/components/pk/ui";
import { useCreateEvent } from "@/hooks/use-data";
import { ValidationError, eventSchema, fieldErrors, type ErrKey } from "@/lib/validation";
import type { ClubEvent } from "@/types/domain";

const FIELDS = ["title", "date"] as const;

/** Add-event sheet: a name as typed and a date from today on. */
export function EventForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (e: ClubEvent) => void;
}) {
  const { t } = useI18n();
  const create = useCreateEvent();
  const [values, setValues] = useState({ title: "", date: isoDate() });
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<{ field: string; key: ErrKey } | null>(null);

  const errors = fieldErrors(eventSchema, values);
  const error = (f: (typeof FIELDS)[number]) =>
    (submitted ? errors[f] : undefined) ?? (serverErr?.field === f ? serverErr.key : undefined);
  const set = (patch: Partial<typeof values>) => {
    setValues((v) => ({ ...v, ...patch }));
    setServerErr(null);
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (create.isPending) return;
    setSubmitted(true);
    const first = FIELDS.find((f) => errors[f]);
    if (first) return document.getElementById(`event-${first}`)?.focus();
    try {
      onSaved(await create.mutateAsync(values));
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      setServerErr({ field: ex.field, key: ex.key });
    }
  };

  return (
    <Modal open onClose={onClose} title={t("addEvent")}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <TextField
          id="event-title"
          label={t("eventTitle")}
          maxLength={80}
          value={values.title}
          error={error("title")}
          onChange={(e) => set({ title: e.target.value })}
        />
        <TextField
          id="event-date"
          label={t("date")}
          type="date"
          min={isoDate()}
          value={values.date}
          error={error("date")}
          onChange={(e) => set({ date: e.target.value })}
        />
        <button
          type="submit"
          className="btn btn-primary w-full text-lg"
          disabled={create.isPending}
        >
          {t("save")}
        </button>
      </form>
    </Modal>
  );
}
