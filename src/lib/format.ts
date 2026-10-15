const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toBnDigits = (s: string) => s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
export const asciiDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
export const indian = (n: number) => Math.round(n).toLocaleString("en-IN");

const BN_WORDS = (
  "শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চোদ্দ পনেরো ষোলো সতেরো আঠারো উনিশ কুড়ি একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আঠাশ ঊনত্রিশ তিরিশ " +
  "একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ ঊনচল্লিশ চল্লিশ একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ ছেচল্লিশ সাতচল্লিশ আটচল্লিশ ঊনপঞ্চাশ পঞ্চাশ " +
  "একান্ন বাহান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন আটান্ন ঊনষাট ষাট একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি ঊনসত্তর সত্তর " +
  "একাত্তর বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর ঊনআশি আশি একাশি বিরাশি তিরাশি চুরাশি পঁচাশি ছিয়াশি সাতাশি অষ্টাশি ঊননব্বই নব্বই " +
  "একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই পঁচানব্বই ছিয়ানব্বই সাতানব্বই আটানব্বই নিরানব্বই"
).split(" ");

const EN_ONES =
  "Zero One Two Three Four Five Six Seven Eight Nine Ten Eleven Twelve Thirteen Fourteen Fifteen Sixteen Seventeen Eighteen Nineteen".split(
    " ",
  );
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
const en2 = (n: number): string =>
  n < 20 ? EN_ONES[n]! : EN_TENS[Math.floor(n / 10)]! + (n % 10 ? " " + EN_ONES[n % 10]! : "");

function words(n: number, two: (x: number) => string, u: [string, string, string, string]) {
  if (n === 0) return two(0);
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7),
    lakh = Math.floor((n % 1e7) / 1e5),
    th = Math.floor((n % 1e5) / 1e3),
    h = Math.floor((n % 1e3) / 100),
    r = n % 100;
  if (crore) parts.push(`${crore < 100 ? two(crore) : words(crore, two, u)} ${u[3]}`);
  if (lakh) parts.push(`${two(lakh)} ${u[2]}`);
  if (th) parts.push(`${two(th)} ${u[1]}`);
  if (h) parts.push(`${two(h)} ${u[0]}`);
  if (r) parts.push(two(r));
  return parts.join(" ");
}

export function amountInWords(n: number, lang: "bn" | "en") {
  const v = Math.round(n);
  return lang === "bn"
    ? `${words(v, (x) => BN_WORDS[x] ?? "", ["শত", "হাজার", "লক্ষ", "কোটি"])} টাকা মাত্র`
    : `Rupees ${words(v, en2, ["Hundred", "Thousand", "Lakh", "Crore"])} Only`;
}
