import { describe, expect, test } from "bun:test";
import { MoneyError } from "../src/lib/money";
import {
  applyLedger,
  assertIdempotencyKey,
  assertVersion,
  checkWalletLimits,
  directionFor,
  summarizeLedger,
  ConcurrencyConflictError,
  InsufficientBalanceError,
  LimitExceededError,
  WalletFrozenError,
  WalletRuleError,
  type WalletState,
} from "../src/lib/wallet";

const active = (balance: number): WalletState => ({ balance, status: "ACTIVE" });

describe("directionFor (blueprint §12)", () => {
  test("TOPUP dan REFUND menambah saldo", () => {
    expect(directionFor("TOPUP", 50_000)).toBe("CREDIT");
    expect(directionFor("REFUND", 10_000)).toBe("CREDIT");
  });

  test("PURCHASE, WITHDRAWAL, dan layanan mengurangi saldo", () => {
    expect(directionFor("PURCHASE", 5_000)).toBe("DEBIT");
    expect(directionFor("WITHDRAWAL", 5_000)).toBe("DEBIT");
    expect(directionFor("LAUNDRY", 5_000)).toBe("DEBIT");
    expect(directionFor("PPOB", 5_000)).toBe("DEBIT");
  });

  test("ADJUSTMENT mengikuti tanda nominal", () => {
    expect(directionFor("ADJUSTMENT", 5_000)).toBe("CREDIT");
    expect(directionFor("ADJUSTMENT", -5_000)).toBe("DEBIT");
  });

  test("ADJUSTMENT nol ditolak", () => {
    expect(() => directionFor("ADJUSTMENT", 0)).toThrow(WalletRuleError);
  });
});

describe("applyLedger (blueprint §13, §14)", () => {
  test("top up menambah saldo dan mencatat before/after", () => {
    const r = applyLedger(active(100_000), { type: "TOPUP", signedAmount: 50_000 });
    expect(r).toEqual({
      direction: "CREDIT",
      amount: 50_000,
      balanceBefore: 100_000,
      balanceAfter: 150_000,
    });
  });

  test("pembelian mengurangi saldo", () => {
    const r = applyLedger(active(100_000), { type: "PURCHASE", signedAmount: 35_000 });
    expect(r.direction).toBe("DEBIT");
    expect(r.balanceAfter).toBe(65_000);
  });

  test("saldo TIDAK BOLEH menjadi negatif (overdraft belum diaktifkan)", () => {
    expect(() =>
      applyLedger(active(10_000), { type: "PURCHASE", signedAmount: 10_001 }),
    ).toThrow(InsufficientBalanceError);
  });

  test("pesan error insufficient balance menyebut selisihnya", () => {
    try {
      applyLedger(active(1_000), { type: "PURCHASE", signedAmount: 3_500 });
      throw new Error(" seharusnya throw");
    } catch (e) {
      expect(e).toBeInstanceOf(InsufficientBalanceError);
      const err = e as InsufficientBalanceError;
      expect(err.balance).toBe(1_000);
      expect(err.required).toBe(3_500);
      expect(err.message).toContain("kurang 2500");
    }
  });

  test("salde tepat sama dengan nominal boleh (tidak boleh < 0)", () => {
    const r = applyLedger(active(10_000), { type: "PURCHASE", signedAmount: 10_000 });
    expect(r.balanceAfter).toBe(0);
  });

  test("wallet FROZEN dan CLOSED menolak transaksi apa pun", () => {
    expect(() =>
      applyLedger({ balance: 100_000, status: "FROZEN" }, { type: "TOPUP", signedAmount: 1_000 }),
    ).toThrow(WalletFrozenError);
    expect(() =>
      applyLedger({ balance: 100_000, status: "CLOSED" }, { type: "TOPUP", signedAmount: 1_000 }),
    ).toThrow(WalletFrozenError);
  });

  test("nominal pecahan ditolak untuk semua tipe selain ADJUSTMENT", () => {
    expect(() =>
      applyLedger(active(100_000), { type: "PURCHASE", signedAmount: 1000.5 }),
    ).toThrow(MoneyError);
    expect(() =>
      applyLedger(active(100_000), { type: "ADJUSTMENT", signedAmount: 1000.5 }),
    ).toThrow(WalletRuleError);
  });

  test("nominal nol ditolak", () => {
    expect(() => applyLedger(active(100_000), { type: "PURCHASE", signedAmount: 0 })).toThrow(
      WalletRuleError,
    );
  });

  test("state input tidak dimutasikan (pure function)", () => {
    const state = active(100_000);
    applyLedger(state, { type: "TOPUP", signedAmount: 50_000 });
    expect(state.balance).toBe(100_000);
  });
});

describe("assertIdempotencyKey (blueprint §39, §43)", () => {
  test("key valid diteruskan apa adanya", () => {
    expect(assertIdempotencyKey("  topup-abc-123  ", "wallet.topup")).toBe("topup-abc-123");
  });

  test("key kosong atau terlalu pendek ditolak", () => {
    expect(() => assertIdempotencyKey(undefined, "wallet.debit")).toThrow(WalletRuleError);
    expect(() => assertIdempotencyKey("", "wallet.debit")).toThrow(WalletRuleError);
    expect(() => assertIdempotencyKey("abc", "wallet.debit")).toThrow(/minimal 8 karakter/);
  });
});

describe("checkWalletLimits (blueprint §14)", () => {
  const limits = {
    dailyDebitLimit: 2_000_000,
    dailyTopupLimit: 5_000_000,
    maxBalance: 5_000_000,
    minBalance: 0,
  };
  const usage = { dayStart: 0, dayEnd: 0, debitedToday: 0, toppedUpToday: 0 };

  test("transaksi normal lolos", () => {
    expect(() =>
      checkWalletLimits(active(100_000), limits, usage, { type: "PURCHASE", signedAmount: 10_000 }),
    ).not.toThrow();
  });

  test("limit debit harian dihormati", () => {
    expect(() =>
      checkWalletLimits(
        active(3_000_000),
        limits,
        { ...usage, debitedToday: 1_900_000 },
        { type: "PURCHASE", signedAmount: 200_000 },
      ),
    ).toThrow(LimitExceededError);
  });

  test("limit top up harian dihormati", () => {
    expect(() =>
      checkWalletLimits(
        active(1_000_000),
        limits,
        { ...usage, toppedUpToday: 4_900_000 },
        { type: "TOPUP", signedAmount: 200_000 },
      ),
    ).toThrow(/Limit top up harian/);
  });

  test("saldo maksimumwallet dihormati", () => {
    expect(() =>
      checkWalletLimits(active(4_900_000), limits, usage, { type: "TOPUP", signedAmount: 200_000 }),
    ).toThrow(/Saldo maksimum/);
  });

  test("saldo minimum dicek sebelum limit harian", () => {
    expect(() =>
      checkWalletLimits(
        active(100_000),
        { ...limits, minBalance: 50_000 },
        usage,
        { type: "PURCHASE", signedAmount: 60_000 },
      ),
    ).toThrow(/saldo minimum/);
  });
});

describe("assertVersion (blueprint §39 — optimistik locking)", () => {
  test("versi cocok -> lolos", () => {
    expect(() => assertVersion(7, 7)).not.toThrow();
  });

  test("versi berbeda -> konflik, transaksi lain terjadi bersamaan", () => {
    expect(() => assertVersion(7, 8)).toThrow(ConcurrencyConflictError);
  });

  test("pesan konflik menyertakan kedua versi", () => {
    try {
      assertVersion(3, 4);
      throw new Error("harusnya throw");
    } catch (e) {
      const err = e as ConcurrencyConflictError;
      expect(err.expected).toBe(3);
      expect(err.actual).toBe(4);
    }
  });
});

describe("summarizeLedger", () => {
  test("menghitung total credit, debit, dan net", () => {
    const s = summarizeLedger([
      { direction: "CREDIT", amount: 100_000 },
      { direction: "DEBIT", amount: 25_000 },
      { direction: "DEBIT", amount: 15_000 },
      { direction: "CREDIT", amount: 10_000 },
    ]);
    expect(s).toEqual({ totalCredit: 110_000, totalDebit: 40_000, net: 70_000, count: 4 });
  });

  test("ledger kosong menghasilkan nol", () => {
    expect(summarizeLedger([])).toEqual({
      totalCredit: 0,
      totalDebit: 0,
      net: 0,
      count: 0,
    });
  });
});

describe("replay ledger menghasilkan saldo akhir yang sama", () => {
  test("urutan top up lalu belanja menghasilkan saldo akhir yang benar", () => {
    let state = active(0);
    state = { ...state, balance: applyLedger(state, { type: "TOPUP", signedAmount: 200_000 }).balanceAfter };
    state = { ...state, balance: applyLedger(state, { type: "PURCHASE", signedAmount: 75_000 }).balanceAfter };
    state = { ...state, balance: applyLedger(state, { type: "LAUNDRY", signedAmount: 25_000 }).balanceAfter };
    expect(state.balance).toBe(100_000);
  });
});
