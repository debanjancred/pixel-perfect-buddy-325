/** package.json version, injected at build time (vite.config.ts `define`). */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Supabase project URL — set both to turn on cloud mode (docs/BACKEND.md). */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Sentry project DSN — error monitoring for production builds (ADR 0002). */
  readonly VITE_SENTRY_DSN?: string;
}
