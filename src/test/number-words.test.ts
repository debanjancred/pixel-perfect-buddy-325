import { describe, expect, it } from "vitest";

import { numberToWords } from "@/lib/number-words";

describe("numberToWords (Indian system)", () => {
  it.each([
    [0, "শূন্য"],
    [21, "একুশ"],
    [99, "নিরানব্বই"],
    [100, "এক শত"],
    [501, "পাঁচ শত এক"],
    [1001, "এক হাজার এক"],
    [12500, "বারো হাজার পাঁচ শত"],
    [100000, "এক লক্ষ"],
    [1000000, "দশ লক্ষ"],
    [250000001, "পঁচিশ কোটি এক"],
    [25000001, "দুই কোটি পঞ্চাশ লক্ষ এক"],
  ])("bn %i → %s", (n, words) => expect(numberToWords(n, "bn")).toBe(words));

  it.each([
    [0, "Zero"],
    [15, "Fifteen"],
    [42, "Forty Two"],
    [1001, "One Thousand One"],
    [12500, "Twelve Thousand Five Hundred"],
    [250000, "Two Lakh Fifty Thousand"],
    [
      1234567890,
      "One Hundred Twenty Three Crore Forty Five Lakh Sixty Seven Thousand Eight Hundred Ninety",
    ],
  ])("en %i → %s", (n, words) => expect(numberToWords(n, "en")).toBe(words));

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects %s", (n) => {
    expect(() => numberToWords(n, "en")).toThrow(RangeError);
  });
});
