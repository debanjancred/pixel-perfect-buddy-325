import { useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { useCreateMember } from "@/hooks/use-data";
import { Spinner, TextField } from "@/components/pk/ui";
import {
  ValidationError,
  fieldErrors,
  memberSchema,
  normalizePhone,
  type ErrKey,
} from "@/lib/validation";
import type { UserRole } from "@/types/domain";
import { ROLES } from "./model";

const FIELDS = ["name", "phone"] as const;
const blank = { name: "", phone: "", role: "collector" as UserRole };

/** Add a committee member with inline, field-level validation. */
export function AddMemberForm() {
  const { t } = useI18n();
  const create = useCreateMember();
  const [v, setV] = useState(blank);
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<{ field: string; key: ErrKey } | null>(null);
  const errors = fieldErrors(memberSchema, v);
  const error = (f: (typeof FIELDS)[number]) =>
    (submitted ? errors[f] : undefined) ?? (serverErr?.field === f ? serverErr.key : undefined);
  const set = (patch: Partial<typeof v>) => {
    setV((x) => ({ ...x, ...patch }));
    setServerErr(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (create.isPending) return;
    setSubmitted(true);
    const first = FIELDS.find((f) => errors[f]);
    if (first) return document.getElementById(`member-${first}`)?.focus();
    try {
      await create.mutateAsync(v);
      toast.success(t("memberAdded"));
      setV(blank);
      setSubmitted(false);
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      setServerErr({ field: ex.field, key: ex.key });
    }
  };

  return (
    <form className="mt-4 space-y-3 border-t pt-4" onSubmit={submit} noValidate>
      <h3 className="font-semibold">{t("addMember")}</h3>
      <TextField
        id="member-name"
        label={t("name")}
        autoComplete="off"
        maxLength={80}
        value={v.name}
        error={error("name")}
        onChange={(e) => set({ name: e.target.value })}
      />
      <TextField
        id="member-phone"
        label={t("phone")}
        type="tel"
        inputMode="numeric"
        autoComplete="off"
        className="num"
        value={v.phone}
        error={error("phone")}
        onChange={(e) => set({ phone: normalizePhone(e.target.value) })}
      />
      <fieldset>
        <legend className="mb-2 block text-sm font-semibold text-muted-foreground">
          {t("role")}
        </legend>
        <div className="grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              className="chip px-1 text-sm"
              data-active={v.role === r}
              aria-pressed={v.role === r}
              onClick={() => set({ role: r })}
            >
              {t(`role_${r}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <button
        type="submit"
        className="btn btn-gold w-full"
        disabled={create.isPending}
        aria-busy={create.isPending}
      >
        {create.isPending ? <Spinner /> : <UserPlus className="h-5 w-5" aria-hidden />}{" "}
        {t("addMember")}
      </button>
    </form>
  );
}
