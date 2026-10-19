import { afterEach, describe, expect, it, vi } from "vitest";

import { newId } from "@/lib/id";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => vi.unstubAllGlobals());

describe("newId", () => {
  it("makes v4 UUIDs on plain http too, where crypto.randomUUID is missing", () => {
    const { getRandomValues } = crypto;
    vi.stubGlobal("crypto", { getRandomValues: getRandomValues.bind(crypto) });
    const ids = Array.from({ length: 50 }, newId);
    ids.forEach((id) => expect(id).toMatch(V4));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses crypto.randomUUID when the browser has it", () => {
    expect(newId()).toMatch(V4);
  });
});
