import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Minus, Megaphone, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useChandas, useExpenses, useMembers, useSummary } from "@/hooks/use-data";
import { AppShell } from "@/components/pk/AppShell";
import { SyncBadge } from "@/components/pk/ui";

export const Route = createFileRoute("/home")({
  head: () => ({
    meta: [
      { title: "Dashboard — Pujo Khata" },
      {
        name: "description",
        content: "Collections, expenses and balance for your Durga Puja committee at a glance.",
      },
      { property: "og:title", content: "Dashboard — Pujo Khata" },
      {
        property: "og:description",
        content: "Live puja accounts: collected, spent and net balance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { t, money, n, pick, ago } = useI18n();
  const { data: s } = useSummary();
  const { data: chandas = [] } = useChandas();
  const { data: expenses = [] } = useExpenses();
  const { data: members = [] } = useMembers();
  const pct = s && s.target ? Math.min(100, Math.round((s.collected / s.target) * 100)) : 0;

  const stream = [
    ...chandas.map((c) => ({
      id: c.id,
      kind: "in" as const,
      name: pick(c.payer_name, c.payer_name_en),
      amount: c.amount,
      sub: c.payment_mode === "upi" ? "UPI" : t("cash"),
      at: c.created_at,
      sync: c.sync_status,
    })),
    ...expenses.map((e) => {
      const m = members.find((x) => x.id === e.approved_by_id);
      return {
        id: e.id,
        kind: "out" as const,
        name: pick(e.item_name, e.item_name_en),
        amount: e.amount,
        sub: m ? pick(m.name, m.name_en) : "",
        at: e.created_at,
        sync: e.sync_status,
      };
    }),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  return (
    <AppShell>
      <section className="bg-hero rounded-3xl p-5 text-primary-foreground">
        <div className="text-sm font-semibold opacity-85">{t("balance")}</div>
        <div className="num text-4xl font-extrabold">{s ? money(s.balance) : "—"}</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-primary-foreground/12 p-3">
            <div className="text-xs opacity-85">{t("collected")}</div>
            <div className="num text-xl font-bold">{s ? money(s.collected) : "—"}</div>
          </div>
          <div className="rounded-2xl bg-primary-foreground/12 p-3">
            <div className="text-xs opacity-85">{t("spent")}</div>
            <div className="num text-xl font-bold">{s ? money(s.spent) : "—"}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="num">{s ? `${money(s.collected)} / ${money(s.target)}` : ""}</span>
            <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-extrabold text-foreground">
              {n(String(pct))}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-primary-foreground/20">
            <div
              className="h-full rounded-full bg-gold transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-xs opacity-80">{t("target")}</div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-3 gap-3">
        <QuickAction
          to="/collect"
          icon={<Plus className="h-7 w-7" />}
          label={t("addChanda")}
          tone="bg-primary text-primary-foreground"
        />
        <QuickAction
          to="/expenses"
          search={{ add: true }}
          icon={<Minus className="h-7 w-7" />}
          label={t("addExpense")}
          tone="bg-card text-primary border-2 border-primary/30"
        />
        <QuickAction
          to="/audit"
          icon={<Megaphone className="h-7 w-7" />}
          label={t("shareAccounts")}
          tone="bg-gold-soft text-gold-ink border-2 border-gold/40"
        />
      </section>

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("recent")}</h2>
          <Link to="/chanda" className="tap flex items-center text-sm font-semibold text-primary">
            {t("viewAll")}
          </Link>
        </div>
        <ul className="divide-y rounded-2xl border bg-card shadow-card">
          {stream.map((x) => (
            <li key={x.id} className="flex items-center gap-3 p-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${x.kind === "in" ? "bg-success-soft text-success" : "bg-primary-soft text-primary"}`}
              >
                {x.kind === "in" ? (
                  <ArrowDownLeft className="h-5 w-5" />
                ) : (
                  <ArrowUpRight className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{x.name}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{x.sub}</span>
                  <span>·</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{ago(x.at)}</span>
                  <SyncBadge status={x.sync} />
                </div>
              </div>
              <div className={`num font-bold ${x.kind === "in" ? "text-success" : "text-primary"}`}>
                {x.kind === "in" ? "+" : "−"}
                {money(x.amount)}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}

function QuickAction({
  to,
  search,
  icon,
  label,
  tone,
}: {
  to: "/collect" | "/expenses" | "/audit";
  search?: { add: boolean };
  icon: React.ReactNode;
  label: string;
  tone: string;
}) {
  return (
    <Link
      to={to}
      search={search as never}
      className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center text-sm font-bold shadow-card transition active:scale-95 ${tone}`}
    >
      {icon}
      {label}
    </Link>
  );
}
