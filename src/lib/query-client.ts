import { QueryClient } from "@tanstack/react-query";

/**
 * The app's react-query client. Every read and save goes to the phone first (api.ts), so
 * nothing may wait for the network: react-query's default ("online") pauses queries and
 * mutations while the browser is offline, which left the Save button spinning and nothing
 * saved. Calls that do need the server (sync, devices) check for a connection themselves.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { networkMode: "always" },
      mutations: { networkMode: "always" },
    },
  });
}
