import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { api } from "@/services/api";
import { phoneSchema, type ExpenseInput } from "@/lib/validation";

// Data lives in the browser (offline-first), so queries run client-side only.
// One key per collection, shared by queries and the mutations that invalidate them.
export const queryKeys = {
  club: ["club"],
  clubs: ["clubs"],
  summary: ["summary"],
  members: ["members"],
  households: ["households"],
  transactions: ["transactions"],
  expenses: ["expenses"],
  events: ["events"],
  voucher: (id: string) => ["voucher", id],
} as const;

export const useClub = () => useQuery({ queryKey: queryKeys.club, queryFn: api.getClub });
export const useClubs = () => useQuery({ queryKey: queryKeys.clubs, queryFn: api.listClubs });
export const useSummary = () => useQuery({ queryKey: queryKeys.summary, queryFn: api.getSummary });
export const useMembers = () => useQuery({ queryKey: queryKeys.members, queryFn: api.listMembers });
export const useHouseholds = () =>
  useQuery({ queryKey: queryKeys.households, queryFn: api.listHouseholds });
export const useTransactions = () =>
  useQuery({ queryKey: queryKeys.transactions, queryFn: api.listChanda });
export const useExpenses = () =>
  useQuery({ queryKey: queryKeys.expenses, queryFn: api.listExpenses });
export const useEvents = () => useQuery({ queryKey: queryKeys.events, queryFn: api.listEvents });

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

/** The signed-in member (matched by phone); demo sessions act as the first collector. */
export function useCurrentMember() {
  const { data: members = [] } = useMembers();
  const s = session.get();
  return (
    (s?.mode === "user" ? members.find((m) => m.phone === s.phone) : undefined) ??
    members.find((m) => m.role === "collector") ??
    members[0]
  );
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

export function useRegisterEvent() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: api.registerEvent,
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

/** Marks pending records synced; refetches only when something changed. */
export function useSync() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: api.sync,
    onSuccess: ({ synced }) =>
      synced > 0
        ? invalidate(queryKeys.transactions, queryKeys.expenses, queryKeys.summary)
        : undefined,
  });
}

// Club-level changes swap every collection, so they invalidate everything.
function useClubMutation<A, R>(fn: (arg: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries() });
}
export const useSeedDemo = () => useClubMutation(api.seedDemo);
export const useResetDemo = () => useClubMutation(api.resetDemo);
/** Creating a club signs its creator in, so the app acts as them (its admin) from now on. */
export const useCreateClub = () =>
  useClubMutation(async (input: Parameters<typeof api.createClub>[0]) => {
    const club = await api.createClub(input);
    session.set({ mode: "user", phone: input.creator_phone });
    return club;
  });
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

const SESSION = "pk_session_v1";
const sessionSchema = z.union([
  z.object({ mode: z.literal("demo") }),
  z.object({ mode: z.literal("user"), phone: phoneSchema }),
]);
type Session = z.infer<typeof sessionSchema>;

export const session = {
  /** Returns null for a missing or tampered session so guards treat it as logged out. */
  get(): Session | null {
    try {
      const r = sessionSchema.safeParse(JSON.parse(localStorage.getItem(SESSION) ?? "null"));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  },
  set(s: Session) {
    localStorage.setItem(SESSION, JSON.stringify(sessionSchema.parse(s)));
  },
  clear() {
    localStorage.removeItem(SESSION);
  },
};
