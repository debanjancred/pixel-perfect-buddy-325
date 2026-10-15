import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { api } from "@/services/api";
import { phoneSchema } from "@/lib/validation";

// Data lives in the browser (offline-first), so queries run client-side only.
export const useSummary = () => useQuery({ queryKey: ["summary"], queryFn: api.getSummary });
export const useClubs = () => useQuery({ queryKey: ["clubs"], queryFn: api.getClubs });
export const useHouseholds = () =>
  useQuery({ queryKey: ["households"], queryFn: api.listHouseholds });
export const useChandas = () => useQuery({ queryKey: ["chandas"], queryFn: api.listChandas });
export const useExpenses = () => useQuery({ queryKey: ["expenses"], queryFn: api.listExpenses });
export const useEvents = () => useQuery({ queryKey: ["events"], queryFn: api.listEvents });
export const useMembers = () => useQuery({ queryKey: ["members"], queryFn: api.listMembers });
export const useLanes = () => useQuery({ queryKey: ["lanes"], queryFn: api.listLanes });

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
