import { describe, expect, it, vi } from "vitest";

import { compressImage, fitScale, ImageError, pickEncoding } from "@/lib/image";

const blobOf = (size: number) => new Blob([new Uint8Array(size)], { type: "image/jpeg" });

describe("fitScale", () => {
  it("only ever scales down, by the longest side", () => {
    expect(fitScale(4000, 3000, 1600)).toBe(0.4);
    expect(fitScale(3000, 4000, 1600)).toBe(0.4);
    expect(fitScale(800, 600, 1600)).toBe(1);
  });
});

describe("pickEncoding", () => {
  it("returns the first encoding under the limit, lowering quality before size", async () => {
    const encode = vi.fn(async (scale: number, q: number) => blobOf(Math.round(1000 * scale * q)));
    const out = await pickEncoding(encode, 650);
    expect(out.size).toBeLessThanOrEqual(650);
    // 0.82 → 820, 0.72 → 720, 0.62 → 620 ✓ (all at full size)
    expect(encode.mock.calls.map(([s]) => s)).toEqual([1, 1, 1]);
  });

  it("shrinks the image when quality alone isn't enough", async () => {
    const encode = vi.fn(async (scale: number, q: number) => blobOf(Math.round(1000 * scale * q)));
    const out = await pickEncoding(encode, 400);
    expect(out.size).toBeLessThanOrEqual(400);
    expect(encode.mock.calls.some(([s]) => s < 1)).toBe(true);
  });

  it("falls back to the smallest result when nothing fits", async () => {
    const out = await pickEncoding(async (scale) => blobOf(Math.round(10_000 * scale)), 1);
    expect(out.size).toBe(Math.round(10_000 * 0.75 ** 3));
  });
});

describe("compressImage input checks", () => {
  const codeOf = (p: Promise<unknown>) =>
    p.then(
      () => null,
      (e: unknown) => (e instanceof ImageError ? e.code : e),
    );

  it("rejects files that aren't images", async () => {
    expect(await codeOf(compressImage(new Blob(["%PDF"], { type: "application/pdf" })))).toBe(
      "err_photoType",
    );
  });

  it("rejects inputs over the size guard before decoding", async () => {
    expect(await codeOf(compressImage(blobOf(11), { maxInputBytes: 10 }))).toBe(
      "err_photoTooLarge",
    );
  });
});
