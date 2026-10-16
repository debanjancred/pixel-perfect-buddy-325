import { createFileRoute, redirect } from "@tanstack/react-router";

// Old address of the settings screen; SPEC 6.2 puts it at /settings.
export const Route = createFileRoute("/admin")({
  beforeLoad: () => {
    throw redirect({ to: "/settings", replace: true });
  },
});
