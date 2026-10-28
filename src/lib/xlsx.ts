// Excel export (UAT 2026-10-28): the ledgers as .xlsx. Text cells are typed as text, so a
// cell starting with "=" is shown as written and never runs as a formula; amounts stay
// numbers. The first row is the header, in bold and frozen.
import writeXlsxFile from "write-excel-file/universal";
import type { Cell } from "./csv";

export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** A sheet as a Blob, with columns sized to their longest value (capped). */
export async function xlsxBlob(rows: Cell[][], sheet: string): Promise<Blob> {
  const data = rows.map((row, r) =>
    row.map((v) =>
      typeof v === "number" && Number.isFinite(v)
        ? { type: Number, value: v, ...(r === 0 ? { fontWeight: "bold" as const } : {}) }
        : {
            type: String,
            value: v == null ? "" : String(v),
            ...(r === 0 ? { fontWeight: "bold" as const } : {}),
          },
    ),
  );
  const widths = (rows[0] ?? []).map((_, c) =>
    Math.min(40, Math.max(8, ...rows.map((row) => String(row[c] ?? "").length + 2))),
  );
  const blob = await writeXlsxFile(data, {
    sheet,
    columns: widths.map((width) => ({ width })),
    stickyRowsCount: 1,
  }).toBlob();
  return blob.type ? blob : new Blob([blob], { type: XLSX_TYPE });
}
