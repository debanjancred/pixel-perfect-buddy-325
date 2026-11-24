import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/pk/AppShell";
import { NoAccess } from "@/components/pk/NoAccess";
import { useAccess } from "@/hooks/use-data";
import { ApprovalQueue } from "@/features/approvals";

// ADR 0003: the admin approves or rejects what others recorded, and decides void requests.
// The kind filter lives in the URL so refresh and back keep it.
export const Route = createFileRoute("/approvals")({
  validateSearch: z.object({
    kind: z.enum(["chanda", "expense", "handover"]).optional().catch(undefined),
  }),
  head: () => ({
    meta: [
      { title: "Approvals — Pujo Khata" },
      { name: "description", content: "Entries waiting for the admin's approval." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ApprovalsPage,
});

function ApprovalsPage() {
  const { t } = useI18n();
  const { kind } = Route.useSearch();
  const navigate = useNavigate({ from: "/approvals" });
  const access = useAccess("entry.approve");

  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">{t("approvals")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("approvalsHint")}</p>
      {access.isPending ? null : access.allowed ? (
        <ApprovalQueue
          kind={kind ?? "all"}
          onKind={(k) =>
            void navigate({ search: { kind: k === "all" ? undefined : k }, replace: true })
          }
        />
      ) : (
        <NoAccess />
      )}
    </AppShell>
  );
}
