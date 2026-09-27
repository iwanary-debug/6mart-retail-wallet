import type { MutationCtx, QueryCtx } from "../_generated/server";
import { buildCode, type CodePrefix } from "../../lib/codes";
import { BusinessRuleError, ValidationError } from "./guards";

// ---------------------------------------------------------------- SETTINGS ----

export interface AppSettings {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  currency: string;
  receiptHeader: string;
  receiptFooter: string;
  lowStockThreshold: number;
  walletMinimumBalance: number;
  dailyDebitLimit: number;
  dailyTopupLimit: number;
  maxWalletBalance: number;
  withdrawalEnabled: boolean;
  rfidEnabled: boolean;
  qrEnabled: boolean;
  cashPaymentEnabled: boolean;
  jastipServiceFee: number;
  jastipDeliveryFee: number;
  ppobProvider: string;
  environment: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  storeName: "6Mart PIAT 6 Bondowoso",
  storeAddress: "Kampus PIAT 6 Bondowoso, Jawa Timur",
  storePhone: "0812-0000-0000",
  currency: "IDR",
  receiptHeader: "6MART PIAT 6 BONDOWOSO",
  receiptFooter: "Terima kasih telah berbelanja. Barang yang sudah dibeli tidak dapat ditukar.",
  lowStockThreshold: 10,
  walletMinimumBalance: 0,
  dailyDebitLimit: 2_000_000,
  dailyTopupLimit: 5_000_000,
  maxWalletBalance: 5_000_000,
  withdrawalEnabled: true,
  rfidEnabled: true,
  qrEnabled: true,
  cashPaymentEnabled: true,
  jastipServiceFee: 3000,
  jastipDeliveryFee: 5000,
  ppobProvider: "SANDBOX",
  environment: "DEVELOPMENT",
};

const SETTING_META: Record<keyof AppSettings, { group: string; label: string; type: "STRING" | "NUMBER" | "BOOLEAN" }> = {
  storeName: { group: "Toko", label: "Nama Toko", type: "STRING" },
  storeAddress: { group: "Toko", label: "Alamat Toko", type: "STRING" },
  storePhone: { group: "Toko", label: "Telepon Toko", type: "STRING" },
  currency: { group: "Toko", label: "Mata Uang", type: "STRING" },
  receiptHeader: { group: "Struk", label: "Header Struk", type: "STRING" },
  receiptFooter: { group: "Struk", label: "Footer Struk", type: "STRING" },
  lowStockThreshold: { group: "Inventory", label: "Ambang Stok Menipis", type: "NUMBER" },
  walletMinimumBalance: { group: "Wallet", label: "Saldo Minimum Wallet", type: "NUMBER" },
  dailyDebitLimit: { group: "Wallet", label: "Limit Debit Harian", type: "NUMBER" },
  dailyTopupLimit: { group: "Wallet", label: "Limit Top Up Harian", type: "NUMBER" },
  maxWalletBalance: { group: "Wallet", label: "Saldo Maksimum Wallet", type: "NUMBER" },
  withdrawalEnabled: { group: "Wallet", label: "Penarikan Diaktifkan", type: "BOOLEAN" },
  rfidEnabled: { group: "Identifikasi", label: "RFID Aktif", type: "BOOLEAN" },
  qrEnabled: { group: "Identifikasi", label: "QR Aktif", type: "BOOLEAN" },
  cashPaymentEnabled: { group: "Identifikasi", label: "Pembayaran Tunai Aktif", type: "BOOLEAN" },
  jastipServiceFee: { group: "Jastip", label: "Biaya Layanan Jastip", type: "NUMBER" },
  jastipDeliveryFee: { group: "Jastip", label: "Biaya Pengiriman Jastip", type: "NUMBER" },
  ppobProvider: { group: "PPOB", label: "Provider PPOB", type: "STRING" },
  environment: { group: "Sistem", label: "Environment", type: "STRING" },
};

export async function getSettings(ctx: QueryCtx | MutationCtx): Promise<AppSettings> {
  const rows = await ctx.db.query("settings").collect();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const raw = map.get(key);
    if (raw === undefined) continue;
    const meta = SETTING_META[key];
    if (meta.type === "NUMBER") {
      const n = Number(raw);
      if (Number.isFinite(n)) (result[key] as number) = n;
    } else if (meta.type === "BOOLEAN") {
      (result[key] as boolean) = raw === "true";
    } else {
      (result[key] as string) = String(raw);
    }
  }
  return result;
}

export async function upsertSetting(
  ctx: MutationCtx,
  key: keyof AppSettings,
  value: string | number | boolean,
): Promise<void> {
  const meta = SETTING_META[key];
  const existing = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  const now = Date.now();
  const storedValue = String(value);
  if (existing) {
    await ctx.db.patch(existing._id, { value: storedValue, updatedAt: now });
  } else {
    await ctx.db.insert("settings", {
      key,
      value: storedValue,
      group: meta.group,
      label: meta.label,
      valueType: meta.type,
      createdAt: now,
      updatedAt: now,
    });
  }
}

export function settingsMeta() {
  return SETTING_META;
}

// ------------------------------------------------------------------- KODE ----

/**
 * Generate kode transaksi unik per hari, mis. SAL-20260927-000001.
 * Memakai index based pada kode prefix + tanggal sehingga aman dari duplikasi
 * (kombinasi tanggal + prefix unik).
 */
export async function nextTransactionCode(
  ctx: QueryCtx | MutationCtx,
  table: "sales" | "walletTopups" | "walletWithdrawals" | "purchases" | "refunds" | "expenses",
  prefix: CodePrefix,
  timestamp = Date.now(),
): Promise<string> {
  const dayStart = startOfDay(timestamp);
  const dayEnd = dayStart + 86_400_000;

  const rows = await ctx.db
    .query(table)
    .filter(
      (q) =>
        q.gte(q.field("createdAt"), dayStart) && q.lt(q.field("createdAt"), dayEnd),
    )
    .collect();

  const datePart = new Date(timestamp).toISOString().slice(0, 10).replace(/-/g, "");
  let max = 0;
  for (const row of rows) {
    const code = (row as { code?: string }).code;
    if (!code) continue;
    const match = new RegExp(`^${prefix}-${datePart}-(\\d{6})$`).exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return buildCode(prefix, timestamp, max + 1);
}

export function startOfDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export function startOfMonth(timestamp: number): number {
  const d = new Date(timestamp);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(1);
  return d.getTime();
}

export function endOfDay(timestamp: number): number {
  return startOfDay(timestamp) + 86_400_000;
}

// ------------------------------------------------------------ IDEMPOTENCY ----

export interface IdempotencyHit<T> {
  status: "NEW" | "REPLAY";
  result?: T;
}

const IN_FLIGHT_GRACE_MS = 60_000;

/**
 * Idempotency guard (blueprint §14 rule 5–6, §38).
 *
 * - Key pertama → INSERT dengan status IN_PROGRESS, lanjut eksekusi.
 * - Key yang sama dalam 60 detik dan masih IN_PROGRESS → tolak (mencegah
 *   double submit bersamaan).
 * - Key yang sama sudah COMPLETED → kembalikan response tersimpan (replay).
 */
export async function beginIdempotent(
  ctx: MutationCtx,
  scope: string,
  key: string,
  requestHash: string,
  userId?: string,
): Promise<IdempotencyHit<unknown>> {
  const now = Date.now();
  const existing = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_key_scope", (q) => q.eq("key", key).eq("scope", scope))
    .unique();

  if (existing) {
    if (existing.status === "COMPLETED") {
      return { status: "REPLAY", result: existing.response ? JSON.parse(existing.response) : undefined };
    }
    if (existing.status === "IN_PROGRESS" && now - existing.createdAt < IN_FLIGHT_GRACE_MS) {
      throw new BusinessRuleError(
        "Permintaan identik sedang diproses. Mohon tunggu sebentar sebelum mencoba lagi.",
      );
    }
    if (existing.status === "FAILED" || (existing.status === "IN_PROGRESS" && now - existing.createdAt >= IN_FLIGHT_GRACE_MS)) {
      // Retry diizinkan: reset ke IN_PROGRESS.
      await ctx.db.patch(existing._id, {
        status: "IN_PROGRESS",
        requestHash,
        createdAt: now,
        updatedAt: now,
      });
      return { status: "NEW" };
    }
  }

  await ctx.db.insert("idempotencyKeys", {
    key,
    scope,
    requestHash,
    status: "IN_PROGRESS",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });
  return { status: "NEW" };
}

export async function completeIdempotent(
  ctx: MutationCtx,
  scope: string,
  key: string,
  response: unknown,
): Promise<void> {
  const row = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_key_scope", (q) => q.eq("key", key).eq("scope", scope))
    .unique();
  if (!row) return;
  await ctx.db.patch(row._id, {
    status: "COMPLETED",
    response: JSON.stringify(response),
    updatedAt: Date.now(),
  });
}

export async function failIdempotent(ctx: MutationCtx, scope: string, key: string): Promise<void> {
  const row = await ctx.db
    .query("idempotencyKeys")
    .withIndex("by_key_scope", (q) => q.eq("key", key).eq("scope", scope))
    .unique();
  if (!row) return;
  await ctx.db.patch(row._id, { status: "FAILED", updatedAt: Date.now() });
}

// ------------------------------------------------------------- UTILITAS ----

export function requirePositive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(`${field} harus lebih besar dari 0`);
  }
  return value;
}

export function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new ValidationError(`${field} harus bilangan bulat non-negatif`);
  }
  return value;
}

export function requireString(value: string | undefined, field: string, max = 200): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) throw new ValidationError(`${field} wajib diisi`);
  if (trimmed.length > max) throw new ValidationError(`${field} maksimal ${max} karakter`);
  return trimmed;
}

export function nowMs(): number {
  return Date.now();
}

/** Timer sederhana untuk instrumentation. */
export function startTimer(): () => number {
  const t0 = Date.now();
  return () => Date.now() - t0;
}
