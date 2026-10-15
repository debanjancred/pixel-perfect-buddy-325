import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/services/api";

// Data lives in the browser (offline-first), so queries run client-side only.
export const useSummary = () => useQuery({ queryKey: ["summary"], queryFn: api.getSummary });
export const useClubs = () => useQuery({ queryKey: ["clubs"], queryFn: api.getClubs });
export const useHouseholds = () => useQuery({ queryKey: ["households"], queryFn: api.listHouseholds });
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
export const session = {
  get(): { mode: "demo" | "user"; phone?: string } | null {
    try {
      return JSON.parse(localStorage.getItem(SESSION) ?? "null");
    } catch {
      return null;
    }
  },
  set(s: { mode: "demo" | "user"; phone?: string }) {
    localStorage.setItem(SESSION, JSON.stringify(s));
  },
  clear() {
    localStorage.removeItem(SESSION);
  },
};
