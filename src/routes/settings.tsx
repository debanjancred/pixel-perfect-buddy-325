import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { useI18n } from "@/lib/i18n";
import { AppShell } from "@/components/pk/AppShell";
import { DevicesSection } from "@/features/devices";
import { HelpSection } from "@/features/help";
import { InstallApp } from "@/features/install";
import {
  AccountSection,
  DemoActorSection,
  ExportSection,
  MembersSection,
  PreferencesSection,
} from "@/features/settings";

// Sheets open from the URL so the phone's back button closes them (useSearchModal).
const searchSchema = z.object({
  member: z.string().uuid().optional().catch(undefined),
  addMember: z.boolean().optional().catch(undefined),
  help: z.boolean().optional().catch(undefined),
});

// SPEC Story 6.2: roles and settings live at /settings.
export const Route = createFileRoute("/settings")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Settings — Pujo Khata" },
      {
        name: "description",
        content: "Committee members and roles, data export and preferences.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = useI18n();
  const { member, addMember, help } = Route.useSearch();
  return (
    <AppShell>
      <h1 className="text-2xl font-extrabold">{t("settingsTitle")}</h1>
      <div className="mt-4 space-y-4">
        <DemoActorSection />
        <MembersSection memberId={member} adding={addMember} />
        <ExportSection />
        <InstallApp variant="card" />
        <PreferencesSection />
        <DevicesSection />
        <HelpSection open={help} />
        <AccountSection />
      </div>
      <div className="h-6" />
    </AppShell>
  );
}
