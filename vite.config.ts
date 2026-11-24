// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync, readdirSync } from "node:fs";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { loadEnv, type Plugin } from "vite";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Error monitoring (ADR 0002): with a Sentry organization token in the build environment,
// production builds upload source maps so stack traces show the real files and lines, then
// delete the maps so they are never published. Without the token nothing changes.
// Organization and token come from the environment (SENTRY_ORG, SENTRY_AUTH_TOKEN), never
// the source; uploading needs both.
const sentryEnv = { ...loadEnv("production", process.cwd(), "SENTRY_"), ...process.env };
const sentryOrg = sentryEnv["SENTRY_ORG"];
const sentryToken = sentryOrg ? sentryEnv["SENTRY_AUTH_TOKEN"] : undefined;

/** Fails the build if a source map would be published (they reveal the full source). */
const noPublicSourceMaps: Plugin = {
  name: "pk-no-public-sourcemaps",
  apply: "build",
  closeBundle: {
    order: "post",
    handler() {
      let files: string[] = [];
      try {
        files = readdirSync(".output/public", { recursive: true, encoding: "utf8" });
      } catch {
        return; // not written yet (server build) or no output
      }
      const maps = files.filter((f) => f.endsWith(".map"));
      if (maps.length) throw new Error(`Source maps left in .output/public: ${maps.join(", ")}`);
    },
  },
};

export default defineConfig({
  // Shown in Settings so testers can report which build they are on.
  vite: {
    define: { __APP_VERSION__: JSON.stringify(version) },
    ...(sentryToken && { build: { sourcemap: "hidden" } }),
  },
  plugins:
    sentryOrg && sentryToken
      ? [
          sentryVitePlugin({
            org: sentryOrg,
            project: sentryEnv["SENTRY_PROJECT"] ?? "pujo-khata",
            authToken: sentryToken,
            // Same name the app reports (src/services/monitoring.ts).
            release: { name: `pujo-khata@${version}` },
            // Explicit path: a bare "**/*.map" skips dot-folders like .output and would match
            // node_modules instead.
            sourcemaps: { filesToDeleteAfterUpload: [".output/public/**/*.map"] },
            telemetry: false,
          }),
          noPublicSourceMaps,
        ]
      : [],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
