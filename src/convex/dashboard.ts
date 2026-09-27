import { query } from "./_generated/server";
import { assertPermission, requireUser } from "./lib/guards";
import { getSettings, startOfDay, startOfMonth } from "./lib/helpers";
import { PERMISSIONS } from "../lib/rbac";
import * as accounting from "../lib/accounting";
import { roundToSen } from "../lib/money";
import { inventoryValue } from "../lib/costing";

const DAY = 86_400_000;

export const operational = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.DASHBOARD_VIEW);
    const now = Date.now();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const settings = await getSettings(ctx);

    const sales = (await ctx.db.query("sales").collect()).filter((s) => s.status !== "VOID");
    const todaySales = sales.filter((s) => s.createdAt >= todayStart);
    const monthSales = sales.filter((s) => s.createdAt >= monthStart);

    const products = (await ctx.db.query("products").collect()).filter((p) => p.isActive);
    const lowStock = products.filter(
      (p) => p.trackInventory && p.stock <= Math.max(p.minStock, settings.lowStockThreshold),
    );

    const shifts = await ctx.db.query("cashierShifts").collect();
    const openShifts = shifts.filter((s) => s.status === "OPEN");

    const ledgerToday = (await ctx.db.query("walletLedger").collect()).filter(
      (e) => e.createdAt >= todayStart,
    );

    const walletTotal = roundToSen(
      (await ctx.db.query("wallets").collect()).reduce((s, w) => s + w.currentBalance, 0),
    );

    const ppobPending = (await ctx.db.query("ppobTransactions").collect()).filter(
      (p) => p.status === "PENDING" || p.status === "FAILED",
    );

    // Tren 7 hari
    const trend: { date: number; revenue: number; transactions: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = todayStart - i * DAY;
      const next = day + DAY;
      const daySales = sales.filter((s) => s.createdAt >= day && s.createdAt < next);
      trend.push({
        date: day,
        revenue: roundToSen(daySales.reduce((s, x) => s + x.total, 0)),
        transactions: daySales.length,
      });
    }

    return {
      today: {
        revenue: roundToSen(todaySales.reduce((s, x) => s + x.total, 0)),
        transactions: todaySales.length,
        cogs: roundToSen(todaySales.reduce((s, x) => s + x.costTotal, 0)),
        walletTransactions: ledgerToday.length,
        walletVolume: roundToSen(ledgerToday.reduce((s, e) => s + e.amount, 0)),
        averageTransaction:
          todaySales.length > 0
            ? roundToSen(todaySales.reduce((s, x) => s + x.total, 0) / todaySales.length)
            : 0,
      },
      month: {
        revenue: roundToSen(monthSales.reduce((s, x) => s + x.total, 0)),
        transactions: monthSales.length,
        profit: roundToSen(
          monthSales.reduce((s, x) => s + x.total - x.costTotal, 0),
        ),
      },
      counts: {
        students: (await ctx.db.query("students").collect()).filter((s) => s.status === "ACTIVE")
          .length,
        products: products.length,
        lowStock: lowStock.length,
        outOfStock: products.filter((p) => p.trackInventory && p.stock <= 0).length,
        activeCashiers: openShifts.length,
        wallets: (await ctx.db.query("wallets").collect()).length,
      },
      walletTotal,
      trend,
      alerts: [
        ...lowStock
          .filter((p) => p.stock <= 0)
          .slice(0, 5)
          .map((p) => ({
            type: "OUT_OF_STOCK",
            severity: "ERROR" as const,
            message: `${p.name} habis (stok 0 ${p.unit})`,
          })),
        ...lowStock
          .filter((p) => p.stock > 0)
          .slice(0, 5)
          .map((p) => ({
            type: "LOW_STOCK",
            severity: "WARNING" as const,
            message: `${p.name} tersisa ${p.stock} ${p.unit}`,
          })),
        ...shifts
          .filter((s) => s.status === "CLOSED" && (s.difference ?? 0) !== 0)
          .slice(0, 3)
          .map((s) => ({
            type: "CASH_DISCREPANCY",
            severity: "WARNING" as const,
            message: `Selisih kas ${s.cashierName}: ${s.difference}`,
          })),
        ...ppobPending.slice(0, 3).map((p) => ({
          type: "PPOB",
          severity: "WARNING" as const,
          message: `PPOB ${p.status}: ${p.productName}`,
        })),
      ],
      openShifts: openShifts.map((s) => ({
        id: s._id,
        code: s.code,
        cashier: s.cashierName,
        openedAt: s.openedAt,
        cashSales: s.cashSales,
      })),
      recentSales: todaySales
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 8)
        .map((s) => ({
          id: s._id,
          code: s.code,
          time: s.createdAt,
          student: s.studentName ?? "Umum",
          total: s.total,
          method: s.paymentMethod,
        })),
    };
  },
});

export const financial = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.DASHBOARD_FINANCIAL);
    const monthStart = startOfMonth(Date.now());
    const allLines = await ctx.db.query("journalLines").collect();
    const entries = await ctx.db.query("journalEntries").collect();
    const postedIds = new Set(entries.filter((e) => e.status === "POSTED").map((e) => e._id));

    const monthLines = allLines.filter(
      (l) => l.createdAt >= monthStart && postedIds.has(l.journalEntryId),
    );
    const postedLines = allLines.filter((l) => postedIds.has(l.journalEntryId));

    const monthEntries = entries.filter((e) => e.status === "POSTED" && e.entryDate >= monthStart);
    const revenueByCode: Record<string, number> = {};
    const cogsByCode: Record<string, number> = {};
    const expenseByCode: Record<string, number> = {};
    for (const line of monthLines) {
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
      }
    }

    const pl = accounting.computeProfitAndLoss({ revenueByCode, cogsByCode, expenseByCode });

    // Posisi balance kumulatif (seluruh jurnal posted).
    const tb = accounting.trialBalance(postedLines);
    const position = (code: string) => {
      const row = tb.rows.find((r) => r.accountCode === code);
      return row ? roundToSen(row.debit - row.credit) : 0;
    };

    const products = (await ctx.db.query("products").collect()).filter((p) => p.isActive);

    return {
      month: {
        ...pl,
        periodFrom: monthStart,
        journalCount: monthEntries.length,
      },
      position: {
        cash: position(accounting.COA.CASH),
        bank: position(accounting.COA.BANK),
        inventoryValue: roundToSen(
          products.reduce(
            (s, p) => s + inventoryValue({ quantity: p.stock, averageCost: p.averageCost }),
            0,
          ),
        ),
        studentWalletLiability: position(accounting.COA.STUDENT_WALLET_LIABILITY),
        supplierPayable: position(accounting.COA.SUPPLIER_PAYABLE),
      },
      trialBalanceBalanced: tb.isBalanced,
      totalDebit: tb.totalDebit,
      totalCredit: tb.totalCredit,
    };
  },
});

export const checkAlerts = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.DASHBOARD_VIEW);
    const settings = await getSettings(ctx);
    const products = (await ctx.db.query("products").collect()).filter((p) => p.isActive);
    const wallets = await ctx.db.query("wallets").collect();
    const shifts = await ctx.db.query("cashierShifts").collect();

    return {
      lowStock: products
        .filter((p) => p.trackInventory && p.stock <= Math.max(p.minStock, settings.lowStockThreshold))
        .length,
      frozenWallets: wallets.filter((w) => w.status !== "ACTIVE").length,
      walletsAtMin: wallets.filter((w) => w.currentBalance <= settings.walletMinimumBalance).length,
      openShifts: shifts.filter((s) => s.status === "OPEN").length,
      cashDiscrepancy: shifts.filter((s) => s.status === "CLOSED" && (s.difference ?? 0) !== 0).length,
    };
  },
});
