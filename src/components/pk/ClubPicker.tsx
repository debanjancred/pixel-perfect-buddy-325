import { useState, type FormEvent } from "react";
import { Check, Plus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useClubs, useCreateClub, useSetActiveClub } from "@/hooks/use-data";
import {
  ValidationError,
  clubSchema,
  fieldErrors,
  normalizePhone,
  sameName,
  type ErrKey,
} from "@/lib/validation";
import { TextField } from "./ui";

const PUJA_YEAR = new Date().getFullYear();
const FIELDS = ["name", "para", "zone", "target_amount", "creator_name", "creator_phone"] as const;

/**
 * Lists the clubs on this device and creates new ones. `phone` is the signed-in number:
 * when known, the creator's phone is fixed to it; demo users enter one.
 */
export function ClubPicker({ phone, onDone }: { phone?: string | undefined; onDone: () => void }) {
  const { t, pick, n, money } = useI18n();
  const { data } = useClubs();
  const setActive = useSetActiveClub();
  const createClub = useCreateClub();
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({
    name: "",
    para: "",
    zone: "",
    target: "500000",
    creatorName: "",
    creatorPhone: phone ?? "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<{ field: string; key: ErrKey } | null>(null);
  const [busy, setBusy] = useState(false);

  const input = {
    name: f.name,
    para: f.para,
    zone: f.zone,
    puja_year: PUJA_YEAR,
    target_amount: f.target ? Number(f.target) : NaN,
    creator_name: f.creatorName,
    creator_phone: phone ?? f.creatorPhone,
  };
  const errors = fieldErrors(clubSchema, input);
  if (
    !errors.name &&
    data?.clubs.some((c) => sameName(c.name_bn, f.name) || sameName(c.name_en, f.name))
  )
    errors.name = "err_clubExists";
  if (serverErr) errors[serverErr.field as keyof typeof errors] ??= serverErr.key;
  const shown = (k: (typeof FIELDS)[number]) => (submitted ? errors[k] : undefined);
  const edit = (patch: Partial<typeof f>) => {
    setF({ ...f, ...patch });
    setServerErr(null);
  };

  const select = async (id: string) => {
    await setActive.mutateAsync(id);
    onDone();
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const first = FIELDS.find((k) => errors[k]);
    if (first) return document.getElementById(`club-${first}`)?.focus();
    setBusy(true);
    try {
      await createClub.mutateAsync(input);
      onDone();
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      setServerErr({ field: err.field, key: err.key });
    } finally {
      setBusy(false);
    }
  };

  if (creating)
    return (
      <form className="space-y-4" onSubmit={create} noValidate>
        <TextField
          id="club-name"
          label={t("clubName")}
          autoComplete="organization"
          maxLength={80}
          value={f.name}
          error={shown("name")}
          onChange={(e) => edit({ name: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            id="club-para"
            label={t("para")}
            maxLength={60}
            value={f.para}
            error={shown("para")}
            onChange={(e) => edit({ para: e.target.value })}
          />
          <TextField
            id="club-zone"
            label={t("zone")}
            maxLength={40}
            value={f.zone}
            error={shown("zone")}
            onChange={(e) => edit({ zone: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField id="club-year" label={t("year")} value={n(String(PUJA_YEAR))} readOnly />
          <TextField
            id="club-target_amount"
            label={`${t("target")} (₹)`}
            className="num"
            inputMode="numeric"
            value={f.target}
            error={shown("target_amount")}
            onChange={(e) => edit({ target: e.target.value.replace(/\D/g, "").slice(0, 9) })}
          />
        </div>
        {!errors.target_amount && (
          <p className="-mt-2 text-right text-sm font-semibold text-muted-foreground">
            {money(input.target_amount)}
          </p>
        )}
        <fieldset className="space-y-3 rounded-2xl border bg-card p-3">
          <legend className="px-1 text-sm font-semibold text-muted-foreground">
            {t("role_admin")}
          </legend>
          <TextField
            id="club-creator_name"
            label={t("yourName")}
            autoComplete="name"
            maxLength={80}
            value={f.creatorName}
            error={shown("creator_name")}
            onChange={(e) => edit({ creatorName: e.target.value })}
          />
          <TextField
            id="club-creator_phone"
            label={t("phone")}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            className={phone ? "num bg-muted text-muted-foreground" : "num"}
            value={phone ?? f.creatorPhone}
            readOnly={!!phone}
            error={shown("creator_phone")}
            onChange={(e) => edit({ creatorPhone: normalizePhone(e.target.value) })}
          />
          <p className="text-sm text-muted-foreground">{t("creatorHint")}</p>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="btn btn-outline" onClick={() => setCreating(false)}>
            {t("cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {t("save")}
          </button>
        </div>
      </form>
    );

  return (
    <div className="space-y-2">
      {data?.clubs.map((c) => (
        <button
          key={c.id}
          onClick={() => select(c.id)}
          className="flex min-h-16 w-full items-center gap-3 rounded-2xl border bg-card p-3 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="font-bold">{pick(c.name_bn, c.name_en)}</div>
            <div className="text-sm text-muted-foreground">{c.area_label}</div>
          </div>
          {data.active_club_id === c.id && <Check className="h-5 w-5 text-primary" />}
        </button>
      ))}
      <button onClick={() => setCreating(true)} className="btn btn-gold w-full">
        <Plus className="h-5 w-5" /> {t("createClub")}
      </button>
    </div>
  );
}
