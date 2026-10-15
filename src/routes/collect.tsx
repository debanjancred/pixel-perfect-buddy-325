import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, Banknote, QrCode, Check } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import {
  useHouseholds,
  useInvalidateAll,
  useLanes,
  useMembers,
  useSummary,
} from "@/hooks/use-data";
import { api } from "@/services/api";
import type { Chanda, Household, PaymentMode } from "@/services/types";
import { AppShell } from "@/components/pk/AppShell";
import { Label, StatusBadge } from "@/components/pk/ui";
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

function CollectPage() {
  const { t, money, pick, n } = useI18n();
  const navigate = useNavigate();
  const { household: preselect } = Route.useSearch();
  const { data: households = [] } = useHouseholds();
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
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<Chanda | null>(null);

  useEffect(() => {
    if (preselect && !hh) {
      const f = households.find((h) => h.id === preselect);
      if (f) {
        setHh(f);
        setAmount(f.pledged_amount);
      }
    }
  }, [preselect, households, hh]);
  useEffect(() => {
    if (!collector && members[0]) setCollector(members[0].id);
  }, [members, collector]);

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = households.filter(
      (h) =>
        !s ||
        [h.resident_name, h.resident_name_en, h.house_no].some((x) => x.toLowerCase().includes(s)),
    );
    return list
      .sort((a, b) => Number(a.status === "paid") - Number(b.status === "paid"))
      .slice(0, 6);
  }, [q, households]);

  const finalAmount = other ? Number(otherVal) || 0 : (amount ?? 0);
  const canSave = (hh || (adding && nh.name.trim())) && finalAmount > 0 && collector && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    let target = hh;
    if (!target && adding) {
      const lane = lanes[nh.lane] ?? { bn: "মেন রোড", en: "Main Road" };
      target = await api.createHousehold({
        resident_name: nh.name.trim(),
        house_no: nh.house || "—",
        lane_bn: lane.bn,
        lane_en: lane.en,
        phone: nh.phone,
        pledged_amount: finalAmount,
      });
    }
    const c = await api.createChanda({
      household_id: target!.id,
      payer_name: target!.resident_name,
      amount: finalAmount,
      payment_mode: mode,
      collector_id: collector,
    });
    await invalidate();
    setSaving(false);
    setHh(target);
    if (c.sync_status === "pending") toast(t("offlineSaved"));
    setReceipt(c);
  };

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">{t("collectTitle")}</h1>

      <section className="mt-4">
        <Label>{t("household")}</Label>
        {hh ? (
          <div className="flex items-center gap-3 rounded-2xl border-2 border-primary bg-primary-soft p-3">
            <Check className="h-6 w-6 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="font-bold">{pick(hh.resident_name, hh.resident_name_en)}</div>
              <div className="text-sm text-muted-foreground">
                {n(hh.house_no)} · {pick(hh.lane_bn, hh.lane_en)}
              </div>
            </div>
            <button
              className="tap rounded-xl px-3 font-semibold text-primary"
              onClick={() => setHh(null)}
            >
              {t("change")}
            </button>
          </div>
        ) : adding ? (
          <div className="space-y-3 rounded-2xl border bg-card p-3">
            <input
              className="field"
              placeholder={t("residentName")}
              value={nh.name}
              onChange={(e) => setNh({ ...nh, name: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className="field"
                placeholder={t("houseNo")}
                value={nh.house}
                onChange={(e) => setNh({ ...nh, house: e.target.value })}
              />
              <input
                className="field"
                inputMode="numeric"
                placeholder={t("phone")}
                maxLength={10}
                value={nh.phone}
                onChange={(e) => setNh({ ...nh, phone: e.target.value.replace(/\D/g, "") })}
              />
            </div>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {lanes.map((l, i) => (
                <button
                  key={l.bn}
                  className="chip"
                  data-active={nh.lane === i}
                  onClick={() => setNh({ ...nh, lane: i })}
                >
                  {pick(l.bn, l.en)}
                </button>
              ))}
            </div>
            <button className="btn btn-outline w-full" onClick={() => setAdding(false)}>
              {t("cancel")}
            </button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                className="field pl-11"
                placeholder={t("search")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <ul className="mt-2 divide-y rounded-2xl border bg-card">
              {matches.map((h) => (
                <li key={h.id}>
                  <button
                    className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
                    onClick={() => {
                      setHh(h);
                      if (h.status !== "paid") {
                        setAmount(h.pledged_amount);
                        setOther(false);
                      }
                    }}
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
            <button className="btn btn-gold mt-2 w-full" onClick={() => setAdding(true)}>
              <UserPlus className="h-5 w-5" /> {t("addHousehold")}
            </button>
          </>
        )}
      </section>

      <section className="mt-6">
        <Label>{t("amount")}</Label>
        <div className="grid grid-cols-3 gap-2">
          {AMOUNTS.map((a) => (
            <button
              key={a}
              className="chip num min-h-14 text-lg"
              data-active={!other && amount === a}
              onClick={() => {
                setAmount(a);
                setOther(false);
              }}
            >
              {money(a)}
            </button>
          ))}
          <button
            className="chip min-h-14 text-lg"
            data-active={other}
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
            value={otherVal}
            onChange={(e) => setOtherVal(e.target.value.replace(/\D/g, ""))}
          />
        )}
      </section>

      <section className="mt-6">
        <Label>{t("mode")}</Label>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted p-1.5">
          {(
            [
              ["cash", Banknote, t("cash")],
              ["upi", QrCode, t("upi")],
            ] as const
          ).map(([m, Icon, l]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              data-active={mode === m}
              className="flex min-h-14 items-center justify-center gap-2 rounded-xl font-bold text-muted-foreground transition data-[active=true]:bg-card data-[active=true]:text-primary data-[active=true]:shadow-card"
            >
              <Icon className="h-5 w-5" /> {l}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <Label>{t("collector")}</Label>
        <select className="field" value={collector} onChange={(e) => setCollector(e.target.value)}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {pick(m.name, m.name_en)} — {t(`role_${m.role}`)}
            </option>
          ))}
        </select>
      </section>

      <button
        className="btn btn-primary shadow-fab mt-8 w-full py-4 text-lg"
        disabled={!canSave}
        onClick={save}
      >
        {t("saveReceipt")} {finalAmount > 0 && <span className="num">· {money(finalAmount)}</span>}
      </button>
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
