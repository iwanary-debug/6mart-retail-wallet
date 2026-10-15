import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { v } from "convex/values";
import {
  applyLedger,
  assertIdempotencyKey,
  checkWalletLimits,
  ConcurrencyConflictError,
  InsufficientBalanceError,
  LimitExceededError,
  WalletFrozenError,
  WalletRuleError,
  type WalletLedgerType,
} from "../../lib/wallet";
import { assertRupiah, roundToSen } from "../../lib/money";
import * as accounting from "../../lib/accounting";
import type { SessionUser } from "./guards";
import { BusinessRuleError, NotFoundError } from "./guards";
import { getSettings, nextTransactionCode, startOfDay } from "./helpers";

export interface WalletMutationInput {
  studentId: Id<"students">;
  type: WalletLedgerType;
  /** Nominal signed untuk ADJUSTMENT; selain itu positif. */
  amount: number;
  note?: string;
  referenceType?: string;
  referenceId?: string;
  /** Diperlukan untuk operasi DEBIT kritis (anti double-debit). */
  idempotencyKey?: string;
  /** Version wallet yang dibaca klien — optimistic concurrency guard. */
  expectedVersion?: number;
  /** Lewati validasi limit (untuk koreksi oleh Finance/Admin). */
  skipLimits?: boolean;
  /** Metode(top up saja). */
  method?:
    | "MANUAL"
    | "CASH"
    | "BANK_TRANSFER"
    | "VIRTUAL_ACCOUNT"
    | "PAYMENT_GATEWAY";
  provider?: string;
  providerReference?: string;
}

export interface WalletMutationResult {
  walletId: Id<"wallets">;
  ledgerId: Id<"walletLedger">;
  balanceBefore: number;
  balanceAfter: number;
  amount: number;
  direction: "CREDIT" | "DEBIT";
  transactionId: string;
  journalEntryId?: Id<"journalEntries">;
  topupId?: Id<"walletTopups">;
}

/**
 * SATU-SATUNNYA cara mengubah saldo wallet di 6Mart.
 *
 * Invariants yang dijamin:
 *  - Setiap perubahan saldo SELALU menghasilkan baris walletLedger.
 *  - Saldo tidak pernah negatif.
 *  - Optimistic concurrency lewat `version` mencegah double spend.
 *  - Idempotency key wajib pada operasi DEBIT.
 *  - Idempotency key opsional pada TOPUP (khusus webhook provider).
 */
export async function mutateWallet(
  ctx: MutationCtx,
  user: SessionUser,
  input: WalletMutationInput,
): Promise<WalletMutationResult> {
  if (input.amount === 0) {
    throw new BusinessRuleError("Nominal transaksi tidak boleh nol");
  }
  if (input.type !== "ADJUSTMENT") {
    assertRupiah(Math.abs(input.amount), "Nominal");
  } else if (!Number.isInteger(input.amount)) {
    throw new BusinessRuleError("Adjustment harus berupa bilangan bulat rupiah");
  }

  const isDebitRisk = input.type !== "TOPUP";
  if (isDebitRisk) {
    assertIdempotencyKey(input.idempotencyKey, input.type);
  }

  const wallet = await ctx.db
    .query("wallets")
    .withIndex("by_student", (q) => q.eq("studentId", input.studentId))
    .unique();

  if (!wallet) {
    throw new NotFoundError("Wallet santri tidak ditemukan");
  }

  if (input.expectedVersion !== undefined && input.expectedVersion !== wallet.version) {
    throw new ConcurrencyConflictError(input.expectedVersion, wallet.version);
  }

  if (wallet.status !== "ACTIVE" && input.type !== "TOPUP") {
    throw new WalletFrozenError();
  }

  // Validasi limit (blueprint §13 wallet_limits)
  if (!input.skipLimits) {
    const limitsRow = await ctx.db
      .query("walletLimits")
      .withIndex("by_student", (q) => q.eq("studentId", input.studentId))
      .unique();
    const settings = await getSettings(ctx);

    if (input.type === "WITHDRAWAL" && !settings.withdrawalEnabled) {
      throw new BusinessRuleError("Fitur penarikan uang sedang dinonaktifkan");
    }
    if (limitsRow && !limitsRow.withdrawalEnabled && input.type === "WITHDRAWAL") {
      throw new BusinessRuleError("Penarikan untuk santri ini dinonaktifkan");
    }

    if (limitsRow) {
      const dayStart = startOfDay(Date.now());
      const dayEnd = dayStart + 86_400_000;
      const todayEntries = await ctx.db
        .query("walletLedger")
        .withIndex("by_student", (q) => q.eq("studentId", input.studentId))
        .filter(
          (q) =>
            q.gte(q.field("createdAt"), dayStart) && q.lt(q.field("createdAt"), dayEnd),
        )
        .collect();
      const debitedToday = roundToSen(
        todayEntries
          .filter((e) => e.direction === "DEBIT")
          .reduce((s, e) => s + e.amount, 0),
      );
      const toppedUpToday = roundToSen(
        todayEntries
          .filter((e) => e.direction === "CREDIT" && e.type === "TOPUP")
          .reduce((s, e) => s + e.amount, 0),
      );
      checkWalletLimits(
        { balance: wallet.currentBalance, status: wallet.status },
        {
          dailyDebitLimit: limitsRow.dailyDebitLimit,
          dailyTopupLimit: limitsRow.dailyTopupLimit,
          maxBalance: limitsRow.maxBalance ?? settings.maxWalletBalance,
          minBalance: limitsRow.minBalance,
        },
        { dayStart, dayEnd, debitedToday, toppedUpToday },
        { type: input.type, signedAmount: input.amount },
      );
    }
  }

  // Pure domain rule → hasil deterministik
  const effect = applyLedger(
    { balance: wallet.currentBalance, status: wallet.status },
    {
      type: input.type,
      signedAmount: input.amount,
      note: input.note,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
    },
  );

  const now = Date.now();
  const transactionId = await nextTransactionCode(
    ctx,
    input.type === "TOPUP" ? "walletTopups" : "walletWithdrawals",
    input.type === "TOPUP" ? "TOP" : input.type === "WITHDRAWAL" ? "WDR" : "WLT",
    now,
  );

  // 1. Tulis ledger DULU (ledger adalah sumber kebenaran)
  const ledgerId = await ctx.db.insert("walletLedger", {
    walletId: wallet._id,
    studentId: input.studentId,
    transactionId,
    type: input.type,
    direction: effect.direction,
    amount: effect.amount,
    balanceBefore: effect.balanceBefore,
    balanceAfter: effect.balanceAfter,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    note: input.note,
    idempotencyKey: input.idempotencyKey,
    createdBy: user.id,
    createdAt: now,
  });

  // 2. Update saldo + naikkan version (OCC)
  await ctx.db.patch(wallet._id, {
    currentBalance: effect.balanceAfter,
    version: wallet.version + 1,
    lastTransactionAt: now,
    updatedAt: now,
  });

  const result: WalletMutationResult = {
    walletId: wallet._id,
    ledgerId,
    balanceBefore: effect.balanceBefore,
    balanceAfter: effect.balanceAfter,
    amount: effect.amount,
    direction: effect.direction,
    transactionId,
  };

  // 3. Jurnal akuntansi — top up BUKAN revenue (blueprint §16)
  if (input.type === "TOPUP") {
    const method = input.method ?? "MANUAL";
    const bankSide: "CASH" | "BANK" = method === "CASH" ? "CASH" : "BANK";
    const journalEntryId = await postJournal(ctx, {
      entryDate: now,
      description: `Top up wallet ${transactionId}`,
      source: "TOPUP",
      referenceType: "walletTopup",
      referenceId: transactionId,
      lines: accounting.topUpJournal(effect.amount, bankSide),
      user,
    });
    result.journalEntryId = journalEntryId;

    const topupId = await ctx.db.insert("walletTopups", {
      code: transactionId,
      studentId: input.studentId,
      walletId: wallet._id,
      amount: effect.amount,
      method,
      status: "SUCCESS",
      provider: input.provider,
      providerReference: input.providerReference,
      virtualAccountNumber: input.providerReference,
      paidAt: now,
      performedBy: user.id,
      performedByName: user.name,
      journalEntryId,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
    result.topupId = topupId;
  } else if (input.type === "WITHDRAWAL") {
    const journalEntryId = await postJournal(ctx, {
      entryDate: now,
      description: `Penarikan wallet ${transactionId}`,
      source: "WITHDRAWAL",
      referenceType: "withdrawal",
      referenceId: transactionId,
      lines: accounting.withdrawalJournal(effect.amount),
      user,
    });
    result.journalEntryId = journalEntryId;
    await ctx.db.insert("walletWithdrawals", {
      code: transactionId,
      studentId: input.studentId,
      walletId: wallet._id,
      amount: effect.amount,
      status: "COMPLETED",
      reason: input.note,
      requestedBy: user.id,
      approvedBy: user.id,
      approvedByName: user.name,
      completedAt: now,
      journalEntryId,
      idempotencyKey: input.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    });
  } else if (input.type === "ADJUSTMENT") {
    // Adjustment penyeimbang: kas di sisi berlawanan agar liability tetap realistis.
    if (effect.direction === "DEBIT") {
      const journalEntryId = await postJournal(ctx, {
        entryDate: now,
        description: `Penyesuaian wallet ${transactionId}`,
        source: "MANUAL",
        referenceType: "walletAdjustment",
        referenceId: transactionId,
        lines: accounting.withdrawalJournal(effect.amount),
        user,
      });
      result.journalEntryId = journalEntryId;
    } else {
      const journalEntryId = await postJournal(ctx, {
        entryDate: now,
        description: `Penyesuaian wallet ${transactionId}`,
        source: "MANUAL",
        referenceType: "walletAdjustment",
        referenceId: transactionId,
        lines: accounting.topUpJournal(effect.amount, "BANK"),
        user,
      });
      result.journalEntryId = journalEntryId;
    }
  }

  return result;
}

// ------------------------------------------------------------- ACCOUNTING ----

export interface PostJournalInput {
  entryDate: number;
  description: string;
  source:
    | "SALE"
    | "TOPUP"
    | "WITHDRAWAL"
    | "REFUND"
    | "PURCHASE"
    | "EXPENSE"
    | "SERVICE"
    | "PPOB"
    | "MANUAL"
    | "OPENING";
  referenceType?: string;
  referenceId?: string;
  lines: { accountCode: string; debit: number; credit: number; memo?: string }[];
  user: SessionUser;
}

/** Posting jurnal: validasi balance, tulis header + lines, satu transaction. */
export async function postJournal(
  ctx: MutationCtx,
  input: PostJournalInput,
): Promise<Id<"journalEntries">> {
  if (input.lines.length < 2) {
    throw new BusinessRuleError("Jurnal minimal 2 baris");
  }
  const totalDebit = roundToSen(input.lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = roundToSen(input.lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    throw new BusinessRuleError(
      `Jurnal tidak balance: Debit ${totalDebit} vs Credit ${totalCredit}`,
    );
  }
  if (totalDebit === 0) {
    throw new BusinessRuleError("Total jurnal tidak boleh nol");
  }

  const now = Date.now();
  const code = await nextJournalCode(ctx, input.entryDate);
  const journalEntryId = await ctx.db.insert("journalEntries", {
    code,
    entryDate: input.entryDate,
    description: input.description,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    source: input.source,
    totalDebit,
    totalCredit,
    status: "POSTED",
    createdBy: input.user.id,
    createdAt: now,
  });

  for (const line of input.lines) {
    await ctx.db.insert("journalLines", {
      journalEntryId,
      accountCode: line.accountCode,
      accountName: accounting.accountName(line.accountCode),
      debit: roundToSen(line.debit),
      credit: roundToSen(line.credit),
      memo: line.memo,
      createdAt: now,
    });
  }

  return journalEntryId;
}

async function nextJournalCode(ctx: MutationCtx, entryDate: number): Promise<string> {
  const dayStart = startOfDay(entryDate);
  const dayEnd = dayStart + 86_400_000;
  const rows = await ctx.db
    .query("journalEntries")
    .withIndex("by_date", (q) => q.gte("entryDate", dayStart).lt("entryDate", dayEnd))
    .collect();
  const datePart = new Date(entryDate).toISOString().slice(0, 10).replace(/-/g, "");
  let max = 0;
  for (const row of rows) {
    const match = new RegExp(`^JRN-${datePart}-(\\d{6})$`).exec(row.code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `JRN-${datePart}-${String(max + 1).padStart(6, "0")}`;
}

// ---------------------------------------------------------------- UTILITAS ----

export const walletMutationArgs = {
  studentId: v.id("students"),
  // Opsional: setiap titik masuk (topUp/withdraw/adjust) sudah memaksa
  // `type`-nya sendiri sebelum memanggil mutateWallet, jadi mewajibkan kolom
  // ini hanya membuat klien wajib mengirim nilai yang kemudian dibuang.
  type: v.optional(
    v.union(
      v.literal("TOPUP"),
      v.literal("PURCHASE"),
      v.literal("WITHDRAWAL"),
      v.literal("REFUND"),
      v.literal("ADJUSTMENT"),
      v.literal("LAUNDRY"),
      v.literal("BARBERSHOP"),
      v.literal("JASTIP"),
      v.literal("PPOB"),
    ),
  ),
  amount: v.number(),
  note: v.optional(v.string()),
  referenceType: v.optional(v.string()),
  referenceId: v.optional(v.string()),
  idempotencyKey: v.optional(v.string()),
  expectedVersion: v.optional(v.number()),
  skipLimits: v.optional(v.boolean()),
  method: v.optional(
    v.union(
      v.literal("MANUAL"),
      v.literal("CASH"),
      v.literal("BANK_TRANSFER"),
      v.literal("VIRTUAL_ACCOUNT"),
      v.literal("PAYMENT_GATEWAY"),
    ),
  ),
  provider: v.optional(v.string()),
  providerReference: v.optional(v.string()),
};

export { InsufficientBalanceError, LimitExceededError, WalletFrozenError, WalletRuleError, ConcurrencyConflictError };
