// This device's identity and its last known standing (cloud mode). Lives in the service layer
// with session.ts: api.ts needs it to refuse chanda on a device that doesn't collect, even
// offline, from what the server last said.
import { z } from "zod";
import { newId } from "@/lib/id";

const ID_KEY = "pk_device_id"; // kept across log-outs, so the same browser stays one device
const STATE_KEY = "pk_device_v1";

const stateSchema = z.object({
  is_collect: z.boolean(),
  collect_label: z.string().nullable(),
});
export type DeviceState = z.infer<typeof stateSchema>;

export const device = {
  /** This browser's device id, created on first use. */
  id(): string {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  },
  /** What the server last said about this device; null before the first check-in. */
  state(): DeviceState | null {
    try {
      const r = stateSchema.safeParse(JSON.parse(localStorage.getItem(STATE_KEY) ?? "null"));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  },
  setState(s: DeviceState) {
    localStorage.setItem(STATE_KEY, JSON.stringify(stateSchema.parse(s)));
  },
  clearState() {
    localStorage.removeItem(STATE_KEY);
  },
};
