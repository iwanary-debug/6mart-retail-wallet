/**
 * Utilitas uang untuk 6Mart.
 *
 * ATURAN: seluruh nilai uang adalah INTEGER rupiah penuh. Tidak ada floating
 * point untuk uang. 6Mart tidak memakai pecahan sen dalam operasional, tetapi
 * `averageCost` (HPP rata-rata tertimbang) boleh pecahan sen — karena itu
 * average cost dibulatkan ke sen terdekat (2 desimal) untuk akurasi HPP.
 */

export type Rupiah = number;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

/** Pastikan nilai uang adalah integer rupiah yang valid (tidak negatif). */
export function assertRupiah(value: unknown, field = "amount"): asserts value is Rupiah {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MoneyError(`${field} harus berupa angka`);
  }
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${field} harus bilangan bulat rupiah (tanpa pecahan)`);
  }
  if (value < 0) {
    throw new MoneyError(`${field} tidak boleh negatif`);
  }
  if (value > 1_000_000_000_000) {
    throw new MoneyError(`${field} melebihi batas maksimum yang diizinkan`);
  }
}

/** Normalisasi input uang dari form/user: string "10.000" atau number. */
export function parseRupiah(input: string | number): Rupiah {
  if (typeof input === "number") {
    assertRupiah(Math.round(input));
    return Math.round(input);
  }
  const cleaned = input.replace(/[^\d-]/g, "");
  if (cleaned === "" || cleaned === "-") throw new MoneyError("Nominal uang tidak valid");
  const parsed = Number(cleaned);
  assertRupiah(parsed, "Nominal uang");
  return parsed;
}

/** Bulatkan ke sen terdekat untuk average cost / nilai persediaan. */
export function roundToSen(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Format Rp untuk tampilan: 15000 -> "Rp15.000" */
export function formatRupiah(value: number, withSymbol = true): string {
  const rounded = Math.round(value);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative ? "-" : ""}${withSymbol ? "Rp" : ""}${grouped}`;
}

/** Format ringkas untuk kartu statistik: 1500000 -> "Rp1,5 jt" */
export function formatRupiahShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}Rp${(abs / 1_000_000_000).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1_000_000) return `${sign}Rp${(abs / 1_000_000).toFixed(1).replace(".", ",")} jt`;
  if (abs >= 1_000) return `${sign}Rp${Math.round(abs / 1_000)} rb`;
  return `${sign}Rp${abs}`;
}

/** Format angka desimal (qty, berat, dll). */
export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/** Hitung total dari daftar nominal, aman dari floating point. */
export function sumRupiah(values: number[]): Rupiah {
  return values.reduce((acc, v) => {
    assertRupiah(v);
    return acc + v;
  }, 0);
}

/** Pembagian rupiah tanpa sisa pecahan; sisa dialokasikan ke elemen terakhir. */
export function distributeRupiah(total: Rupiah, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Rasio aman untuk perhitungan HPP (tidak membagi dengan nol). */
export function safeRatio(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}
