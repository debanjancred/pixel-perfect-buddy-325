import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Home,
  BookOpen,
  Receipt,
  Trophy,
  Settings,
  ChevronDown,
  Wifi,
  CloudOff,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useI18n, type TKey } from "@/lib/i18n";
import { setMonitoringContext } from "@/services/monitoring";
import {
  session,
  useAccess,
  useClub,
  useCurrentMember,
  useAppConfig,
  useDeviceCheck,
  useInvalidateAll,
  useOnline,
  useSync,
  useSyncStatus,
} from "@/hooks/use-data";
import { AlponaStrip, LangToggle, Modal } from "./ui";
import { ClubPicker } from "./ClubPicker";
import { SyncBanner } from "./SyncBanner";
import { AppNotice } from "@/features/app-status";
import { appStatus } from "@/lib/app-status";
import { APP_VERSION } from "@/lib/version";

const NAV: {
  to: "/home" | "/chanda" | "/expenses" | "/events" | "/settings";
  icon: typeof Home;
  k: TKey;
}[] = [
  { to: "/home", icon: Home, k: "home" },
  { to: "/chanda", icon: BookOpen, k: "chanda" },
  { to: "/expenses", icon: Receipt, k: "expense" },
  { to: "/events", icon: Trophy, k: "events" },
  { to: "/settings", icon: Settings, k: "admin" },
];

export function AppShell({ children, fab }: { children: ReactNode; fab?: ReactNode }) {
  const { t, pick, n, lang } = useI18n();
  const navigate = useNavigate();
  const online = useOnline();
  const invalidate = useInvalidateAll();
  const { data: club, isSuccess: clubLoaded } = useClub();
  const { data: syncStatus } = useSyncStatus();
  const me = useCurrentMember();
  const membership = useAccess("chanda.add");
  const sync = useSync();
  const checkDevice = useDeviceCheck();
  const { data: appConfig = null } = useAppConfig();
  const syncPaused = appStatus(appConfig, APP_VERSION).syncPaused;
  const [authed, setAuthed] = useState(false);
  const [clubOpen, setClubOpen] = useState(false);
  // Read on render: the picker only mounts client-side, once the modal is opened.
  const current = session.get();
  const signedInPhone = current?.mode === "user" ? current.phone : undefined;
  const [pull, setPull] = useState(0);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    if (session.get()) setAuthed(true);
    else navigate({ to: "/", replace: true });
  }, [navigate]);

  // A session without a club (e.g. data cleared) goes back to onboarding.
  useEffect(() => {
    if (authed && clubLoaded && !club) {
      session.clear();
      navigate({ to: "/", replace: true });
    }
  }, [authed, clubLoaded, club, navigate]);

  // Error reports carry ids only (ADR 0002): which club, role and language it happened in.
  useEffect(() => {
    setMonitoringContext({ club_id: club?.id, role: me?.role, mode: current?.mode, locale: lang });
  }, [club?.id, me?.role, current?.mode, lang]);

  useEffect(() => {
    if (!online) return;
    sync
      .mutateAsync()
      .then(({ synced }) => {
        if (synced > 0) toast.success(`${n(String(synced))} ✓ ${t("synced")}`);
      })
      // After the push, so a device removed elsewhere has sent what it had before logging out.
      .then(checkDevice)
      .then((status) => {
        if (status !== "removed" && status !== "limit") return;
        // A lasting notice on the login screen, not a toast: they may look away.
        navigate({ to: "/", search: { signedOut: status }, replace: true });
      });
    // Also when the owner lifts a pause (maintenance over, or this app was updated).
  }, [online, syncPaused]); // eslint-disable-line react-hooks/exhaustive-deps

  const onStart = (e: React.TouchEvent) => {
    startY.current = window.scrollY <= 0 ? e.touches[0]!.clientY : null;
  };
  const onMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    setPull(Math.max(0, Math.min(90, (e.touches[0]!.clientY - startY.current) * 0.5)));
  };
  const onEnd = async () => {
    if (pull > 60) {
      await invalidate();
      toast(t("refreshed"));
    }
    setPull(0);
    startY.current = null;
  };

  // Render nothing until the session is confirmed so logged-out users never see app data.
  if (!authed) return <div className="min-h-screen bg-background" aria-busy="true" />;

  return (
    <div
      className="mx-auto min-h-screen max-w-2xl pb-28"
      onTouchStart={onStart}
      onTouchMove={onMove}
      onTouchEnd={onEnd}
    >
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <AlponaStrip />
        <div className="flex items-center gap-2 px-4 py-2">
          <button
            onClick={() => setClubOpen(true)}
            className="tap flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <img
              src="/icon-192.png"
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg"
              width={36}
              height={36}
            />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-bold leading-tight text-primary">
                {club ? pick(club.name_bn, club.name_en) : t("app")}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {online ? (
                  <Wifi className="h-3 w-3 text-success" />
                ) : (
                  <CloudOff className="h-3 w-3 text-warning" />
                )}
                {online ? t("online") : t("offline")}
                <ChevronDown className="h-3 w-3" />
              </div>
            </div>
          </button>
          <LangToggle />
        </div>
        {current?.mode === "demo" && me && (
          <Link
            to="/settings"
            hash="demo-actor"
            className="flex min-h-12 items-center justify-center gap-2 bg-gold-soft px-4 text-xs font-semibold text-gold-ink"
          >
            {t("demoAs", { name: me.name, role: t(`role_${me.role}`) })}
            <span className="underline">{t("changeRole")}</span>
          </Link>
        )}
        {clubLoaded && club && !membership.isPending && !me && (
          <div
            role="status"
            className="bg-info-soft px-4 py-1.5 text-center text-xs font-semibold text-info"
          >
            {t("viewOnly")}
          </div>
        )}
        <AppNotice config={appConfig} />
        <SyncBanner
          online={online}
          paused={syncPaused}
          pending={syncStatus?.pending ?? 0}
          failed={syncStatus?.failed ?? 0}
          retrying={sync.isPending}
          onRetry={() => sync.mutate()}
        />
      </header>

      <div
        className="flex justify-center overflow-hidden transition-[height]"
        style={{ height: pull }}
      >
        <RefreshCw
          className="mt-3 h-5 w-5 text-primary"
          style={{ transform: `rotate(${pull * 4}deg)` }}
        />
      </div>

      <main className="px-4 pt-4">{children}</main>

      {fab}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-5">
          {NAV.map(({ to, icon: Icon, k }) => (
            <Link
              key={to}
              to={to}
              className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-muted-foreground"
              activeProps={{ className: "text-primary" }}
            >
              <Icon className="h-6 w-6" />
              {t(k)}
            </Link>
          ))}
        </div>
      </nav>

      <Modal open={clubOpen} onClose={() => setClubOpen(false)} title={t("switchClub")}>
        <ClubPicker phone={signedInPhone} onDone={() => setClubOpen(false)} />
      </Modal>
    </div>
  );
}

export function Fab({ to, label }: { to: "/collect"; label: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="btn btn-primary shadow-fab fixed bottom-24 right-4 z-40 h-16 rounded-full px-6 text-base"
    >
      <span className="text-2xl leading-none">+</span> {label}
    </Link>
  );
}
