const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toBnDigits = (s: string) => s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
export const asciiDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
export const indian = (n: number) => Math.round(n).toLocaleString("en-IN");

/** Local calendar date as "YYYY-MM-DD" (the domain's IsoDate), not the UTC date. */
export const isoDate = (d = new Date()) => d.toLocaleDateString("en-CA");
