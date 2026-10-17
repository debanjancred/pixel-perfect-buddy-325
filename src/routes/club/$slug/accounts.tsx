import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { session, useClubAccounts } from "@/hooks/use-data";
import { AlponaStrip, LangToggle } from "@/components/pk/ui";
import {
  AccountsActions,
  AccountsOverview,
  CategoryDonut,
  CollectionSplit,
  categoryShares,
  sharesFromTotals,
} from "@/features/accounts";

// SPEC Story 4.1: read-only accounts, reachable without signing in on this device.
// Data comes from this device's store; a shareable public URL needs the Phase 2 backend.
export const Route = createFileRoute("/club/$slug/accounts")({
  head: () => ({
    meta: [
      { title: "Accounts — Pujo Khata" },
      {
        name: "description",
        content: "Read-only account of this puja's collections, expenses and balance.",
      },
      { property: "og:title", content: "সর্বজনীন স্বচ্ছ হিসাব — Pujo Khata" },
      { property: "og:description", content: "See exactly how your para's puja chanda was spent." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const { t, pick } = useI18n();
  const { slug } = Route.useParams();
  const { data, isPending, isError, refetch } = useClubAccounts(slug);
  // Server summaries (shared link on another device) carry totals instead of expenses.
  const shares = useMemo(
    () =>
      data?.category_totals
        ? sharesFromTotals(data.category_totals)
        : categoryShares(data?.expenses ?? []),
    [data],
  );
  // Only signed-in users get a way back into the app; visitors just read.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(!!session.get()), []);

  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-12">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <AlponaStrip />
        <div className="flex items-center gap-2 px-4 py-2">
          {signedIn && (
            <Link
              to="/home"
              className="tap -ml-2 flex items-center justify-center rounded-full"
              aria-label={t("back")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
          )}
          <div className="flex-1 font-bold text-primary">{t("publicAudit")}</div>
          <LangToggle />
        </div>
      </header>

      <main className="space-y-5 px-4 pt-4">
        {isError ? (
          <div
            role="alert"
            className="rounded-2xl bg-warning-soft p-4 text-sm font-semibold text-warning"
          >
            {t("loadFailedHint")}
            <button className="btn btn-outline mt-3 w-full" onClick={() => refetch()}>
              {t("tryAgain")}
            </button>
          </div>
        ) : isPending ? (
          <div className="space-y-4" aria-busy="true">
            <div className="h-8 animate-pulse rounded-xl bg-muted" />
            <div className="h-64 animate-pulse rounded-3xl bg-muted" />
            <div className="h-40 animate-pulse rounded-3xl bg-muted" />
          </div>
        ) : !data ? (
          <div className="mt-8 rounded-2xl border border-dashed bg-card p-6 text-center">
            <p className="font-bold">{t("accountsNotFound")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("accountsNotFoundHint")}</p>
            <Link to="/" className="btn btn-outline mt-4">
              {t("goHome")}
            </Link>
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border-2 border-success/40 bg-success-soft px-4 py-2 text-sm font-bold text-success">
                <BadgeCheck className="h-5 w-5" aria-hidden /> {t("verified")}
              </span>
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-extrabold leading-snug">
                {pick(data.club.name_bn, data.club.name_en)}
              </h1>
              {data.club.area_label && (
                <p className="text-sm text-muted-foreground">{data.club.area_label}</p>
              )}
              <p className="text-sm text-muted-foreground">{t("readOnly")}</p>
            </div>
            <AccountsOverview summary={data.summary} />
            <CollectionSplit summary={data.summary} />
            <CategoryDonut shares={shares} total={data.summary.total_expenses} />
            <AccountsActions club={data.club} summary={data.summary} />
          </>
        )}
      </main>
    </div>
  );
}
