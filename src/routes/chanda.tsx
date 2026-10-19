import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useMemo, useState } from "react";
import { Search, MessageCircle, MapPin, ReceiptText, Ban } from "lucide-react";
import { toast } from "sonner";
import { useI18n, type TKey } from "@/lib/i18n";
import {
  useClub,
  useHouseholds,
  useMembers,
  usePermission,
  useTransactions,
  useVoidTransaction,
} from "@/hooks/use-data";
import { VoidDialog } from "@/components/pk/VoidDialog";
import type { ChandaTransaction } from "@/types/domain";
import { AppShell, Fab } from "@/components/pk/AppShell";
import { StatusBadge, SyncBadge } from "@/components/pk/ui";
import { reminderText, waLink } from "@/lib/share";
import { householdLedgers, householdMatches, laneOptions, ledgerOf } from "@/lib/households";
import { isVoid } from "@/lib/accounts";

// Status and lane filters live in the URL: refresh and the back button keep them.
const searchSchema = z.object({
  status: z.enum(["pending", "promised", "today"]).optional().catch(undefined),
  lane: z.string().max(60).optional().catch(undefined),
});

export const Route = createFileRoute("/chanda")({
  validateSearch: searchSchema,
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
  const { t, money, pick, n, lang } = useI18n();
  const { data: households = [], isPending } = useHouseholds();
  const { data: chandas = [] } = useTransactions();
  const { data: members = [] } = useMembers();
  const { data: club } = useClub();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const filter: Filter = search.status ?? "all";
  const lanes = useMemo(() => laneOptions(households), [households]);
  // A lane that no longer exists (e.g. after switching club) falls back to all lanes.
  const lane = search.lane && lanes.some((l) => l.lane === search.lane) ? search.lane : undefined;
  const setFilter = (f: Filter) =>
    navigate({ search: (s) => ({ ...s, status: f === "all" ? undefined : f }), replace: true });
  const setLane = (l: string) =>
    navigate({ search: (s) => ({ ...s, lane: l || undefined }), replace: true });
  const canCollect = usePermission("chanda.add");
  // Treasurers and admins cancel a promise recorded by mistake (it is voided, never deleted).
  const canVoid = usePermission("entry.void");
  const voidTx = useVoidTransaction();
  const [cancelling, setCancelling] = useState<{ tx: ChandaTransaction; name: string } | null>(
    null,
  );
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const today = new Date().toDateString();
    const ledgers = householdLedgers(chandas);
    return households
      .filter((h) => !lane || h.lane_block === lane)
      .map((h) => {
        const l = ledgerOf(ledgers, h.id);
        return {
          h,
          ...l,
          collector: l.last ? members.find((m) => m.id === l.last!.collector_id) : undefined,
          today: chandas.some(
            (c) =>
              c.household_id === h.id &&
              c.status === "collected" &&
              !isVoid(c) &&
              new Date(c.created_at).toDateString() === today,
          ),
        };
      });
  }, [households, chandas, members, lane]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      pending: rows.filter((r) => r.status === "pending").length,
      // Promised = anything still due: promised and nothing paid, or partly paid.
      promised: rows.filter((r) => r.due > 0).length,
      today: rows.filter((r) => r.today).length,
    }),
    [rows],
  );

  const groups = useMemo(() => {
    const visible = rows.filter(
      (r) =>
        (filter === "all" ||
          (filter === "today"
            ? r.today
            : filter === "promised"
              ? r.due > 0
              : r.status === filter)) &&
        householdMatches(r.h, q),
    );
    const map = new Map<string, typeof visible>();
    visible.forEach((r) => map.set(r.h.lane_block, [...(map.get(r.h.lane_block) ?? []), r]));
    return [...map.entries()];
  }, [rows, filter, q]);

  const clubName = club ? pick(club.name_bn, club.name_en) : t("app");

  return (
    <AppShell fab={canCollect && <Fab to="/collect" label={t("addChanda")} />}>
      <h1 className="text-2xl font-extrabold">{t("chandaRegister")}</h1>
      <div className="relative mt-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          className="field pl-11"
          placeholder={t("search")}
          aria-label={t("search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {lanes.length > 1 && (
        <div className="mt-3">
          <label htmlFor="register-lane" className="sr-only">
            {t("lane")}
          </label>
          <select
            id="register-lane"
            className="field"
            value={lane ?? ""}
            onChange={(e) => setLane(e.target.value)}
          >
            <option value="">
              {t("allLanes")} ({n(String(households.length))})
            </option>
            {lanes.map((l) => (
              <option key={l.lane} value={l.lane}>
                {l.lane} ({n(String(l.count))})
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            className="chip"
            data-active={filter === f.k}
            aria-pressed={filter === f.k}
            onClick={() => setFilter(f.k)}
          >
            {t(f.t)} <span className="num">{n(String(counts[f.k]))}</span>
          </button>
        ))}
      </div>

      {isPending ? (
        <ul className="mt-5 space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </ul>
      ) : households.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed bg-card p-6 text-center">
          <p className="font-bold">{t("emptyRegister")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("emptyRegisterHint")}</p>
        </div>
      ) : (
        groups.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">{t("noResults")}</p>
        )
      )}

      {groups.map(([lane, rows]) => (
        <section key={lane} className="mt-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-gold-ink">
            <MapPin className="h-4 w-4" /> {lane}{" "}
            <span className="font-medium text-muted-foreground">
              · {n(String(rows.length))} {t("houses")}
            </span>
          </h2>
          <ul className="space-y-2">
            {rows.map(
              ({ h, collected, due, status, last, lastCollected, openPromise, collector }) => {
                const msg = reminderText(
                  lang,
                  h.resident_name,
                  clubName,
                  due > 0 ? money(due) : undefined,
                );
                return (
                  <li key={h.id} className="rounded-2xl border bg-card p-3 shadow-card">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 min-w-12 items-center justify-center rounded-xl bg-muted px-1 text-sm font-extrabold">
                        {n(h.house_flat_no)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold leading-snug">{h.resident_name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <StatusBadge status={status} />
                          {collector && (
                            <span>
                              {t("collector")}: {collector.name}
                            </span>
                          )}
                          {last && <SyncBadge status={last.sync_status} />}
                        </div>
                        {due > 0 && collected > 0 && (
                          <div className="mt-1 text-xs font-semibold text-success">
                            {t("paidSoFar")} <span className="num">{money(collected)}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="num font-extrabold">{money(due > 0 ? due : collected)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {due > 0
                            ? collected > 0
                              ? t("dueAmount")
                              : t("pledged")
                            : collected > 0
                              ? t("collected")
                              : t("pending")}
                        </div>
                      </div>
                    </div>
                    {(status !== "paid" || lastCollected) && (
                      <div className="mt-3 flex gap-2 [&>*]:flex-1">
                        {status !== "paid" && (
                          <a
                            href={waLink(h.phone_number, msg)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn-whatsapp min-h-12 px-2 text-sm"
                          >
                            <MessageCircle className="h-4 w-4" /> {t("remind")}
                          </a>
                        )}
                        {status !== "paid" && canCollect && (
                          <Link
                            to="/collect"
                            search={{ household: h.id }}
                            className="btn btn-outline min-h-12 px-2 text-sm"
                          >
                            {t("collect")}
                          </Link>
                        )}
                        {lastCollected && (
                          <Link
                            to="/receipt/$id"
                            params={{ id: lastCollected.id }}
                            className="btn btn-outline min-h-12 px-2 text-sm"
                          >
                            <ReceiptText className="h-4 w-4" /> {t("viewReceipt")}
                          </Link>
                        )}
                      </div>
                    )}
                    {canVoid && openPromise && (
                      <button
                        type="button"
                        className="tap mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-destructive"
                        onClick={() => setCancelling({ tx: openPromise, name: h.resident_name })}
                      >
                        <Ban className="h-4 w-4" aria-hidden /> {t("cancelPromise")}
                      </button>
                    )}
                  </li>
                );
              },
            )}
          </ul>
        </section>
      ))}
      <div className="h-16" />

      {cancelling && (
        <VoidDialog
          summary={`${cancelling.name} · ${t("promised")} ${money(cancelling.tx.amount)}`}
          onClose={() => setCancelling(null)}
          onVoid={async (reason) => {
            await voidTx.mutateAsync({ id: cancelling.tx.id, reason });
            toast.success(t("voided"));
          }}
        />
      )}
    </AppShell>
  );
}
