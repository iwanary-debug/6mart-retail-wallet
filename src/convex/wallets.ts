import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  assertPermission,
  BusinessRuleError,
  NotFoundError,
  notify,
  requireUser,
  writeAudit,
} from "./lib/guards";
import {
  beginIdempotent,
  completeIdempotent,
  failIdempotent,
  getSettings,
  requireString,
  startOfDay,
} from "./lib/helpers";
import { mutateWallet, walletMutationArgs } from "./lib/walletEngine";
import { PERMISSIONS } from "../lib/rbac";
import { assertRupiah, roundToSen } from "../lib/money";
import { summarizeLedger } from "../lib/wallet";

// ---------------------------------------------------------------- QUERIES ----

export const listWallets = query({
  args: {
    search: v.optional(v.string()),
    minBalance: v.optional(v.number()),
    maxBalance: v.optional(v.number()),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_VIEW);

    const wallets = await ctx.db.query("wallets").collect();
    const items = await Promise.all(
      wallets.map(async (wallet) => {
        const student = await ctx.db.get(wallet.studentId);
        return {
          id: wallet._id,
          studentId: wallet.studentId,
          studentName: student?.name ?? "-",
          nis: student?.nis ?? "-",
          className: student?.className ?? "-",
          code: wallet.code,
          balance: wallet.currentBalance,
          version: wallet.version,
          status: wallet.status,
          lastTransactionAt: wallet.lastTransactionAt,
        };
      }),
    );

    let rows = items;
    if (args.search) {
      const s = args.search.toLowerCase();
      rows = rows.filter(
        (r) => r.studentName.toLowerCase().includes(s) || r.nis.toLowerCase().includes(s),
      );
    }
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    if (args.minBalance !== undefined) rows = rows.filter((r) => r.balance >= args.minBalance!);
    if (args.maxBalance !== undefined) rows = rows.filter((r) => r.balance <= args.maxBalance!);
    rows.sort((a, b) => b.balance - a.balance);

    return {
      total: rows.length,
      totalBalance: roundToSen(items.reduce((s, r) => s + r.balance, 0)),
      items: rows.slice(0, Math.min(args.limit ?? 100, 500)),
    };
  },
});

export const getWallet = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_VIEW);
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .unique();
    if (!wallet) throw new NotFoundError("Wallet tidak ditemukan");
    const student = await ctx.db.get(args.studentId);
    const ledger = await ctx.db
      .query("walletLedger")
      .withIndex("by_wallet", (q) => q.eq("walletId", wallet._id))
      .order("desc")
      .take(100);
    return { wallet, student, ledger, summary: summarizeLedger(ledger) };
  },
});

export const listLedger = query({
  args: {
    studentId: v.optional(v.id("students")),
    walletId: v.optional(v.id("wallets")),
    type: v.optional(v.string()),
    direction: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_VIEW);

    let rows =
      args.walletId !== undefined
        ? await ctx.db
            .query("walletLedger")
            .withIndex("by_wallet", (q) => q.eq("walletId", args.walletId!))
            .collect()
        : args.studentId !== undefined
          ? await ctx.db
              .query("walletLedger")
              .withIndex("by_student", (q) => q.eq("studentId", args.studentId!))
              .collect()
          : await ctx.db.query("walletLedger").collect();

    if (args.type) rows = rows.filter((r) => r.type === args.type);
    if (args.direction) rows = rows.filter((r) => r.direction === args.direction);
    if (args.from !== undefined) rows = rows.filter((r) => r.createdAt >= args.from!);
    if (args.to !== undefined) rows = rows.filter((r) => r.createdAt <= args.to!);
    if (args.search) {
      const s = args.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.transactionId.toLowerCase().includes(s) ||
          (r.note ?? "").toLowerCase().includes(s),
      );
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);

    const total = rows.length;
    const limit = Math.min(args.limit ?? 100, 500);
    return { total, summary: summarizeLedger(rows), items: rows.slice(0, limit) };
  },
});export const dailyUsage = query({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_VIEW);
    const dayStart = startOfDay(Date.now());
    const dayEnd = dayStart + 86_400_000;
    const today = await ctx.db
      .query("walletLedger")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .filter((q) => q.gte(q.field("createdAt"), dayStart) && q.lt(q.field("createdAt"), dayEnd))
      .collect();
    const limits = await ctx.db
      .query("walletLimits")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .unique();
    return {
      debitedToday: roundToSen(
        today.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amount, 0),
      ),
      toppedUpToday: roundToSen(
        today
          .filter((e) => e.direction === "CREDIT" && e.type === "TOPUP")
          .reduce((s, e) => s + e.amount, 0),
      ),
      transactionCount: today.length,
      limits,
    };
  },
});

// -------------------------------------------------------------- MUTATIONS ----

/** Top up wallet. Idempotency key opsional (wajib bila dari webhook). */
export const topUp = mutation({
  args: walletMutationArgs,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_TOPUP);
    assertRupiah(args.amount, "Nominal top up");
    if (args.amount <= 0) throw new BusinessRuleError("Nominal top up harus lebih dari 0");

    const student = await ctx.db.get(args.studentId);
    if (!student) throw new NotFoundError("Santri tidak ditemukan");

    if (args.idempotencyKey) {
      const hit = await beginIdempotent(
        ctx,
        "wallet.topup",
        args.idempotencyKey,
        `${args.studentId}:${args.amount}`,
        user.id,
      );
      if (hit.status === "REPLAY") {
        return { ...(hit.result as any), replayed: true };
      }
      try {
        const result = await mutateWallet(ctx, user, { ...args, type: "TOPUP" });
        await completeIdempotent(ctx, "wallet.topup", args.idempotencyKey, result);
        await notify(ctx, {
          recipientType: "STUDENT",
          recipientId: student._id,
          title: "Top Up Berhasil",
          message: `Saldo Anda bertambah. Saldo baru ${result.balanceAfter}.`,
          severity: "SUCCESS",
        });
        await writeAudit(ctx, {
          user,
          action: "TOPUP",
          entityType: "wallet",
          entityId: result.walletId,
          newValue: {
            amount: result.amount,
            balanceAfter: result.balanceAfter,
            transactionId: result.transactionId,
          },
        });
        return { ...result, replayed: false };
      } catch (error) {
        await failIdempotent(ctx, "wallet.topup", args.idempotencyKey);
        throw error;
      }
    }

    const result = await mutateWallet(ctx, user, { ...args, type: "TOPUP" });
    await notify(ctx, {
      recipientType: "STUDENT",
      recipientId: student._id,
      title: "Top Up Berhasil",
      message: `Saldo Anda bertambah. Saldo baru ${result.balanceAfter}.`,
      severity: "SUCCESS",
    });
    await writeAudit(ctx, {
      user,
      action: "TOPUP",
      entityType: "wallet",
      entityId: result.walletId,
      newValue: {
        amount: result.amount,
        balanceAfter: result.balanceAfter,
        transactionId: result.transactionId,
      },
    });
    return { ...result, replayed: false };
  },
});

/** Penarikan uang NAFTA (blueprint §19). Wajib idempotency key. */
export const withdraw = mutation({
  args: walletMutationArgs,
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_WITHDRAW);
    assertRupiah(args.amount, "Nominal penarikan");
    if (args.amount <= 0) throw new BusinessRuleError("Nominal penarikan harus lebih dari 0");

    const settings = await getSettings(ctx);
    if (!settings.withdrawalEnabled) {
      throw new BusinessRuleError("Fitur penarikan sedang dinonaktifkan");
    }

    const shift = await openShiftOf(ctx, user.id);
    const idemKey = args.idempotencyKey ?? `manual-${args.studentId}-${args.amount}-${Date.now()}`;
    const hit = await beginIdempotent(
      ctx,
      "wallet.withdraw",
      idemKey,
      `${args.studentId}:${args.amount}`,
      user.id,
    );
    if (hit.status === "REPLAY") return { ...(hit.result as any), replayed: true };

    try {
      const result = await mutateWallet(ctx, user, {
        ...args,
        type: "WITHDRAWAL",
        note: args.note ?? "Penarikan oleh kasir",
        referenceType: "withdrawal",
      });

      if (shift) {
        await ctx.db.insert("cashTransactions", {
          shiftId: shift._id,
          type: "WITHDRAWAL",
          direction: "OUT",
          amount: result.amount,
          referenceType: "walletWithdrawal",
          referenceId: result.transactionId,
          note: args.note,
          createdBy: user.id,
          createdAt: Date.now(),
        });
      }

      const student = await ctx.db.get(args.studentId);
      await writeAudit(ctx, {
        user,
        action: "WITHDRAWAL",
        entityType: "wallet",
        entityId: result.walletId,
        newValue: {
          amount: result.amount,
          balanceAfter: result.balanceAfter,
          transactionId: result.transactionId,
          student: student?.name,
        },
      });
      await notify(ctx, {
        recipientType: "STUDENT",
        recipientId: args.studentId,
        title: "Penarikan Diproses",
        message: `Penarikan ${result.amount} telah diproses. Saldo tersisa ${result.balanceAfter}.`,
        severity: "INFO",
      });

      await completeIdempotent(ctx, "wallet.withdraw", idemKey, result);
      return { ...result, replayed: false };
    } catch (error) {
      await failIdempotent(ctx, "wallet.withdraw", idemKey);
      throw error;
    }
  },
});

/** Penyesuaian saldo oleh Finance/Admin — selalu menghasilkan ledger + jurnal. */
export const adjust = mutation({
  args: {
    ...walletMutationArgs,
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_ADJUST);
    const reason = requireString(args.reason, "Alasan penyesuaian", 300);
    if (args.amount === 0) throw new BusinessRuleError("Nominal penyesuaian tidak boleh nol");

    const result = await mutateWallet(ctx, user, {
      ...args,
      type: "ADJUSTMENT",
      note: `${reason}${args.note ? ` — ${args.note}` : ""}`,
      referenceType: "walletAdjustment",
      skipLimits: true,
    });

    await writeAudit(ctx, {
      user,
      action: "ADJUST_WALLET",
      entityType: "wallet",
      entityId: result.walletId,
      oldValue: { balance: result.balanceBefore },
      newValue: { balance: result.balanceAfter, amount: result.amount, reason },
    });

    return result;
  },
});

export const setStatus = mutation({
  args: {
    studentId: v.id("students"),
    status: v.union(v.literal("ACTIVE"), v.literal("FROZEN"), v.literal("CLOSED")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_ADJUST);
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .unique();
    if (!wallet) throw new NotFoundError("Wallet tidak ditemukan");
    await ctx.db.patch(wallet._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      user,
      action: "SET_WALLET_STATUS",
      entityType: "wallet",
      entityId: wallet._id,
      oldValue: { status: wallet.status },
      newValue: { status: args.status, reason: args.reason },
    });
    return { ok: true };
  },
});

async function openShiftOf(ctx: any, cashierId: Id<"users">) {
  return await ctx.db
    .query("cashierShifts")
    .withIndex("by_cashier", (q: any) => q.eq("cashierId", cashierId))
    .filter((q: any) => q.eq(q.field("status"), "OPEN"))
    .unique();
}
