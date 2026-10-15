import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, MessageCircle, MapPin } from "lucide-react";
import { useI18n, type TKey } from "@/lib/i18n";
import { useChandas, useHouseholds, useMembers, useSummary } from "@/hooks/use-data";
import { AppShell, Fab } from "@/components/pk/AppShell";
import { StatusBadge, SyncBadge, waLink } from "@/components/pk/ui";
import { toBnDigits, indian } from "@/lib/format";

export const Route = createFileRoute("/chanda")({
  head: () => ({
    meta: [
      { title: "Chanda Register — Pujo Khata" },
      {
        name: "description",
        content:
          "Every household's pledge and collection, grouped by lane, with one-tap WhatsApp reminders.",
      },
      { property: "og:title", content: "Chanda Register — Pujo Khata" },
      {
        property: "og:description",
        content: "Household-wise chanda register for your puja committee.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChandaPage,
});

type Filter = "all" | "pending" | "promised" | "today";
const FILTERS: { k: Filter; t: TKey }[] = [
  { k: "all", t: "all" },
  { k: "pending", t: "pending" },
  { k: "promised", t: "promised" },
  { k: "today", t: "today" },
];

function ChandaPage() {
  const { t, money, pick, n } = useI18n();
  const { data: households = [] } = useHouseholds();
  const { data: chandas = [] } = useChandas();
  const { data: members = [] } = useMembers();
  const { data: s } = useSummary();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const today = new Date().toDateString();
    const rows = households
      .map((h) => {
        const mine = chandas.filter((c) => c.household_id === h.id);
        const last = mine[0];
        return {
          h,
          collected: mine.reduce((a, c) => a + c.amount, 0),
          collector: last ? members.find((m) => m.id === last.collector_id) : undefined,
          today: mine.some((c) => new Date(c.created_at).toDateString() === today),
        };
      })
      .filter((r) => {
        if (filter === "pending" && r.h.status !== "pending") return false;
        if (filter === "promised" && r.h.status !== "promised") return false;
        if (filter === "today" && !r.today) return false;
        const s = q.trim().toLowerCase();
        return (
          !s ||
          [r.h.resident_name, r.h.resident_name_en, r.h.house_no].some((x) =>
            x.toLowerCase().includes(s),
          )
        );
      });
    const map = new Map<string, typeof rows>();
    rows.forEach((r) => map.set(r.h.lane_bn, [...(map.get(r.h.lane_bn) ?? []), r]));
    return [...map.entries()];
  }, [households, chandas, members, filter, q]);

  return (
    <AppShell fab={<Fab to="/collect" label={t("addChanda")} />}>
      <h1 className="text-2xl font-extrabold">{t("chandaRegister")}</h1>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          className="field pl-11"
          placeholder={t("search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            className="chip"
            data-active={filter === f.k}
            onClick={() => setFilter(f.k)}
          >
            {t(f.t)}
          </button>
        ))}
      </div>

      {groups.length === 0 && (
        <p className="py-12 text-center text-muted-foreground">{t("noResults")}</p>
      )}

      {groups.map(([lane, rows]) => (
        <section key={lane} className="mt-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-gold-ink">
            <MapPin className="h-4 w-4" /> {pick(lane, rows[0]!.h.lane_en)}{" "}
            <span className="font-medium text-muted-foreground">
              · {n(String(rows.length))} {t("houses")}
            </span>
          </h2>
          <ul className="space-y-2">
            {rows.map(({ h, collected, collector }) => {
              const due = h.status !== "paid";
              const msg = `নমস্কার ${h.resident_name}, ${s?.club.name ?? "পুজো কমিটি"}-এর জন্য আপনার প্রতিশ্রুত ₹${toBnDigits(indian(h.pledged_amount))} চাঁদা এখনো বাকি আছে। আমাদের সংগ্রাহক শীঘ্রই আসবেন, অথবা UPI-তে পাঠাতে পারেন। ধন্যবাদ 🙏`;
              return (
                <li key={h.id} className="rounded-2xl border bg-card p-3 shadow-card">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 min-w-12 items-center justify-center rounded-xl bg-muted px-1 text-sm font-extrabold">
                      {n(h.house_no)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold leading-snug">
                        {pick(h.resident_name, h.resident_name_en)}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <StatusBadge status={h.status} />
                        {collector && (
                          <span>
                            {t("collector")}: {pick(collector.name, collector.name_en)}
                          </span>
                        )}
                        <SyncBadge status={h.sync_status} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num font-extrabold">
                        {money(due ? h.pledged_amount : collected)}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {due ? t("pledged") : t("collected")}
                      </div>
                    </div>
                  </div>
                  {due && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <a
                        href={waLink(h.phone, msg)}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-whatsapp min-h-12 text-sm"
                      >
                        <MessageCircle className="h-4 w-4" /> {t("remind")}
                      </a>
                      <Link
                        to="/collect"
                        search={{ household: h.id }}
                        className="btn btn-outline min-h-12 text-sm"
                      >
                        {t("collect")}
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <div className="h-16" />
    </AppShell>
  );
}
