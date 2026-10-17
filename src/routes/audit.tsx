import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useClub } from "@/hooks/use-data";

// Stable alias for "this club's accounts": resolves the active club on the device and
// forwards to the SPEC route, /club/$slug/accounts. No club yet → onboarding.
export const Route = createFileRoute("/audit")({
  component: AuditRedirect,
});

function AuditRedirect() {
  const { data: club, isSuccess } = useClub();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isSuccess) return;
    if (club) navigate({ to: "/club/$slug/accounts", params: { slug: club.slug }, replace: true });
    else navigate({ to: "/", replace: true });
  }, [club, isSuccess, navigate]);
  return <div className="min-h-screen bg-background" aria-busy="true" />;
}
