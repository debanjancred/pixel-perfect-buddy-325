// CSV export (SPEC Sprint 3): UTF-8 with BOM so Excel shows Bengali correctly; amounts as
// plain ASCII numbers so they stay numeric in a spreadsheet.

export type Cell = string | number | null | undefined;

/**
 * Quotes every text cell and neutralises spreadsheet formulas: a cell starting with
 * = + - @ (or a tab/CR) would otherwise run as a formula when opened in Excel or Sheets.
 * Numbers are written bare.
 */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const toCsv = (rows: Cell[][]) =>
  "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

export const csvBlob = (rows: Cell[][]) =>
  new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
