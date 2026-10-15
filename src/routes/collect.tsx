import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Search, UserPlus, Banknote, QrCode, Check } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import {
  useChandas,
  useHouseholds,
  useInvalidateAll,
  useLanes,
  useMembers,
  useSummary,
} from "@/hooks/use-data";
import { api } from "@/services/api";
import type { Chanda, Household, PaymentMode } from "@/services/types";
import { AppShell } from "@/components/pk/AppShell";
import { FieldError, Label, StatusBadge, TextField } from "@/components/pk/ui";
import { dueAmount, householdMatches, paidByHousehold } from "@/lib/households";
import {
  ValidationError,
  amountSchema,
  check,
  fieldErrors,
  householdSchema,
  normalizePhone,
  type ErrKey,
} from "@/lib/validation";
import { ReceiptModal } from "@/components/pk/ReceiptModal";

export const Route = createFileRoute("/collect")({
  validateSearch: z.object({ household: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Collect Chanda — Pujo Khata" },
      {
        name: "description",
        content: "Record a chanda in seconds and send a digital receipt on WhatsApp.",
      },
      { property: "og:title", content: "Collect Chanda — Pujo Khata" },
      { property: "og:description", content: "Quick chanda entry with instant digital receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CollectPage,
});

const AMOUNTS = [251, 501, 1001, 2001, 5001];

type Field = "household" | "resident_name" | "house_no" | "phone" | "amount" | "collector";
// Service-layer field names → the form field that shows the error.
const FIELD_OF: Record<string, Field> = {
  household_id: "household",
  payer_name: "household",
  pledged_amount: "amount",
  collector_id: "collector",
};

function CollectPage() {
  const { t, money, pick, n } = useI18n();
  const navigate = useNavigate();
  const { household: preselect } = Route.useSearch();
  const { data: households = [] } = useHouseholds();
  const { data: chandas = [], isSuccess: chandasReady } = useChandas();
  const { data: members = [] } = useMembers();
  const { data: lanes = [] } = useLanes();
  const { data: s } = useSummary();
  const invalidate = useInvalidateAll();

  const [q, setQ] = useState("");
  const [hh, setHh] = useState<Household | null>(null);
  const [adding, setAdding] = useState(false);
  const [nh, setNh] = useState({ name: "", house: "", lane: 0, phone: "" });
  const [amount, setAmount] = useState<number | null>(null);
  const [other, setOther] = useState(false);
  const [otherVal, setOtherVal] = useState("");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [collector, setCollector] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<{ field: Field; key: ErrKey } | null>(null);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<Chanda | null>(null);
  const preselectUsed = useRef(false);

  const paid = useMemo(() => paidByHousehold(chandas), [chandas]);
  const dueOf = (h: Household) => dueAmount(h, paid.get(h.id) ?? 0);

  const setAmountTo = (a: number) => {
    const preset = AMOUNTS.includes(a);
    setAmount(preset ? a : null);
    setOther(!preset);
    setOtherVal(preset ? "" : String(a));
  };
  const choose = (h: Household) => {
    setHh(h);
    setServerErr(null);
    const due = dueOf(h);
    if (due > 0) setAmountTo(due);
  };

  // Coming from the register's "Collect" button: preselect once, with the balance due.
  useEffect(() => {
    if (!preselect || preselectUsed.current || !chandasReady) return;
    const f = households.find((h) => h.id === preselect);
    if (f) {
      preselectUsed.current = true;
      choose(f);
    }
  }, [preselect, households, chandasReady]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!collector && members[0]) setCollector(members[0].id);
  }, [members, collector]);

  const matches = useMemo(
    () =>
      households
        .filter((h) => householdMatches(h, q))
        .sort((a, b) => Number(a.status === "paid") - Number(b.status === "paid"))
        .slice(0, 6),
    [q, households],
  );

  const finalAmount = other ? (otherVal ? Number(otherVal) : NaN) : (amount ?? NaN);
  const lane = lanes[nh.lane];
  const hhInput = {
    resident_name: nh.name,
    house_no: nh.house,
    lane_bn: lane?.bn ?? "",
    lane_en: lane?.en ?? "",
    phone: nh.phone,
    pledged_amount: finalAmount,
  };
  const hhErr = adding ? fieldErrors(householdSchema, hhInput) : {};
  const errors: Record<Field, ErrKey | null> = {
    household: !adding && !hh ? "err_household" : null,
    resident_name: hhErr.resident_name ?? null,
    house_no: hhErr.house_no ?? null,
    phone: hhErr.phone ?? null,
    amount: check(amountSchema, finalAmount),
    collector: collector ? null : "err_collector",
  };
  const err = (f: Field) =>
    (submitted ? errors[f] : null) ?? (serverErr?.field === f ? serverErr.key : null);
  const touch = () => setServerErr(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const first = (Object.keys(errors) as Field[]).find((f) => errors[f]);
    if (first) {
      const el = document.getElementById(`collect-${first}`);
      el?.focus();
      el?.scrollIntoView({ block: "center" });
      return;
    }
    setSaving(true);
    setServerErr(null);
    try {
      let target = hh;
      if (!target) {
        target = await api.createHousehold(hhInput);
        // Keep the new household selected so a retry can't register it twice.
        setHh(target);
        setAdding(false);
      }
      const c = await api.createChanda({
        household_id: target.id,
        payer_name: target.resident_name,
        amount: finalAmount,
        payment_mode: mode,
        collector_id: collector,
      });
      await invalidate();
      if (c.sync_status === "pending") toast(t("offlineSaved"));
      setReceipt(c);
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      setServerErr({ field: FIELD_OF[ex.field] ?? (ex.field as Field), key: ex.key });
    } finally {
      setSaving(false);
    }
  };

  const hhDue = hh ? dueOf(hh) : 0;

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">{t("collectTitle")}</h1>

      <form onSubmit={save} noValidate>
        <section className="mt-4">
          <Label htmlFor={hh || adding ? undefined : "collect-household"}>{t("household")}</Label>
          {hh ? (
            <div className="flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary-soft p-3">
              <Check className="h-6 w-6 text-primary" />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{pick(hh.resident_name, hh.resident_name_en)}</div>
                <div className="text-sm text-muted-foreground">
                  {n(hh.house_no)} · {pick(hh.lane_bn, hh.lane_en)}
                </div>
                <div className="mt-0.5 text-sm font-semibold">
                  {hhDue > 0 ? (
                    <span className="text-warning">
                      {t("dueAmount")} <span className="num">{money(hhDue)}</span>
                    </span>
                  ) : (
                    <span className="text-success">{t("paid")}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="tap rounded-xl px-3 font-semibold text-primary"
                onClick={() => setHh(null)}
              >
                {t("change")}
              </button>
            </div>
          ) : adding ? (
            <div className="space-y-3 rounded-2xl border bg-card p-3">
              <TextField
                id="collect-resident_name"
                label={t("residentName")}
                autoFocus
                maxLength={80}
                value={nh.name}
                error={err("resident_name")}
                onChange={(e) => {
                  setNh({ ...nh, name: e.target.value });
                  touch();
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <TextField
                  id="collect-house_no"
                  label={t("houseNo")}
                  maxLength={20}
                  value={nh.house}
                  error={err("house_no")}
                  onChange={(e) => {
                    setNh({ ...nh, house: e.target.value });
                    touch();
                  }}
                />
                <TextField
                  id="collect-phone"
                  label={t("phone")}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  className="num"
                  value={nh.phone}
                  error={err("phone")}
                  onChange={(e) => {
                    setNh({ ...nh, phone: normalizePhone(e.target.value) });
                    touch();
                  }}
                />
              </div>
              <div>
                <Label>{t("lane")}</Label>
                <div className="no-scrollbar flex gap-2 overflow-x-auto" role="group">
                  {lanes.map((l, i) => (
                    <button
                      type="button"
                      key={l.bn}
                      className="chip"
                      data-active={nh.lane === i}
                      aria-pressed={nh.lane === i}
                      onClick={() => setNh({ ...nh, lane: i })}
                    >
                      {pick(l.bn, l.en)}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-outline w-full"
                onClick={() => {
                  setAdding(false);
                  touch();
                }}
              >
                {t("cancel")}
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="collect-household"
                  type="search"
                  className="field pl-11"
                  placeholder={t("search")}
                  value={q}
                  aria-invalid={!!err("household")}
                  aria-describedby={err("household") ? "collect-household-error" : undefined}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <FieldError id="collect-household-error" error={err("household")} />
              {matches.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("noResults")}</p>
              ) : (
                <ul className="mt-2 divide-y rounded-2xl border bg-card">
                  {matches.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                        onClick={() => choose(h)}
                      >
                        <span className="min-w-10 rounded-lg bg-muted px-1.5 py-1 text-center text-xs font-bold">
                          {n(h.house_no)}
                        </span>
                        <span className="flex-1 font-semibold">
                          {pick(h.resident_name, h.resident_name_en)}
                        </span>
                        <StatusBadge status={h.status} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="btn btn-gold mt-2 w-full"
                onClick={() => {
                  setAdding(true);
                  touch();
                }}
              >
                <UserPlus className="h-5 w-5" /> {t("addHousehold")}
              </button>
            </>
          )}
        </section>

        <section className="mt-6">
          <Label>{t("amount")}</Label>
          <div
            id="collect-amount"
            tabIndex={-1}
            role="group"
            aria-label={t("amount")}
            className="grid grid-cols-3 gap-2 outline-none"
          >
            {AMOUNTS.map((a) => (
              <button
                type="button"
                key={a}
                className="chip num min-h-14 text-lg"
                data-active={!other && amount === a}
                aria-pressed={!other && amount === a}
                onClick={() => {
                  setAmountTo(a);
                  touch();
                }}
              >
                {money(a)}
              </button>
            ))}
            <button
              type="button"
              className="chip min-h-14 text-lg"
              data-active={other}
              aria-pressed={other}
              onClick={() => setOther(true)}
            >
              {t("other")}
            </button>
          </div>
          {other && (
            <input
              autoFocus
              className="field num mt-2 text-2xl font-bold"
              inputMode="numeric"
              placeholder="₹"
              aria-label={`${t("amount")} (₹)`}
              aria-invalid={!!err("amount")}
              aria-describedby={err("amount") ? "collect-amount-error" : undefined}
              value={otherVal}
              onChange={(e) => {
                setOtherVal(e.target.value.replace(/\D/g, "").slice(0, 7));
                touch();
              }}
            />
          )}
          <FieldError id="collect-amount-error" error={err("amount")} />
        </section>

        <section className="mt-6">
          <Label>{t("mode")}</Label>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1.5" role="group">
            {(
              [
                ["cash", Banknote, t("cash")],
                ["upi", QrCode, t("upi")],
              ] as const
            ).map(([m, Icon, l]) => (
              <button
                type="button"
                key={m}
                onClick={() => setMode(m)}
                data-active={mode === m}
                aria-pressed={mode === m}
                className="flex min-h-14 items-center justify-center gap-2 rounded-xl font-bold text-muted-foreground transition data-[active=true]:bg-card data-[active=true]:text-primary data-[active=true]:shadow-card"
              >
                <Icon className="h-5 w-5" /> {l}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <Label htmlFor="collect-collector">{t("collector")}</Label>
          <select
            id="collect-collector"
            className="field"
            value={collector}
            aria-invalid={!!err("collector")}
            aria-describedby={err("collector") ? "collect-collector-error" : undefined}
            onChange={(e) => {
              setCollector(e.target.value);
              touch();
            }}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {pick(m.name, m.name_en)} — {t(`role_${m.role}`)}
              </option>
            ))}
          </select>
          <FieldError id="collect-collector-error" error={err("collector")} />
        </section>

        <button
          type="submit"
          className="btn btn-primary shadow-fab mt-8 w-full py-4 text-lg"
          disabled={saving}
        >
          {t("saveReceipt")} {!errors.amount && <span className="num">· {money(finalAmount)}</span>}
        </button>
      </form>
      <div className="h-6" />

      <ReceiptModal
        chanda={receipt}
        club={s?.club}
        phone={hh?.phone}
        onClose={() => {
          setReceipt(null);
          navigate({ to: "/home" });
        }}
      />
    </AppShell>
  );
}
