import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertPermission,
  BusinessRuleError,
  NotFoundError,
  requireUser,
  writeAudit,
} from "./lib/guards";
import { nextTransactionCode, requireString, startOfDay, startOfMonth } from "./lib/helpers";
import { postJournal } from "./lib/walletEngine";
import { PERMISSIONS } from "../lib/rbac";
import * as accounting from "../lib/accounting";
import { assertRupiah, roundToSen } from "../lib/money";

export const chartOfAccounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_VIEW);
    const rows = await ctx.db.query("chartOfAccounts").collect();
    if (rows.length > 0) {
      return rows
        .map((r) => ({
          code: r.code,
          name: r.name,
          type: r.type,
          normalBalance: r.normalBalance,
          isActive: r.isActive,
          description: r.description,
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
    }
    return accounting.CHART_OF_ACCOUNTS.map((a) => ({ ...a, isActive: true, description: undefined }));
  },
});

export const profitAndLoss = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_VIEW);
    const from = args.from ?? startOfMonth(Date.now());
    const to = args.to ?? Date.now();

    const lines = await ctx.db
      .query("journalLines")
      .filter((q) => q.gte(q.field("createdAt"), from) && q.lt(q.field("createdAt"), to))
      .collect();

    const entries = await ctx.db
      .query("journalEntries")
      .filter((q) => q.gte(q.field("entryDate"), from) && q.lt(q.field("entryDate"), to))
      .collect();
    const validEntryIds = new Set(
      entries.filter((e) => e.status === "POSTED").map((e) => e._id),
    );
    const posted = lines.filter((l) => validEntryIds.has(l.journalEntryId));

    const revenueByCode: Record<string, number> = {};
    const cogsByCode: Record<string, number> = {};
    const expenseByCode: Record<string, number> = {};
    const assetByCode: Record<string, number> = {};
    const liabilityByCode: Record<string, number> = {};

    for (const line of posted) {
      const def = accounting.accountByCode(line.accountCode);
      if (!def) continue;
      if (def.type === "REVENUE") {
        revenueByCode[line.accountCode] = roundToSen(
          (revenueByCode[line.accountCode] ?? 0) + line.credit - line.debit,
        );
      } else if (def.type === "COGS") {
        cogsByCode[line.accountCode] = roundToSen(
          (cogsByCode[line.accountCode] ?? 0) + line.debit - line.credit,
        );
      } else if (def.type === "EXPENSE") {
        expenseByCode[line.accountCode] = roundToSen(
          (expenseByCode[line.accountCode] ?? 0) + line.debit - line.credit,
        );
      } else if (def.type === "ASSET") {
        assetByCode[line.accountCode] = roundToSen(
          (assetByCode[line.accountCode] ?? 0) + line.debit - line.credit,
        );
      } else if (def.type === "LIABILITY") {
        liabilityByCode[line.accountCode] = roundToSen(
          (liabilityByCode[line.accountCode] ?? 0) + line.credit - line.debit,
        );
      }
    }

    const pl = accounting.computeProfitAndLoss({
      revenueByCode,
      cogsByCode,
      expenseByCode,
    });

    return {
      ...pl,
      period: { from, to },
      revenueBreakdown: [
        { code: accounting.COA.RETAIL_SALES, name: accounting.accountName(accounting.COA.RETAIL_SALES), amount: pl.revenueRetail },
        { code: accounting.COA.LAUNDRY_REVENUE, name: accounting.accountName(accounting.COA.LAUNDRY_REVENUE), amount: pl.revenueLaundry },
        { code: accounting.COA.BARBERSHOP_REVENUE, name: accounting.accountName(accounting.COA.BARBERSHOP_REVENUE), amount: pl.revenueBarbershop },
        { code: accounting.COA.JASTIP_REVENUE, name: accounting.accountName(accounting.COA.JASTIP_REVENUE), amount: pl.revenueJastip },
        { code: accounting.COA.PPOB_REVENUE, name: accounting.accountName(accounting.COA.PPOB_REVENUE), amount: pl.revenuePpob },
      ],
      cogsBreakdown: [
        { code: accounting.COA.RETAIL_COGS, name: accounting.accountName(accounting.COA.RETAIL_COGS), amount: pl.cogsRetail },
        { code: accounting.COA.LAUNDRY_COGS, name: accounting.accountName(accounting.COA.LAUNDRY_COGS), amount: pl.cogsLaundry },
        { code: accounting.COA.JASTIP_COGS, name: accounting.accountName(accounting.COA.JASTIP_COGS), amount: pl.cogsJastip },
      ],
      expenseBreakdown: Object.entries(expenseByCode)
        .map(([code, amount]) => ({ code, name: accounting.accountName(code), amount }))
        .filter((e) => e.amount !== 0)
        .sort((a, b) => b.amount - a.amount),
      balances: {
        cash: assetByCode[accounting.COA.CASH] ?? 0,
        bank: assetByCode[accounting.COA.BANK] ?? 0,
        inventory: assetByCode[accounting.COA.INVENTORY] ?? 0,
        studentWalletLiability: liabilityByCode[accounting.COA.STUDENT_WALLET_LIABILITY] ?? 0,
        supplierPayable: liabilityByCode[accounting.COA.SUPPLIER_PAYABLE] ?? 0,
      },
      journalCount: validEntryIds.size,
    };
  },
});

export const trialBalance = query({
  args: { to: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_VIEW);
    const to = args.to ?? Date.now();
    const lines = await ctx.db
      .query("journalLines")
      .filter((q) => q.lt(q.field("createdAt"), to))
      .collect();
    return accounting.trialBalance(lines);
  },
});

export const listJournals = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    source: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_VIEW);
    let rows = await ctx.db.query("journalEntries").collect();
    if (args.from !== undefined) rows = rows.filter((r) => r.entryDate >= args.from!);
    if (args.to !== undefined) rows = rows.filter((r) => r.entryDate <= args.to!);
    if (args.source) rows = rows.filter((r) => r.source === args.source);
    if (args.search) {
      const s = args.search.toLowerCase();
      rows = rows.filter(
        (r) => r.code.toLowerCase().includes(s) || r.description.toLowerCase().includes(s),
      );
    }
    rows.sort((a, b) => b.entryDate - a.createdAt);
    return { total: rows.length, items: rows.slice(0, Math.min(args.limit ?? 50, 200)) };
  },
});

export const journalDetail = query({
  args: { id: v.id("journalEntries") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new NotFoundError("Jurnal tidak ditemukan");
    const lines = await ctx.db
      .query("journalLines")
      .withIndex("by_entry", (q) => q.eq("journalEntryId", args.id))
      .collect();
    return { entry, lines };
  },
});

export const generalLedger = query({
  args: { accountCode: v.string(), from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_VIEW);
    const def = accounting.accountByCode(args.accountCode);
    if (!def) throw new NotFoundError("Akun tidak ditemukan");

    const lines = await ctx.db
      .query("journalLines")
      .withIndex("by_account", (q) => q.eq("accountCode", args.accountCode))
      .filter(
        (q) =>
          (args.from === undefined || q.gte(q.field("createdAt"), args.from)) &&
          (args.to === undefined || q.lt(q.field("createdAt"), args.to)),
      )
      .collect();
    lines.sort((a, b) => a.createdAt - b.createdAt);

    let running = 0;
    const rows = await Promise.all(
      lines.map(async (line) => {
        const isDebitNormal = def.normalBalance === "DEBIT";
        const movement = isDebitNormal
          ? roundToSen(line.debit - line.credit)
          : roundToSen(line.credit - line.debit);
        running = roundToSen(running + movement);
        const entry = await ctx.db.get(line.journalEntryId);
        return {
          ...line,
          runningBalance: running,
          journalCode: entry?.code,
          description: entry?.description,
          entryDate: entry?.entryDate,
        };
      }),
    );

    return { account: def, rows, closingBalance: running };
  },
});

// ------------------------------------------------------------ BEBAN / EXPENSE ----

export const listExpenses = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_VIEW);
    let rows = await ctx.db.query("expenses").collect();
    if (args.from !== undefined) rows = rows.filter((r) => r.expenseDate >= args.from!);
    if (args.to !== undefined) rows = rows.filter((r) => r.expenseDate <= args.to!);
    rows.sort((a, b) => b.expenseDate - a.expenseDate);
    return {
      total: roundToSen(rows.reduce((s, r) => s + r.amount, 0)),
      items: rows.slice(0, Math.min(args.limit ?? 100, 500)),
    };
  },
});

export const createExpense = mutation({
  args: {
    category: v.string(),
    description: v.string(),
    amount: v.number(),
    expenseDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_EXPENSE);
    const description = requireString(args.description, "Keterangan", 300);
    assertRupiah(args.amount, "Nominal");
    if (args.amount <= 0) throw new BusinessRuleError("Nominal beban harus lebih dari 0");

    const def = accounting.accountByCode(args.category);
    if (!def || def.type !== "EXPENSE") {
      throw new BusinessRuleError("Kategori beban tidak valid");
    }

    const now = Date.now();
    const expenseDate = args.expenseDate ?? now;
    const code = await nextTransactionCode(ctx, "expenses", "EXP", expenseDate);

    const journalEntryId = await postJournal(ctx, {
      entryDate: expenseDate,
      description: `${def.name} — ${description}`,
      source: "EXPENSE",
      referenceType: "expense",
      referenceId: code,
      lines: accounting.expenseJournal(args.category, args.amount),
      user,
    });

    const id = await ctx.db.insert("expenses", {
      code,
      expenseDate,
      category: args.category,
      description,
      amount: args.amount,
      paymentMethod: "CASH",
      recordedBy: user.id,
      recordedByName: user.name,
      journalEntryId,
      createdAt: now,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      user,
      action: "CREATE_EXPENSE",
      entityType: "expense",
      entityId: id,
      newValue: { code, category: args.category, amount: args.amount, description },
    });
    return { id, code, journalEntryId };
  },
});

/** Jurnal manual untuk koreksi/adjustment oleh Finance. */
export const createManualJournal = mutation({
  args: {
    description: v.string(),
    entryDate: v.optional(v.number()),
    lines: v.array(
      v.object({
        accountCode: v.string(),
        debit: v.optional(v.number()),
        credit: v.optional(v.number()),
        memo: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_JOURNAL);
    const description = requireString(args.description, "Keterangan", 300);
    const lines = accounting.buildJournalLines(
      args.lines.map((l) => ({
        accountCode: l.accountCode,
        debit: l.debit,
        credit: l.credit,
        memo: l.memo,
      })),
    );
    const entryDate = args.entryDate ?? Date.now();
    const id = await postJournal(ctx, {
      entryDate,
      description,
      source: "MANUAL",
      lines,
      user,
    });
    await writeAudit(ctx, {
      user,
      action: "CREATE_JOURNAL",
      entityType: "journalEntry",
      entityId: id,
      newValue: { description, lines: args.lines },
    });
    return { id };
  },
});

/** Ringkasan arus kas untuk dashboard keuangan. */
export const cashSummary = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_VIEW);
    const from = args.from ?? startOfMonth(Date.now());
    const to = args.to ?? Date.now();

    const txs = await ctx.db
      .query("cashTransactions")
      .filter((q) => q.gte(q.field("createdAt"), from) && q.lt(q.field("createdAt"), to))
      .collect();

    const byType: Record<string, number> = {};
    for (const t of txs) {
      const key = `${t.direction}:${t.type}`;
      byType[key] = roundToSen((byType[key] ?? 0) + t.amount);
    }

    const shifts = await ctx.db
      .query("cashierShifts")
      .filter((q) => q.gte(q.field("openedAt"), from) && q.lt(q.field("openedAt"), to))
      .collect();
    const closedShifts = shifts.filter((s) => s.status === "CLOSED");

    return {
      cashIn: roundToSen(
        txs.filter((t) => t.direction === "IN").reduce((s, t) => s + t.amount, 0),
      ),
      cashOut: roundToSen(
        txs.filter((t) => t.direction === "OUT").reduce((s, t) => s + t.amount, 0),
      ),
      cashSales: roundToSen(
        txs.filter((t) => t.type === "SALE" && t.direction === "IN").reduce((s, t) => s + t.amount, 0),
      ),
      withdrawalsPaid: roundToSen(
        txs.filter((t) => t.type === "WITHDRAWAL").reduce((s, t) => s + t.amount, 0),
      ),
      byType,
      shiftCount: shifts.length,
      discrepancies: closedShifts.filter((s) => (s.difference ?? 0) !== 0).length,
      totalDiscrepancy: roundToSen(
        closedShifts.reduce((s, sh) => s + (sh.difference ?? 0), 0),
      ),
    };
  },
});

export const dailyFinancial = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_VIEW);
    const days = Math.min(args.days ?? 14, 90);
    const today = startOfDay(Date.now());

    const lines = await ctx.db
      .query("journalLines")
      .filter((q) => q.gte(q.field("createdAt"), today - days * 86_400_000))
      .collect();
    const entries = await ctx.db
      .query("journalEntries")
      .filter((q) => q.gte(q.field("entryDate"), today - days * 86_400_000))
      .collect();
    const byEntry = new Map(entries.map((e) => [e._id, e]));

    const buckets = new Map<number, { revenue: number; cogs: number; expense: number }>();
    for (let i = 0; i < days; i++) {
      buckets.set(today - i * 86_400_000, { revenue: 0, cogs: 0, expense: 0 });
    }

    for (const line of lines) {
      const entry = byEntry.get(line.journalEntryId);
      if (!entry || entry.status !== "POSTED") continue;
      const bucket = buckets.get(startOfDay(entry.entryDate));
      if (!bucket) continue;
      const def = accounting.accountByCode(line.accountCode);
      if (!def) continue;
      if (def.type === "REVENUE") {
        bucket.revenue = roundToSen(bucket.revenue + line.credit - line.debit);
      } else if (def.type === "COGS") {
        bucket.cogs = roundToSen(bucket.cogs + line.debit - line.credit);
      } else if (def.type === "EXPENSE") {
        bucket.expense = roundToSen(bucket.expense + line.debit - line.credit);
      }
    }

    return Array.from(buckets.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([date, v2]) => ({
        date,
        revenue: v2.revenue,
        cogs: v2.cogs,
        expense: v2.expense,
        grossProfit: roundToSen(v2.revenue - v2.cogs),
        netProfit: roundToSen(v2.revenue - v2.cogs - v2.expense),
      }));
  },
});
