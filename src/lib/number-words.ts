// Whole numbers in words using the Indian system (hundred, thousand, lakh, crore).
// Pure and locale-keyed so receipts, CSV exports and tests share one implementation;
// UI code reaches it through `words()` in i18n.tsx.

type Lang = "bn" | "en";

// Bengali has an irregular word for every number below 100, so a lookup table is the only
// correct approach (composing "কুড়ি এক" would be wrong; it is "একুশ").
const BN_0_99 = (
  "শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চোদ্দ পনেরো ষোলো সতেরো আঠারো উনিশ কুড়ি একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আঠাশ ঊনত্রিশ তিরিশ " +
  "একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ ঊনচল্লিশ চল্লিশ একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ ছেচল্লিশ সাতচল্লিশ আটচল্লিশ ঊনপঞ্চাশ পঞ্চাশ " +
  "একান্ন বাহান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন আটান্ন ঊনষাট ষাট একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি ঊনসত্তর সত্তর " +
  "একাত্তর বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর ঊনআশি আশি একাশি বিরাশি তিরাশি চুরাশি পঁচাশি ছিয়াশি সাতাশি অষ্টাশি ঊননব্বই নব্বই " +
  "একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই পঁচানব্বই ছিয়ানব্বই সাতানব্বই আটানব্বই নিরানব্বই"
).split(" ");

const EN_ONES = (
  "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen " +
  "Fifteen Sixteen Seventeen Eighteen Nineteen"
).split(" ");
const EN_TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

interface Locale {
  /** Words for 0–99. */
  below100: (n: number) => string;
  units: { hundred: string; thousand: string; lakh: string; crore: string };
}

const LOCALES: Record<Lang, Locale> = {
  bn: {
    below100: (n) => BN_0_99[n]!,
    units: { hundred: "শত", thousand: "হাজার", lakh: "লক্ষ", crore: "কোটি" },
  },
  en: {
    below100: (n) =>
      n < 20 ? EN_ONES[n]! : EN_TENS[Math.floor(n / 10)]! + (n % 10 ? ` ${EN_ONES[n % 10]!}` : ""),
    units: { hundred: "Hundred", thousand: "Thousand", lakh: "Lakh", crore: "Crore" },
  },
};

function spell(n: number, locale: Locale): string {
  const { below100, units } = locale;
  if (n < 100) return below100(n);
  const groups: [number, string][] = [
    [Math.floor(n / 1e7), units.crore],
    [Math.floor((n % 1e7) / 1e5), units.lakh],
    [Math.floor((n % 1e5) / 1e3), units.thousand],
    [Math.floor((n % 1e3) / 100), units.hundred],
  ];
  // Above 99 crore the crore count is itself spelled out ("One Hundred Crore").
  const parts = groups
    .filter(([count]) => count > 0)
    .map(([count, unit]) => `${spell(count, locale)} ${unit}`);
  if (n % 100) parts.push(below100(n % 100));
  return parts.join(" ");
}

/**
 * Spells a non-negative whole number, e.g. `numberToWords(1001, "bn")` → "এক হাজার এক".
 * Throws for negative, fractional or non-finite input: money is stored as integer rupees,
 * so anything else is a caller bug that should surface, not be rounded away.
 */
export function numberToWords(n: number, lang: Lang): string {
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new RangeError(`numberToWords expects a non-negative integer, got ${n}`);
  }
  return spell(n, LOCALES[lang]);
}
