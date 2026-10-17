// Cloud mode (Supabase) is on only when both env vars are set at build time. Without them —
// and always for the sample club — the app runs fully on the device, exactly as before.
// See docs/BACKEND.md.

export interface CloudConfig {
  url: string;
  anonKey: string;
}

export function cloudConfig(): CloudConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
}

export const isCloud = () => cloudConfig() !== null;

/** Supabase Auth sends 6-digit SMS codes (its minimum); the device-only mock uses 4. */
export const otpLength = () => (isCloud() ? 6 : 4);
