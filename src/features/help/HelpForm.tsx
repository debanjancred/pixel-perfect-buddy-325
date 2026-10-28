import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { newId } from "@/lib/id";
import { useSubmitHelpRequest } from "@/hooks/use-data";
import { FieldError, Label, Spinner, Switch } from "@/components/pk/ui";
import { ValidationError, fieldErrors, helpSchema, type ErrKey } from "@/lib/validation";
import type { SupportCategory } from "@/types/domain";
import { HELP_CATEGORIES } from "./model";

/** Report a problem: category, message and (by default) device details. Shown in a sheet. */
export function HelpForm({ onSent }: { onSent?: () => void }) {
  const { t } = useI18n();
  const submit = useSubmitHelpRequest();
  // One id per draft, so a double tap or a retry sends the same request once.
  const [id, setId] = useState(newId);
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<ErrKey | null>(null);
  const v = { id, category, message, include_diagnostics: details };
  const errors = fieldErrors(helpSchema, v);
  const shown = (f: "category" | "message") => (submitted ? errors[f] : undefined);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (submit.isPending) return;
    setSubmitted(true);
    if (errors.category) return document.getElementById("help-category-0")?.focus();
    if (errors.message) return document.getElementById("help-message")?.focus();
    try {
      const ticket = await submit.mutateAsync({ ...v, category: category! });
      toast.success(t(ticket.sync_status === "synced" ? "helpSent" : "helpQueued"));
      setId(newId());
      setCategory(null);
      setMessage("");
      setSubmitted(false);
      onSent?.();
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      setServerErr(ex.key);
    }
  };

  return (
    <form className="space-y-4" onSubmit={send} noValidate>
      <fieldset aria-describedby={shown("category") ? "help-category-error" : undefined}>
        <legend className="mb-2 block text-sm font-semibold text-muted-foreground">
          {t("helpCategory")}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {HELP_CATEGORIES.map((c, i) => (
            <button
              key={c}
              id={`help-category-${i}`}
              type="button"
              className={`chip px-2 text-sm ${c === "other" ? "col-span-2" : ""}`}
              data-active={category === c}
              aria-pressed={category === c}
              onClick={() => {
                setCategory(c);
                setServerErr(null);
              }}
            >
              {t(`help_cat_${c}`)}
            </button>
          ))}
        </div>
        <FieldError id="help-category-error" error={shown("category")} />
      </fieldset>
      <div>
        <Label htmlFor="help-message">{t("helpMessage")}</Label>
        <textarea
          id="help-message"
          className="field min-h-32 py-3"
          maxLength={1000}
          placeholder={t("helpMessageHint")}
          value={message}
          aria-invalid={!!shown("message")}
          aria-describedby={shown("message") ? "help-message-error" : undefined}
          onChange={(e) => {
            setMessage(e.target.value);
            setServerErr(null);
          }}
        />
        <FieldError id="help-message-error" error={shown("message")} />
      </div>
      <div className="flex items-center gap-3 rounded-2xl border p-3">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t("helpIncludeDetails")}</div>
          <p className="text-xs text-muted-foreground">{t("helpDetailsHint")}</p>
        </div>
        <Switch label={t("helpIncludeDetails")} on={details} set={setDetails} />
      </div>
      <FieldError id="help-server-error" error={serverErr} />
      <button
        type="submit"
        className="btn btn-gold w-full"
        disabled={submit.isPending}
        aria-busy={submit.isPending}
      >
        {submit.isPending ? <Spinner /> : <Send className="h-5 w-5" aria-hidden />} {t("helpSend")}
      </button>
    </form>
  );
}
