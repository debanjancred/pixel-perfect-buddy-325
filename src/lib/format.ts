const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
export const toBnDigits = (s: string) => s.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
export const asciiDigits = (s: string) => s.replace(/[০-৯]/g, (d) => String(BN_DIGITS.indexOf(d)));
export const indian = (n: number) => Math.round(n).toLocaleString("en-IN");
