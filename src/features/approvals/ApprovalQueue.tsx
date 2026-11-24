import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ban, Check, CheckCheck, ReceiptText, X } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { ValidationError, rejectReasonSchema } from "@/lib/validation";
import {
  useApprovals,
  useApproveVoid,
  useDeclineVoid,
  useHouseholds,
  useMembers,
  useReviewEntries,
} from "@/hooks/use-data";
import { ReasonDialog } from "@/components/pk/VoidDialog";
import { Spinner } from "@/components/pk/ui";
import { VoucherThumb } from "@/features/expenses";
import {
  approvalCounts,
  approvalRows,
  filterApprovals,
  splitApprovals,
  visibleSelection,
  APPROVAL_KINDS,
  type ApprovalRow,
  type KindFilter,
} from "./model";

/**
 * The admin's queue (ADR 0003): void requests, then entries to approve or reject. Entries can
 * be ticked and approved together, because collection days produce hundreds of them.
 */
export function ApprovalQueue({
  kind,
  onKind,
}: {
  kind: KindFilter;
  onKind: (k: KindFilter) => void;
}) {
  const i18n = useI18n();
  const { t, n, money } = i18n;
  const { data: items, isPending } = useApprovals();
  const { data: members = [] } = useMembers();
  const { data: households = [] } = useHouseholds();
  const review = useReviewEntries();
  const approveVoid = useApproveVoid();
  const declineVoid = useDeclineVoid();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<ApprovalRow | null>(null);
  const [declining, setDeclining] = useState<ApprovalRow | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const all = useMemo(
    () => approvalRows(items ?? [], { members, households }, i18n),
    [items, members, households, i18n],
  );
  const counts = approvalCounts(all);
  const rows = filterApprovals(all, kind);
  const { voids, entries } = splitApprovals(rows);
  const chosen = visibleSelection(selected, rows);
  const allChosen = entries.length > 0 && chosen.length === entries.length;

  /** Runs one decision; a refusal (already decided elsewhere, changed meanwhile) is a toast. */
  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusyKey(key);
    try {
      await fn();
      toast.success(done);
    } catch (ex) {
      if (!(ex instanceof ValidationError)) throw ex;
      toast.error(t(ex.key));
    } finally {
      setBusyKey(null);
    }
  };

  const approve = (list: ApprovalRow[], key: string) =>
    run(
      key,
      async () => {
        await review.mutateAsync({ refs: list.map((r) => r.ref), decision: "approved" });
        setSelected((s) => {
          const next = new Set(s);
          for (const r of list) next.delete(r.key);
          return next;
        });
      },
      t("approvedCount", { count: n(String(list.length)) }),
    );

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (isPending)
    return (
      <div className="mt-4 space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    );

  return (
    <>
      <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4">
        {(["all", ...APPROVAL_KINDS] as const).map((k) => (
          <button
            key={k}
            className="chip"
            data-active={kind === k}
            aria-pressed={kind === k}
            onClick={() => onKind(k)}
          >
            {t(k === "all" ? "all" : `approvalKind_${k}`)}{" "}
            <span className="num">{n(String(counts[k]))}</span>
          </button>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed bg-card p-6 text-center">
          <CheckCheck className="mx-auto h-8 w-8 text-success" aria-hidden />
          <p className="mt-2 font-bold">{t("noApprovals")}</p>
        </div>
      )}

      {voids.length > 0 && (
        <section className="mt-5">
          <h2 className="mb-2 text-lg font-bold">{t("voidRequested")}</h2>
          <ul className="space-y-2">
            {voids.map((r) => (
              <li key={r.key} className="rounded-2xl border bg-card p-3 shadow-card">
                <RowBody row={r} />
                {r.reason && (
                  <p className="mt-2 rounded-xl bg-primary-soft p-2 text-sm text-primary-ink">
                    <span className="font-bold">{t("voidReason")}:</span> {r.reason}
                  </p>
                )}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn btn-outline min-h-12 text-sm"
                    onClick={() => setDeclining(r)}
                  >
                    <X className="h-4 w-4" aria-hidden /> {t("declineVoid")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary min-h-12 text-sm"
                    disabled={busyKey === r.key}
                    aria-busy={busyKey === r.key}
                    onClick={() => run(r.key, () => approveVoid.mutateAsync(r.ref), t("voided"))}
                  >
                    {busyKey === r.key ? <Spinner /> : <Ban className="h-4 w-4" aria-hidden />}
                    {t("void")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entries.length > 0 && (
        <section className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{t("approvalWaiting")}</h2>
            <button
              type="button"
              className="tap px-2 text-sm font-semibold text-primary-ink"
              onClick={() =>
                setSelected(allChosen ? new Set() : new Set(entries.map((r) => r.key)))
              }
            >
              {t(allChosen ? "selectNone" : "selectAll")}
            </button>
          </div>
          <ul className="space-y-2">
            {entries.map((r) => (
              <li key={r.key} className="rounded-2xl border bg-card p-3 shadow-card">
                <div className="flex items-start gap-2">
                  {/* The whole 48px square is the checkbox; the box inside is only its look. */}
                  <label className="relative -ml-2 -mt-2 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      checked={selected.has(r.key)}
                      onChange={() => toggle(r.key)}
                      aria-label={t("selectEntry", { name: r.title })}
                    />
                    <span
                      aria-hidden
                      className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-muted-foreground text-transparent peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                    >
                      <Check className="h-4 w-4" />
                    </span>
                  </label>
                  <div className="min-w-0 flex-1">
                    <RowBody row={r} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className="btn btn-outline min-h-12 text-sm text-destructive"
                    onClick={() => setRejecting(r)}
                  >
                    <X className="h-4 w-4" aria-hidden /> {t("reject")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary min-h-12 text-sm"
                    disabled={busyKey === r.key}
                    aria-busy={busyKey === r.key}
                    onClick={() => approve([r], r.key)}
                  >
                    {busyKey === r.key ? <Spinner /> : <Check className="h-4 w-4" aria-hidden />}
                    {t("approve")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {chosen.length > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 px-4 pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            className="btn btn-primary shadow-fab mx-auto flex h-14 w-full max-w-2xl"
            disabled={busyKey === "bulk"}
            aria-busy={busyKey === "bulk"}
            onClick={() => approve(chosen, "bulk")}
          >
            {busyKey === "bulk" ? <Spinner /> : <CheckCheck className="h-5 w-5" aria-hidden />}
            {t("approveSelected", { count: n(String(chosen.length)) })} ·{" "}
            <span className="num">{money(chosen.reduce((s, r) => s + r.amount, 0))}</span>
          </button>
        </div>
      )}
      <div className={chosen.length > 0 ? "h-24" : "h-6"} />

      {rejecting && (
        <ReasonDialog
          summary={`${rejecting.title} · ${money(rejecting.amount)}`}
          title="rejectTitle"
          hint="rejectHint"
          label="rejectReasonLabel"
          submit="reject"
          schema={rejectReasonSchema}
          onClose={() => setRejecting(null)}
          onSubmit={async (reason) => {
            await review.mutateAsync({ refs: [rejecting.ref], decision: "rejected", reason });
            toast.success(t("rejectedDone"));
          }}
        />
      )}
      {declining && (
        <ReasonDialog
          summary={`${declining.title} · ${money(declining.amount)}`}
          title="declineTitle"
          hint="declineHint"
          label="declineReasonLabel"
          submit="declineVoid"
          schema={rejectReasonSchema}
          onClose={() => setDeclining(null)}
          onSubmit={async (reason) => {
            await declineVoid.mutateAsync({ ref: declining.ref, reason });
            toast.success(t("voidDeclinedDone"));
          }}
        />
      )}
    </>
  );
}

/** What the entry is, who it's from and how much: shared by both sections. */
function RowBody({ row: r }: { row: ApprovalRow }) {
  const { t, money, ago } = useI18n();
  return (
    <div className="flex items-start gap-3">
      {r.voucher_image_id && <VoucherThumb id={r.voucher_image_id} className="h-14 w-14" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gold-ink">
          {t(`approvalKind_${r.ref.kind}`)}
          {r.edited && (
            <span className="rounded-full bg-gold-soft px-2 py-0.5 normal-case">
              {t("editedTag")}
            </span>
          )}
        </div>
        <div className="font-bold leading-snug">{r.title}</div>
        <div className="text-xs text-muted-foreground">{r.detail}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t(r.action === "void" ? "requestedBy" : "recordedByName", { name: r.by })} · {ago(r.at)}
        </div>
        {r.receipt_id && (
          <Link
            to="/receipt/$id"
            params={{ id: r.receipt_id }}
            className="tap -ml-1 inline-flex items-center gap-1 px-1 text-sm font-semibold text-primary-ink"
          >
            <ReceiptText className="h-4 w-4" aria-hidden /> {t("viewReceipt")}
          </Link>
        )}
      </div>
      <div className="num shrink-0 text-lg font-extrabold">{money(r.amount)}</div>
    </div>
  );
}
