import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/services/api";
import { session } from "@/services/session";
import { can, type Permission } from "@/lib/permissions";
import type { ExpenseInput } from "@/lib/validation";
import type { ClubEvent } from "@/types/domain";

// Data lives in the browser (offline-first), so queries run client-side only.
// One key per collection, shared by queries and the mutations that invalidate them.
export const queryKeys = {
  club: ["club"],
  clubs: ["clubs"],
  summary: ["summary"],
  // Under "summary" so every mutation that refreshes the summary refreshes this too.
  accounts: (slug: string) => ["summary", "accounts", slug],
  syncStatus: ["summary", "sync"],
  // Under "summary" so a sync that sends a request refreshes its status.
  helpRequests: ["summary", "help"],
  members: ["members"],
  me: ["members", "me"],
  households: ["households"],
  transactions: ["transactions"],
  expenses: ["expenses"],
  events: ["events"],
  handovers: ["handovers"],
  voucher: (id: string) => ["voucher", id],
  devices: ["devices"],
  collectStanding: ["devices", "standing"],
  appConfig: ["appConfig"],
} as const;

/**
 * The owner's app_config (ADR 0002 §3): the phone's last copy straight away, then a fresh one
 * in the background on open and whenever the app comes back to the foreground.
 */
export const useAppConfig = () =>
  useQuery({
    queryKey: queryKeys.appConfig,
    queryFn: api.getAppConfig,
    initialData: () => api.cachedAppConfig(),
    initialDataUpdatedAt: 0, // stale at once: refresh in the background on every open
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

export const useClub = () => useQuery({ queryKey: queryKeys.club, queryFn: api.getClub });
export const useClubs = () => useQuery({ queryKey: queryKeys.clubs, queryFn: api.listClubs });
export const useSummary = () => useQuery({ queryKey: queryKeys.summary, queryFn: api.getSummary });
export const useSyncStatus = () =>
  useQuery({ queryKey: queryKeys.syncStatus, queryFn: api.getSyncStatus });
/** Failed records and why; under syncStatus so a sync refreshes it. */
export const useSyncFailures = (enabled: boolean) =>
  useQuery({
    queryKey: [...queryKeys.syncStatus, "failures"],
    queryFn: api.listSyncFailures,
    enabled,
  });
export const useClubAccounts = (slug: string) =>
  useQuery({ queryKey: queryKeys.accounts(slug), queryFn: () => api.getClubAccounts(slug) });
export const useMembers = () => useQuery({ queryKey: queryKeys.members, queryFn: api.listMembers });
export const useHouseholds = () =>
  useQuery({ queryKey: queryKeys.households, queryFn: api.listHouseholds });
export const useTransactions = () =>
  useQuery({ queryKey: queryKeys.transactions, queryFn: api.listChanda });
export const useExpenses = () =>
  useQuery({ queryKey: queryKeys.expenses, queryFn: api.listExpenses });
export const useEvents = () => useQuery({ queryKey: queryKeys.events, queryFn: api.listEvents });
export const useHandovers = () =>
  useQuery({ queryKey: queryKeys.handovers, queryFn: api.listHandovers });

/** Object URL for a stored voucher photo, revoked when the component unmounts. */
export function useVoucherImage(id: string | undefined) {
  const { data: blob } = useQuery({
    queryKey: queryKeys.voucher(id ?? ""),
    queryFn: () => api.getVoucherImage(id!),
    enabled: !!id,
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

/**
 * The member the app acts as in the active club (signed-in phone, or the demo's chosen
 * member). Undefined when the user isn't a member of this club: then nothing is allowed.
 */
export function useCurrentMember() {
  const { data } = useQuery({ queryKey: queryKeys.me, queryFn: api.getCurrentMember });
  return data ?? undefined;
}

/** Whether the current member may do `p` — for hiding actions; api.ts enforces it too. */
export const usePermission = (p: Permission) => can(useCurrentMember(), p);

/** For gating a whole screen: `isPending` avoids flashing "no access" while loading. */
export function useAccess(p: Permission) {
  const { data, isPending } = useQuery({ queryKey: queryKeys.me, queryFn: api.getCurrentMember });
  return { allowed: can(data, p), isPending };
}

/** Demo only: act as another member of the sample club to try each role. */
export function useSetDemoActor() {
  const qc = useQueryClient();
  return (member_id: string) => {
    session.set({ mode: "demo", member_id });
    return qc.invalidateQueries();
  };
}

// Mutations return the invalidation promise so `mutateAsync` resolves only after the
// affected queries have refetched.
function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: (readonly unknown[])[]) =>
    Promise.all(keys.map((queryKey) => qc.invalidateQueries({ queryKey })));
}

/** Records are saved locally as pending; when online, run the sync adapter straight away. */
const syncIfOnline = () => (navigator.onLine ? api.sync() : Promise.resolve());

export function useAddHousehold() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: api.createHousehold,
    onSuccess: () => invalidate(queryKeys.households),
  });
}

export function useAddTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: api.addTransaction,
    onSuccess: async () => {
      await syncIfOnline();
      await invalidate(queryKeys.transactions, queryKeys.summary);
    },
  });
}

export function useVoidTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.voidChanda(id, reason),
    onSuccess: async () => {
      await syncIfOnline();
      await invalidate(queryKeys.transactions, queryKeys.summary);
    },
  });
}

/**
 * Saves the voucher photo (if any) to IndexedDB first, then the expense pointing at it.
 * A photo that ends up unreferenced (expense rejected, or a retry of an already-saved
 * expense) is deleted so IndexedDB holds no orphans.
 */
export function useAddExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      voucher,
      ...input
    }: Omit<ExpenseInput, "voucher_image_id"> & { voucher?: Blob | null }) => {
      const voucher_image_id = voucher ? await api.saveVoucherImage(voucher) : undefined;
      const discard = () =>
        voucher_image_id ? api.deleteVoucherImage(voucher_image_id).catch(() => {}) : undefined;
      try {
        const saved = await api.addExpense({
          ...input,
          ...(voucher_image_id ? { voucher_image_id } : {}),
        });
        // An idempotent retry returns the record saved earlier, with its own photo.
        if (saved.voucher_image_id !== voucher_image_id) await discard();
        return saved;
      } catch (e) {
        await discard();
        throw e;
      }
    },
    onSuccess: async () => {
      await syncIfOnline();
      await invalidate(queryKeys.expenses, queryKeys.summary);
    },
  });
}

export function useVoidExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.voidExpense(id, reason),
    onSuccess: async () => {
      await syncIfOnline();
      await invalidate(queryKeys.expenses, queryKeys.summary);
    },
  });
}

export function useCreateHandover() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: api.createHandover,
    onSuccess: async () => {
      await syncIfOnline();
      await invalidate(queryKeys.handovers, queryKeys.summary);
    },
  });
}

export function useVoidHandover() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.voidHandover(id, reason),
    onSuccess: async () => {
      await syncIfOnline();
      await invalidate(queryKeys.handovers, queryKeys.summary);
    },
  });
}

/**
 * Registration tally changes are applied to the cache immediately (taps during a busy
 * event must feel instant), rolled back if the save fails, then refetched.
 */
function useEventTally(fn: (id: string) => Promise<ClubEvent>, delta: 1 | -1) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: queryKeys.events });
      const previous = qc.getQueryData<ClubEvent[]>(queryKeys.events);
      qc.setQueryData<ClubEvent[]>(queryKeys.events, (list) =>
        list?.map((e) =>
          e.id === id
            ? { ...e, registrations_count: Math.max(0, e.registrations_count + delta) }
            : e,
        ),
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => qc.setQueryData(queryKeys.events, ctx?.previous),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.events }),
  });
}
export const useRegisterEvent = () => useEventTally(api.registerEvent, 1);
export const useUnregisterEvent = () => useEventTally(api.unregisterEvent, -1);

export function useCreateEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: api.createEvent,
    onSuccess: () => invalidate(queryKeys.events),
  });
}

export function useUpdateEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; title: string; date: string }) =>
      api.updateEvent(id, input),
    onSuccess: () => invalidate(queryKeys.events),
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: api.deleteEvent,
    onSuccess: () => invalidate(queryKeys.events),
  });
}

export function useCreateMember() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: api.createMember,
    onSuccess: () => invalidate(queryKeys.members),
  });
}

export function useUpdateMemberRole() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Parameters<typeof api.updateMemberRole>[1] }) =>
      api.updateMemberRole(id, role),
    onSuccess: () => invalidate(queryKeys.members),
  });
}

/** Background sync has its own banner, so the top loading strip leaves it out. */
export const SYNC_KEY = ["sync"] as const;

/** Marks pending records synced; refetches only when something changed. */
export function useSync() {
  const qc = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationKey: SYNC_KEY,
    // Send this device's changes, then bring down other devices' (cloud mode only).
    mutationFn: async () => {
      const pushed = await api.sync();
      const { pulled } = await api.pull().catch(() => ({ pulled: 0 }));
      return { ...pushed, pulled };
    },
    onSuccess: ({ synced, failed, pulled }) => {
      // Pulled changes can touch any collection.
      if (pulled > 0) return qc.invalidateQueries();
      if (synced + failed === 0) return undefined;
      return invalidate(
        queryKeys.transactions,
        queryKeys.expenses,
        queryKeys.handovers,
        queryKeys.summary,
      );
    },
  });
}

// Club-level changes swap every collection, so they invalidate everything.
// Zero-argument api functions get `void` variables, so `mutateAsync()` type-checks.
type VariablesOf<F> = F extends () => unknown
  ? void
  : F extends (arg: infer A) => unknown
    ? A
    : never;
function useClubMutation<F extends (arg: never) => Promise<unknown>>(fn: F) {
  const qc = useQueryClient();
  return useMutation<Awaited<ReturnType<F>>, Error, VariablesOf<F>>({
    mutationFn: fn as unknown as (v: VariablesOf<F>) => Promise<Awaited<ReturnType<F>>>,
    onSuccess: () => qc.invalidateQueries(),
  });
}
export const useSeedDemo = () => useClubMutation(api.seedDemo);
export const useResetDemo = () => useClubMutation(api.resetDemo);
/** api.createClub signs the creator in, so the app acts as them (its admin) from now on. */
export const useCreateClub = () => useClubMutation(api.createClub);
export const useSetActiveClub = () => useClubMutation(api.setActiveClub);

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

// Session storage lives in the service layer; re-exported for existing imports.
export { session } from "@/services/session";

// --- Settings → Help (cloud mode): saved on the phone, sent with the next sync ---

/** Whether this session can send help requests (a phone login in cloud mode). */
export const useHelpAvailable = () =>
  useQuery({ queryKey: ["help", "available"], queryFn: async () => api.helpAvailable() });

/** This person's help requests in the active club (server status when online). */
export const useHelpRequests = (enabled: boolean) =>
  useQuery({ queryKey: queryKeys.helpRequests, queryFn: api.listHelpRequests, enabled });

/** Saves a help request, then sends it straight away when online; returns it as it now is. */
export function useSubmitHelpRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: Parameters<typeof api.submitHelpRequest>[0]) => {
      const ticket = await api.submitHelpRequest(input);
      await syncIfOnline().catch(() => undefined);
      return (await api.listHelpRequests()).find((t) => t.id === ticket.id) ?? ticket;
    },
    onSuccess: () => invalidate(queryKeys.summary),
  });
}

// --- Devices (cloud mode): up to 3 per person, chanda collected on one of them ---

/** Whether chanda can be collected on this device (answers offline from the last check-in). */
export const useCollectStanding = () =>
  useQuery({ queryKey: queryKeys.collectStanding, queryFn: api.getCollectStanding });

/** The signed-in person's devices; needs the network, so only fetched when `enabled`. */
export const useDevices = (enabled: boolean) =>
  useQuery({ queryKey: queryKeys.devices, queryFn: api.listDevices, enabled, retry: false });

function useDeviceMutation<V>(fn: (v: V) => Promise<unknown>) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: () => invalidate(queryKeys.devices) });
}
export const useSetCollectDevice = () => useDeviceMutation(api.setCollectDevice);
export const useRemoveDevice = () => useDeviceMutation(api.removeDevice);
export const useResetCollectDevice = () => useDeviceMutation(api.resetCollectDevice);

/**
 * Checks this device in after a sync. Resolves "removed" or "limit" when it has been signed
 * out (removed from another device, or a 4th device from before the limit existed).
 */
export function useDeviceCheck() {
  const qc = useQueryClient();
  return async () => {
    const status = await api.checkDevice().catch(() => "skipped" as const);
    if (status === "removed" || status === "limit") {
      await api.signOut();
      return status;
    }
    await qc.invalidateQueries({ queryKey: queryKeys.devices });
    return status;
  };
}
