/**
 * Generator kode transaksi 6Mart (blueprint §41).
 * Format: PREFIX-YYYYMMDD-SEQ
 * Contoh: SAL-20260927-000001
 */

export type CodePrefix =
  | "SAL"
  | "INV"
  | "RFD"
  | "TOP"
  | "WDR"
  | "PO"
  | "EXP"
  | "JRN"
  | "LRY"
  | "BRS"
  | "JST"
  | "PPB"
  | "STU"
  | "PRN"
  | "WAL"
  | "SHF"
  | "RFN"
  | "RFD"
  | "WLT";

export function formatDateCode(timestamp: number): string {
  const d = new Date(timestamp);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Membentuk kode transaksi. `sequence` adalah nomor urut harian yang
 * dihitung oleh pemanggil (dari jumlah record hari ini + 1).
 */
export function buildCode(prefix: CodePrefix, timestamp: number, sequence: number): string {
  return `${prefix}-${formatDateCode(timestamp)}-${String(sequence).padStart(6, "0")}`;
}

/** Nomor urut harian berikutnya, dipakai oleh mutation sebelum insert. */
export function nextSequence(countToday: number): number {
  return countToday + 1;
}
