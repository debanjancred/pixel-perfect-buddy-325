import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Plus,
  ReceiptIndianRupee,
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  ChevronRight,
} from "lucide-react";
import { useCash } from "@/features/cash";
import { ApprovalsLink } from "@/features/approvals";
import { useI18n } from "@/lib/i18n";
import {
  usePermission,
  useExpenses,
  useHouseholds,
  useMembers,
  useSummary,
  useTransactions,
} from "@/hooks/use-data";
import { isLive, isVoid } from "@/lib/accounts";
import { AppShell } from "@/components/pk/AppShell";
import { SyncBadge } from "@/components/pk/ui";
import { ApprovalBadge } from "@/components/pk/Approval";

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
  const { t, money, n, ago } = useI18n();
  const { data: s, isError, refetch } = useSummary();
  const { data: chandas = [], isPending: chandasLoading } = useTransactions();
  const { data: households = [] } = useHouseholds();
  const { data: expenses = [], isPending: expensesLoading } = useExpenses();
  const { data: members = [] } = useMembers();
  const pct = s?.progress_pct ?? 0;
  const canExpense = usePermission("expense.add");
  const canCollect = usePermission("chanda.add");
  // Share Accounts moved to Settings → Club options (UAT 2026-10-28).
  const actionCount = Math.max(1, Number(canCollect) + Number(canExpense));
  const canReceive = usePermission("handover.record");
  const cash = useCash();

  const stream = [
    // Money received, plus voided or rejected entries (struck through, SPEC 2.3); not pledges.
    ...chandas
      .filter((c) => c.status === "collected" || isVoid(c))
      .map((c) => ({
        entry: c,
        voided: !isLive(c),
        id: c.id,
        kind: "in" as const,
        name: households.find((h) => h.id === c.household_id)?.resident_name ?? "—",
        amount: c.amount,
        sub: c.payment_method === "upi" ? "UPI" : t("cash"),
        at: c.created_at,
        sync: c.sync_status,
        offDevice: !!c.off_device,
      })),
    ...expenses.map((e) => {
      const m = members.find((x) => x.id === e.authorized_by_id);
      return {
        entry: e,
        voided: !isLive(e),
        id: e.id,
        kind: "out" as const,
        name: e.title,
        amount: e.amount,
        sub: m?.name ?? "",
        at: e.created_at,
        sync: e.sync_status,
        offDevice: false,
      };
    }),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  return (
    <AppShell>
      {isError && (
        <div
          role="alert"
          className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-warning-soft p-3 text-sm font-semibold text-warning"
        >
          {t("loadFailedHint")}
          <button className="btn btn-outline shrink-0 text-sm" onClick={() => refetch()}>
            {t("tryAgain")}
          </button>
        </div>
      )}
      <section className="bg-hero rounded-3xl p-5 text-primary-foreground" aria-busy={!s}>
        <div className="text-sm font-semibold opacity-85">{t("balance")}</div>
        <div className="num text-4xl font-extrabold">{s ? money(s.net_balance) : "—"}</div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-primary-foreground/12 p-3">
            <div className="text-xs opacity-85">{t("collected")}</div>
            <div className="num text-xl font-bold">{s ? money(s.total_collected) : "—"}</div>
          </div>
          <div className="rounded-2xl bg-primary-foreground/12 p-3">
            <div className="text-xs opacity-85">{t("spent")}</div>
            <div className="num text-xl font-bold">{s ? money(s.total_expenses) : "—"}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="num">
              {s ? `${money(s.total_collected)} / ${money(s.collection_target)}` : ""}
            </span>
            <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-extrabold text-on-gold">
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
        {/* ADR 0003: what waits for the admin is not in the totals above, but members see it. */}
        {s && ((s.waiting_collected ?? 0) > 0 || (s.waiting_expenses ?? 0) > 0) && (
          <div className="mt-3 rounded-xl bg-primary-foreground/12 px-3 py-2 text-xs font-semibold">
            {(s.waiting_collected ?? 0) > 0 && (
              <div>
                {t("collected")}: {t("waitingAmount", { amount: money(s.waiting_collected ?? 0) })}
              </div>
            )}
            {(s.waiting_expenses ?? 0) > 0 && (
              <div>
                {t("spent")}: {t("waitingAmount", { amount: money(s.waiting_expenses ?? 0) })}
              </div>
            )}
          </div>
        )}
      </section>

      <ApprovalsLink />

      <section className={`mt-5 grid gap-3 ${["grid-cols-1", "grid-cols-2"][actionCount - 1]}`}>
        {canCollect && (
          <QuickAction
            to="/collect"
            icon={<Plus className="h-7 w-7" />}
            label={t("addChanda")}
            tone="bg-primary text-primary-foreground"
          />
        )}
        {canExpense && (
          <QuickAction
            to="/expenses"
            search={{ add: true }}
            icon={<ReceiptIndianRupee className="h-7 w-7" />}
            label={t("addExpense")}
            tone="bg-card text-primary border-2 border-primary/30"
          />
        )}
      </section>

      {canReceive && cash.totalOutstanding > 0 && (
        <Link
          to="/cash"
          className="mt-4 flex min-h-14 items-center gap-3 rounded-2xl border-2 border-gold/40 bg-gold-soft p-3 text-gold-ink"
        >
          <HandCoins className="h-6 w-6 shrink-0" aria-hidden />
          <span className="flex-1 font-semibold">{t("totalOutstanding")}</span>
          <span className="num font-extrabold text-foreground">{money(cash.totalOutstanding)}</span>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </Link>
      )}

      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("recent")}</h2>
          <Link to="/chanda" className="tap flex items-center text-sm font-semibold text-primary">
            {t("viewAll")}
          </Link>
        </div>
        {chandasLoading || expensesLoading ? (
          <ul className="divide-y rounded-2xl border bg-card shadow-card" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 p-3">
                <div className="h-11 w-11 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              </li>
            ))}
          </ul>
        ) : stream.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-muted-foreground">
            {t("noActivity")}
          </div>
        ) : (
          <ul className="divide-y rounded-2xl border bg-card shadow-card">
            {stream.map((x) => {
              const row = (
                <>
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
                    <div
                      className={`truncate font-semibold ${x.voided ? "line-through opacity-60" : ""}`}
                    >
                      {x.name}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{x.sub}</span>
                      <span>·</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                        {ago(x.at)}
                      </span>
                      {isVoid(x.entry) && (
                        <span className="rounded-full bg-primary-soft px-2 py-0.5 font-bold text-primary">
                          {t("receiptVoid")}
                        </span>
                      )}
                      <ApprovalBadge entry={x.entry} />
                      <SyncBadge status={x.sync} />
                      {x.offDevice && (
                        <span
                          className="rounded-full bg-gold-soft px-2 py-0.5 font-bold text-gold-ink"
                          title={t("offDeviceHint")}
                        >
                          {t("offDevice")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    className={`num font-bold ${x.kind === "in" ? "text-success" : "text-primary"} ${x.voided ? "line-through opacity-60" : ""}`}
                  >
                    {x.kind === "in" ? "+" : "−"}
                    {money(x.amount)}
                  </div>
                </>
              );
              return (
                <li key={x.id}>
                  {x.kind === "in" ? (
                    <Link
                      to="/receipt/$id"
                      params={{ id: x.id }}
                      className="flex items-center gap-3 p-3 active:bg-muted"
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 p-3">{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
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
