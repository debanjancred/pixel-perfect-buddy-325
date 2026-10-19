import { onlineManager } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import { createQueryClient } from "@/lib/query-client";

afterEach(() => onlineManager.setOnline(true));

describe("query client (offline-first)", () => {
  it("runs saves while the phone is offline instead of pausing them", async () => {
    onlineManager.setOnline(false);
    const qc = createQueryClient();
    const save = qc.getMutationCache().build(qc, { mutationFn: async () => "saved" });
    await expect(save.execute(undefined)).resolves.toBe("saved");
  });

  it("reads while offline too", async () => {
    onlineManager.setOnline(false);
    const qc = createQueryClient();
    await expect(qc.fetchQuery({ queryKey: ["x"], queryFn: async () => 42 })).resolves.toBe(42);
  });
});
