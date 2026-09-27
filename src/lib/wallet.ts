/**
 * Aturan Wallet 6Mart (blueprint §12–§14, §19–§20, §39).
 *
 * Modul ini MUHUR (tidak menyentuh database) sehingga aturan kritis
 * dapat diuji secara unit:
 *
 *  1. Saldo tidak boleh diedit langsung.
 *  2. Semua perubahan saldo WAJIB menghasilkan ledger.
 *  3. Saldo tidak boleh negatif ( overdraft belum diaktifkan di V1).
 *  4. Transaksi wallet harus atomic (dijamin oleh Convex OCC + version).
 *  5. Satu transaksi tidak boleh terdebit dua kali (idempotency key).
 *  6. Transaksi sukses tidak boleh diproses ulang.
 */

import { assertRupiah, roundToSen } from "./money";

export type WalletLedgerType =
  | "TOPUP"
  | "PURCHASE"
  | "WITHDRAWAL"
  | "REFUND"
  | "ADJUSTMENT"
  | "LAUNDRY"
  | "BARBERSHOP"
  | "JASTIP"
  | "PPOB";

export type WalletDirection = "CREDIT" | "DEBIT";

/** Tipe ledger yang menambah saldo (uang masuk ke wallet). */
const CREDIT_TYPES: WalletLedgerType[] = ["TOPUP", "REFUND", "ADJUSTMENT"];

/** Tipe ledger yang mengurangi saldo. */
const DEBIT_TYPES: WalletLedgerType[] = [
  "PURCHASE",
  "WITHDRAWAL",
  "ADJUSTMENT",
  "LAUNDRY",
  "BARBERSHOP",
  "JASTIP",
  "PPOB",
];

/**
 * ADJUSTMENT dapat dua arah. Arah ditentukan oleh nilai signedAmount
 * (positif = menambah, negatif = mengurangi). Tipe lain arahnya tetap.
 */
export function directionFor(
  type: WalletLedgerType,
  signedAmount: number,
): WalletDirection {
  if (CREDIT_TYPES.includes(type) && DEBIT_TYPES.includes(type)) {
    // ADJUSTMENT: dua arah
    if (signedAmount === 0) throw new WalletRuleError("Adjustment tidak boleh nol");
    return signedAmount > 0 ? "CREDIT" : "DEBIT";
  }
  if (CREDIT_TYPES.includes(type)) return "CREDIT";
  if (DEBIT_TYPES.includes(type)) return "DEBIT";
  throw new WalletRuleError(`Tipe ledger tidak dikenal: ${type}`);
}

export class WalletRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletRuleError";
  }
}

export class InsufficientBalanceError extends Error {
  constructor(
    public balance: number,
    public required: number,
    public studentName?: string,
  ) {
    super(
      `Saldo tidak cukup${studentName ? ` untuk ${studentName}` : ""}. Saldo ${balance}, diperlukan ${required}, kurang ${required - balance}`,
    );
    this.name = "InsufficientBalanceError";
  }
}

export class WalletFrozenError extends Error {
  constructor() {
    super("Wallet telah dibekukan. Hubungi bagian keuangan.");
    this.name = "WalletFrozenError";
  }
}

export interface WalletState {
  balance: number;
  status: "ACTIVE" | "FROZEN" | "CLOSED";
}

export interface LedgerDraft {
  type: WalletLedgerType;
  /** Nominal signed: positif menambah, negatif mengurangi. */
  signedAmount: number;
  note?: string;
  referenceType?: string;
  referenceId?: string;
}

export interface LedgerResult {
  direction: WalletDirection;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
}

/**
 * Menghitung efek satu entri ledger terhadap state wallet.
 * TIDAK mengubah input — pure function, mudah diuji.
 *
 * @throws WalletFrozenError jika wallet tidak ACTIVE
 * @throws WalletRuleError jika nominal tidak valid
 * @throws InsufficientBalanceError jika saldo menjadi negatif
 */
export function applyLedger(state: WalletState, draft: LedgerDraft): LedgerResult {
  if (state.status === "CLOSED") {
    throw new WalletFrozenError();
  }
  if (state.status === "FROZEN") {
    throw new WalletFrozenError();
  }
  if (draft.type === "ADJUSTMENT") {
    // adjustment boleh negatif
    if (!Number.isInteger(draft.signedAmount)) {
      throw new WalletRuleError("Adjustment harus berupa bilangan bulat rupiah");
    }
  } else {
    assertRupiah(Math.abs(draft.signedAmount), "Nominal transaksi");
  }

  const direction = directionFor(draft.type, draft.signedAmount);
  const amount = Math.abs(draft.signedAmount);
  if (amount === 0) {
    throw new WalletRuleError("Nominal transaksi tidak boleh nol");
  }

  const balanceBefore = state.balance;
  const balanceAfter =
    direction === "CREDIT"
      ? roundToSen(balanceBefore + amount)
      : roundToSen(balanceBefore - amount);

  if (balanceAfter < 0) {
    throw new InsufficientBalanceError(balanceBefore, amount);
  }

  return { direction, amount, balanceBefore, balanceAfter };
}

/**
 * Validasi idempotency key. Key WAJIB ada untuk operasi kritikal
 * (debit wallet) agar request duplikat tidak menghasilkan double debit.
 */
export function assertIdempotencyKey(key: string | undefined, operation: string): string {
  if (!key || key.trim().length < 8) {
    throw new WalletRuleError(
      `Idempotency key wajib untuk operasi ${operation} (minimal 8 karakter)`,
    );
  }
  return key.trim();
}

export interface DailyLimitState {
  dayStart: number;
  dayEnd: number;
  debitedToday: number;
  toppedUpToday: number;
}

export class LimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LimitExceededError";
  }
}

/** Cek limit harian(top up & debit) & saldo maksimum. */
export function checkWalletLimits(
  state: WalletState,
  limits: {
    dailyDebitLimit: number;
    dailyTopupLimit: number;
    maxBalance?: number;
    minBalance: number;
  },
  usage: DailyLimitState,
  draft: { type: WalletLedgerType; signedAmount: number },
): void {
  const result = applyLedger(state, draft);

  if (result.direction === "DEBIT") {
    if (result.balanceAfter < limits.minBalance) {
      throw new LimitExceededError(
        `Saldo setelah transaksi (${result.balanceAfter}) di bawah saldo minimum (${limits.minBalance})`,
      );
    }
    if (limits.dailyDebitLimit > 0 && usage.debitedToday + result.amount > limits.dailyDebitLimit) {
      throw new LimitExceededError(
        `Limit debit harian terlampaui. Maksimal ${limits.dailyDebitLimit}, terpakai ${usage.debitedToday}`,
      );
    }
  }

  if (result.direction === "CREDIT") {
    if (limits.dailyTopupLimit > 0 && usage.toppedUpToday + result.amount > limits.dailyTopupLimit) {
      throw new LimitExceededError(
        `Limit top up harian terlampaui. Maksimal ${limits.dailyTopupLimit}, terpakai ${usage.toppedUpToday}`,
      );
    }
    if (limits.maxBalance && limits.maxBalance > 0 && result.balanceAfter > limits.maxBalance) {
      throw new LimitExceededError(
        `Saldo maksimum ${limits.maxBalance} terlampaui (hasil ${result.balanceAfter})`,
      );
    }
  }
}

/**
 * Optimistic concurrency check (blueprint §39).
 * Mutation menerima version yang dibaca; bila versi di database sudah
 * berbeda, mutation HARUS gagal (bukan diam-diam overwrite) supaya
 * debounce ganda tidak menyebabkan saldo negatif / double spending.
 */
export class ConcurrencyConflictError extends Error {
  constructor(public expected: number, public actual: number) {
    super(
      `Konkurensi wallet terdeteksi: diharapkan versi ${expected}, ditemukan ${actual}. Transaksi lain terjadi bersamaan. Silakan ulangi.`,
    );
    this.name = "ConcurrencyConflictError";
  }
}

export function assertVersion(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new ConcurrencyConflictError(expected, actual);
  }
}

/** Hitung ringkasan ledger untuk halaman mutasi wallet. */
export function summarizeLedger(
  entries: { direction: WalletDirection; amount: number }[],
): { totalCredit: number; totalDebit: number; net: number; count: number } {
  const totalCredit = entries
    .filter((e) => e.direction === "CREDIT")
    .reduce((s, e) => s + e.amount, 0);
  const totalDebit = entries
    .filter((e) => e.direction === "DEBIT")
    .reduce((s, e) => s + e.amount, 0);
  return {
    totalCredit: roundToSen(totalCredit),
    totalDebit: roundToSen(totalDebit),
    net: roundToSen(totalCredit - totalDebit),
    count: entries.length,
  };
}
