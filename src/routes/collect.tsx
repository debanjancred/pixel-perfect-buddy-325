import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Search, UserPlus, Banknote, QrCode, Check } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { newId } from "@/lib/id";
import { useI18n } from "@/lib/i18n";
import {
  useAddHousehold,
  useAddTransaction,
  useClub,
  useAccess,
  useCollectStanding,
  useCurrentMember,
  useHouseholds,
  useMembers,
  useTransactions,
} from "@/hooks/use-data";
import type { Household, PaymentMethod } from "@/types/domain";
import { AppShell } from "@/components/pk/AppShell";
import { FieldError, Label, Spinner, StatusBadge, TextField } from "@/components/pk/ui";
import { byRecentActivity, householdLedgers, householdMatches, ledgerOf } from "@/lib/households";
import {
  ValidationError,
  amountSchema,
  check,
  fieldErrors,
  householdSchema,
  normalizePhone,
  type ErrKey,
} from "@/lib/validation";
import { ReceiptModal } from "@/features/receipt";
import { NoAccess } from "@/components/pk/NoAccess";
import { CollectDeviceGate } from "@/features/devices";

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
  house_flat_no: "house_no",
  lane_block: "resident_name",
  phone_number: "phone",
  collector_id: "collector",
};

function CollectPage() {
  const { t, money, n } = useI18n();
  const { household: preselect } = Route.useSearch();
  const { data: club } = useClub();
  const { data: households = [] } = useHouseholds();
  const { data: chandas = [], isSuccess: chandasReady } = useTransactions();
  const { data: members = [] } = useMembers();
  const me = useCurrentMember();
  const access = useAccess("chanda.add");
  const { data: standing } = useCollectStanding();
  const addHousehold = useAddHousehold();
  const addTransaction = useAddTransaction();

  const [q, setQ] = useState("");
  const [hh, setHh] = useState<Household | null>(null);
  const [adding, setAdding] = useState(false);
  const [nh, setNh] = useState({ name: "", house: "", lane: 0, phone: "" });
  const [amount, setAmount] = useState<number | null>(null);
  const [other, setOther] = useState(false);
  const [otherVal, setOtherVal] = useState("");
  const [mode, setMode] = useState<PaymentMethod>("cash");
  const [collector, setCollector] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [serverErr, setServerErr] = useState<{ field: Field; key: ErrKey } | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const preselectUsed = useRef(false);
  // Client-generated id = idempotency key: a double tap or retry can't create two entries.
  const txId = useRef<string | null>(null);
  const saving = addHousehold.isPending || addTransaction.isPending;

  const ledgers = useMemo(() => householdLedgers(chandas), [chandas]);
  const dueOf = (h: Household) => ledgerOf(ledgers, h.id).due;
  // Lanes/blocks already used in this club, so new households stay consistent.
  const lanes = useMemo(() => {
    const used = [...new Set(households.map((h) => h.lane_block))];
    return used.length ? used : club?.area_label ? [club.area_label] : [];
  }, [households, club]);

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
  // Story 2.1: after a save the form is ready for the next household.
  const reset = () => {
    setHh(null);
    setQ("");
    setAdding(false);
    setNh({ name: "", house: "", lane: 0, phone: "" });
    setAmount(null);
    setOther(false);
    setOtherVal("");
    setMode("cash");
    setSubmitted(false);
    setServerErr(null);
    txId.current = null;
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
  // SPEC 2.1: collector defaults to the session member (demo: কর্মী ০১).
  useEffect(() => {
    if (!collector && me) setCollector(me.id);
  }, [me, collector]);

  // SPEC 2.1: recent households on top.
  const matches = useMemo(
    () =>
      byRecentActivity(households, chandas)
        .filter((h) => householdMatches(h, q))
        .slice(0, 6),
    [q, households, chandas],
  );

  const finalAmount = other ? (otherVal ? Number(otherVal) : NaN) : (amount ?? NaN);
  const hhInput = {
    resident_name: nh.name,
    house_flat_no: nh.house,
    lane_block: lanes[nh.lane] ?? "",
    phone_number: nh.phone,
  };
  const hhErr = adding ? fieldErrors(householdSchema, hhInput) : {};
  const errors: Record<Field, ErrKey | null> = {
    household: !adding && !hh ? "err_household" : null,
    resident_name: hhErr.resident_name ?? hhErr.lane_block ?? null,
    house_no: hhErr.house_flat_no ?? null,
    phone: hhErr.phone_number ?? null,
    amount: check(amountSchema, finalAmount),
    collector: collector ? null : "err_collector",
  };
  const err = (f: Field) =>
    (submitted ? errors[f] : null) ?? (serverErr?.field === f ? serverErr.key : null);
  const touch = () => setServerErr(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSubmitted(true);
    const first = (Object.keys(errors) as Field[]).find((f) => errors[f]);
    if (first) {
      const el = document.getElementById(`collect-${first}`);
      el?.focus();
      el?.scrollIntoView({ block: "center" });
      return;
    }
    setServerErr(null);
    try {
      let target = hh;
      if (!target) {
        target = await addHousehold.mutateAsync(hhInput);
        // Keep the new household selected so a retry can't register it twice.
        setHh(target);
        setAdding(false);
      }
      txId.current ??= newId();
      const c = await addTransaction.mutateAsync({
        id: txId.current,
        household_id: target.id,
        amount: finalAmount,
        payment_method: mode,
        status: "collected",
        collector_id: collector,
      });
      if (!navigator.onLine) toast(t("offlineSaved"));
      setReceiptId(c.id);
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      setServerErr({ field: FIELD_OF[ex.field] ?? (ex.field as Field), key: ex.key });
    }
  };

  const hhLedger = hh ? ledgerOf(ledgers, hh.id) : null;

  if (!access.isPending && !access.allowed)
    return (
      <AppShell>
        <h1 className="text-2xl font-extrabold">{t("collectTitle")}</h1>
        <NoAccess />
      </AppShell>
    );

  // Cloud mode: chanda is collected on one of the person's devices (features/devices).
  if (standing?.applies && !standing.is_collect)
    return (
      <AppShell>
        <h1 className="text-2xl font-extrabold">{t("collectTitle")}</h1>
        <CollectDeviceGate collectLabel={standing.collect_label} />
      </AppShell>
    );

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
                <div className="font-bold">{hh.resident_name}</div>
                <div className="text-sm text-muted-foreground">
                  {n(hh.house_flat_no)} · {hh.lane_block}
                </div>
                <div className="mt-0.5 text-sm font-semibold">
                  {hhLedger && hhLedger.due > 0 ? (
                    <span className="text-warning">
                      {t("dueAmount")} <span className="num">{money(hhLedger.due)}</span>
                    </span>
                  ) : (
                    hhLedger && <StatusBadge status={hhLedger.status} />
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
                      key={l}
                      className="chip"
                      data-active={nh.lane === i}
                      aria-pressed={nh.lane === i}
                      onClick={() => setNh({ ...nh, lane: i })}
                    >
                      {l}
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
                          {n(h.house_flat_no)}
                        </span>
                        <span className="flex-1 font-semibold">{h.resident_name}</span>
                        <StatusBadge status={ledgerOf(ledgers, h.id).status} />
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
                className="flex min-h-14 items-center justify-center gap-2 rounded-xl font-bold text-muted-foreground transition data-[active=true]:bg-card data-[active=true]:text-primary-ink data-[active=true]:shadow-card"
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
                {m.name} — {t(`role_${m.role}`)}
              </option>
            ))}
          </select>
          <FieldError id="collect-collector-error" error={err("collector")} />
        </section>

        <button
          type="submit"
          className="btn btn-primary shadow-fab mt-8 w-full py-4 text-lg"
          disabled={saving}
          aria-busy={saving}
        >
          {saving && <Spinner />}
          {t("saveReceipt")} {!errors.amount && <span className="num">· {money(finalAmount)}</span>}
        </button>
      </form>
      <div className="h-6" />

      <ReceiptModal
        transactionId={receiptId}
        onClose={() => {
          setReceiptId(null);
          reset();
        }}
      />
    </AppShell>
  );
}
