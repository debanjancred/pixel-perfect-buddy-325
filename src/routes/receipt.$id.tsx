import { createFileRoute, Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/pk/AppShell";
import { ReceiptActions, ReceiptCard, useReceipt } from "@/features/receipt";

// Re-share or print a saved receipt (SPEC Story 2.2). Keyed by the chanda's UUID; the data
// is on this device only, so the page resolves it client-side like every other screen.
export const Route = createFileRoute("/receipt/$id")({
  head: () => ({
    meta: [
      { title: "Receipt — Pujo Khata" },
      { name: "description", content: "Chanda receipt: share on WhatsApp, save or print." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReceiptPage,
});

function ReceiptPage() {
  const { t } = useI18n();
  const { id } = Route.useParams();
  const { receipt, isPending } = useReceipt(id);
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <AppShell>
      <div className="mb-3 flex items-center gap-2">
        {canGoBack ? (
          <button
            type="button"
            onClick={() => router.history.back()}
            className="tap -ml-3 flex items-center justify-center rounded-full"
            aria-label={t("back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <Link
            to="/chanda"
            className="tap -ml-3 flex items-center justify-center rounded-full"
            aria-label={t("back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <h1 className="text-2xl font-extrabold">{t("receipt")}</h1>
      </div>

      {isPending ? (
        <div className="h-96 animate-pulse rounded-2xl bg-muted" aria-busy="true" />
      ) : receipt ? (
        <>
          <ReceiptCard receipt={receipt} />
          <div className="mt-4">
            <ReceiptActions receipt={receipt} />
          </div>
        </>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed bg-card p-6 text-center">
          <p className="font-bold">{t("receiptNotFound")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("receiptNotFoundHint")}</p>
          <Link to="/chanda" className="btn btn-outline mt-4">
            {t("chandaRegister")}
          </Link>
        </div>
      )}
      <div className="h-6" />
    </AppShell>
  );
}
