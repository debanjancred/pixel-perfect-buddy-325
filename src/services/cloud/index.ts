import { api } from "../api";
import { setSyncAdapter } from "../sync";
import { createCloudAdapter } from "./adapter";
import { getCloudClient } from "./client";
import { isCloud } from "./config";

/** In cloud mode, route sync through Supabase. Call once in the browser at startup. */
export function initCloud() {
  if (typeof window === "undefined" || !isCloud()) return;
  setSyncAdapter(
    createCloudAdapter(getCloudClient(), { loadVoucher: (id) => api.getVoucherImage(id) }),
  );
}

export { isCloud, otpLength } from "./config";
