import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertPermission, requireUser } from "./lib/guards";
import { startOfDay, startOfMonth } from "./lib/helpers";
import { PERMISSIONS } from "../lib/rbac";
import * as accounting from "../lib/accounting";
import { roundToSen } from "../lib/money";
import { inventoryValue } from "../lib/costing";

const DAY = 86_400_000;

function range(period: string, timestamp: number) {
  const today = startOfDay(timestamp);
  switch (period) {
    case "today":
      return { from: today, to: today + DAY };
    case "week":
      return { from: today - 6 * DAY, to: today + DAY };
    case "month":
      return { from: startOfMonth(timestamp), to: today + DAY };
    case "quarter":
      return { from: today - 89 * DAY, to: today + DAY };
    default:
      return { from: today - 29 * DAY, to: today + DAY };
  }
}

export const salesReport = query({
  args: {
    period: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    groupBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.REPORT_VIEW);
    const { from, to } = args.from !== undefined && args.to !== undefined
      ? { from: args.from, to: args.to }
      : range(args.period ?? "month", Date.now());

    const sales = (await ctx.db.query("sales").collect()).filter(
      (s) => s.status !== "VOID" && s.createdAt >= from && s.createdAt < to,
    );

    const revenue = roundToSen(sales.reduce((s, x) => s + x.total, 0));
    const cogs = roundToSen(sales.reduce((s, x) => s + x.costTotal, 0));

    // Metode pembayaran: CASH = full, WALLET = full, MIXED = split by paidAmount.
    const cashTotal = roundToSen(
      sales.reduce(
        (s, x) =>
          s + (x.paymentMethod === "CASH" ? x.total : x.paymentMethod === "MIXED" ? x.paidAmount - x.total : 0),
        0,
      ),
    );
    const walletTotal = roundToSen(revenue - cashTotal);

    const byMethod: Record<string, { count: number; total: number }> = {};
    for (const s of sales) {
      byMethod[s.paymentMethod] = byMethod[s.paymentMethod] ?? { count: 0, total: 0 };
      byMethod[s.paymentMethod].count += 1;
      byMethod[s.paymentMethod].total = roundToSen(byMethod[s.paymentMethod].total + s.total);
    }

    const byCashier = new Map<string, { name: string; count: number; total: number; cogs: number }>();
    for (const s of sales) {
      const key = s.cashierId;
      const row = byCashier.get(key) ?? { name: s.cashierName, count: 0, total: 0, cogs: 0 };
      row.count += 1;
      row.total = roundToSen(row.total + s.total);
      row.cogs = roundToSen(row.cogs + s.costTotal);
      byCashier.set(key, row);
    }

    const salesRows = await ctx.db.query("sales").collect();
    const saleIds = new Set(sales.map((s) => s._id));
    const items = (await ctx.db.query("saleItems").collect()).filter((i) =>
      saleIds.has(i.saleId),
    );
    const byProduct = new Map<string, { name: string; qty: number; total: number; cogs: number }>();
    for (const item of items) {
      const key = item.productId ?? item.name;
      const row = byProduct.get(key) ?? { name: item.name, qty: 0, total: 0, cogs: 0 };
      row.qty = roundToSen(row.qty + item.quantity);
      row.total = roundToSen(row.total + item.subtotal);
      row.cogs = roundToSen(row.cogs + item.cogs);
      byProduct.set(key, row);
    }
    void salesRows;

    // Tren harian
    const byDay = new Map<number, { revenue: number; cogs: number; count: number }>();
    for (const s of sales) {
      const day = startOfDay(s.createdAt);
      const row = byDay.get(day) ?? { revenue: 0, cogs: 0, count: 0 };
      row.revenue = roundToSen(row.revenue + s.total);
      row.cogs = roundToSen(row.cogs + s.costTotal);
      row.count += 1;
      byDay.set(day, row);
    }

    return {
      period: { from, to },
      summary: {
        transactionCount: sales.length,
        revenue,
        cogs,
        grossProfit: roundToSen(revenue - cogs),
        margin: revenue > 0 ? roundToSen(((revenue - cogs) / revenue) * 10000) / 100 : 0,
        averageTransaction: sales.length > 0 ? roundToSen(revenue / sales.length) : 0,
        walletTotal,
        cashTotal,
      },
      byMethod: Object.entries(byMethod).map(([method, v2]) => ({ method, ...v2 })),
      byCashier: Array.from(byCashier.values()).map((c) => ({
        ...c,
        grossProfit: roundToSen(c.total - c.cogs),
      })),
      byProduct: Array.from(byProduct.values()).sort((a, b) => b.total - a.total),
      byDay: Array.from(byDay.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([date, v2]) => ({ date, ...v2, grossProfit: roundToSen(v2.revenue - v2.cogs) })),
      transactions: sales
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 200)
        .map((s) => ({
          id: s._id,
          code: s.code,
          date: s.createdAt,
          cashier: s.cashierName,
          student: s.studentName ?? "Umum",
          paymentMethod: s.paymentMethod,
          total: s.total,
          cogs: s.costTotal,
          status: s.status,
        })),
    };
  },
});

export const inventoryReport = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.INVENTORY_VIEW);
    const products = await ctx.db.query("products").collect();
    const movements = await ctx.db.query("inventoryMovements").collect();
    const monthStart = startOfMonth(Date.now());

    const active = products.filter((p) => p.isActive);
    const totalValue = roundToSen(
      active.reduce((s, p) => s + inventoryValue({ quantity: p.stock, averageCost: p.averageCost }), 0),
    );
    const totalRetail = roundToSen(active.reduce((s, p) => s + p.stock * p.sellingPrice, 0));

    const monthMovements = movements.filter((m) => m.createdAt >= monthStart);
    const byType: Record<string, { count: number; qty: number; value: number }> = {};
    for (const m of monthMovements) {
      byType[m.type] = byType[m.type] ?? { count: 0, qty: 0, value: 0 };
      byType[m.type].count += 1;
      byType[m.type].qty = roundToSen(byType[m.type].qty + m.quantity);
      byType[m.type].value = roundToSen(
        byType[m.type].value + Math.abs(m.stockAfter - m.stockBefore) * m.unitCostAfter,
      );
    }

    return {
      summary: {
        totalProducts: active.length,
        totalValue,
        totalRetail,
        potentialProfit: roundToSen(totalRetail - totalValue),
        lowStockCount: active.filter((p) => p.stock <= Math.max(p.minStock, 10)).length,
        outOfStockCount: active.filter((p) => p.stock <= 0).length,
      },
      movementsByType: Object.entries(byType).map(([type, v2]) => ({ type, ...v2 })),
      products: active
        .map((p) => ({
          id: p._id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          stock: p.stock,
          averageCost: p.averageCost,
          sellingPrice: p.sellingPrice,
          minStock: p.minStock,
          value: inventoryValue({ quantity: p.stock, averageCost: p.averageCost }),
          margin: roundToSen(p.sellingPrice - p.averageCost),
        }))
        .sort((a, b) => b.value - a.value),
      recentMovements: movements
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100),
    };
  },
});

export const walletReport = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_VIEW);
    const from = args.from ?? startOfMonth(Date.now());
    const to = args.to ?? Date.now();

    const ledger = (await ctx.db.query("walletLedger").collect()).filter(
      (e) => e.createdAt >= from && e.createdAt < to,
    );
    const wallets = await ctx.db.query("wallets").collect();
    const students = await ctx.db.query("students").collect();
    const studentMap = new Map(students.map((s) => [s._id, s]));

    const byType: Record<string, { count: number; total: number }> = {};
    for (const e of ledger) {
      byType[e.type] = byType[e.type] ?? { count: 0, total: 0 };
      byType[e.type].count += 1;
      byType[e.type].total = roundToSen(byType[e.type].total + e.amount);
    }

    const byStudent = new Map<
      string,
      { name: string; nis: string; credit: number; debit: number; net: number }
    >();
    for (const e of ledger) {
      const s = studentMap.get(e.studentId);
      const key = e.studentId;
      const row = byStudent.get(key) ?? {
        name: s?.name ?? "-",
        nis: s?.nis ?? "-",
        credit: 0,
        debit: 0,
        net: 0,
      };
      if (e.direction === "CREDIT") row.credit = roundToSen(row.credit + e.amount);
      else row.debit = roundToSen(row.debit + e.amount);
      row.net = roundToSen(row.credit - row.debit);
      byStudent.set(key, row);
    }

    return {
      period: { from, to },
      summary: {
        totalWallets: wallets.length,
        totalBalance: roundToSen(wallets.reduce((s, w) => s + w.currentBalance, 0)),
        frozenWallets: wallets.filter((w) => w.status !== "ACTIVE").length,
        transactionCount: ledger.length,
        totalCredit: roundToSen(
          ledger.filter((e) => e.direction === "CREDIT").reduce((s, e) => s + e.amount, 0),
        ),
        totalDebit: roundToSen(
          ledger.filter((e) => e.direction === "DEBIT").reduce((s, e) => s + e.amount, 0),
        ),
        liability: roundToSen(wallets.reduce((s, w) => s + w.currentBalance, 0)),
      },
      byType: Object.entries(byType).map(([type, v2]) => ({ type, ...v2 })),
      byStudent: Array.from(byStudent.values()).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)),
      topBalances: wallets
        .map((w) => ({
          studentId: w.studentId,
          name: studentMap.get(w.studentId)?.name ?? "-",
          nis: studentMap.get(w.studentId)?.nis ?? "-",
          balance: w.currentBalance,
          status: w.status,
        }))
        .sort((a, b) => b.balance - a.balance)
        .slice(0, 20),
    };
  },
});

export const cashierReport = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.REPORT_VIEW);
    const from = args.from ?? startOfMonth(Date.now());
    const to = args.to ?? Date.now();

    const shifts = (await ctx.db.query("cashierShifts").collect()).filter(
      (s) => s.openedAt >= from && s.openedAt < to,
    );
    const sales = (await ctx.db.query("sales").collect()).filter(
      (s) => s.createdAt >= from && s.createdAt < to && s.status !== "VOID",
    );

    const byCashier = new Map<
      string,
      {
        name: string;
        transactions: number;
        revenue: number;
        cashSales: number;
        walletSales: number;
        withdrawals: number;
        shiftCount: number;
        discrepancy: number;
      }
    >();

    const ensure = (id: string, name: string) => {
      const row = byCashier.get(id) ?? {
        name,
        transactions: 0,
        revenue: 0,
        cashSales: 0,
        walletSales: 0,
        withdrawals: 0,
        shiftCount: 0,
        discrepancy: 0,
      };
      byCashier.set(id, row);
      return row;
    };

    for (const s of sales) {
      const row = ensure(s.cashierId, s.cashierName);
      row.transactions += 1;
      row.revenue = roundToSen(row.revenue + s.total);
      if (s.paymentMethod === "CASH") row.cashSales = roundToSen(row.cashSales + s.total);
      else if (s.paymentMethod === "WALLET") row.walletSales = roundToSen(row.walletSales + s.total);
      else {
        row.cashSales = roundToSen(row.cashSales + (s.paidAmount - s.total));
        row.walletSales = roundToSen(row.walletSales + s.total - (s.paidAmount - s.total));
      }
    }

    const txs = (await ctx.db.query("cashTransactions").collect()).filter(
      (t) => t.createdAt >= from && t.createdAt < to && t.type === "WITHDRAWAL",
    );
    const shiftMap = new Map(shifts.map((s) => [s._id, s]));
    for (const t of txs) {
      if (!t.shiftId) continue;
      const shift = shiftMap.get(t.shiftId);
      if (!shift) continue;
      const row = ensure(shift.cashierId, shift.cashierName);
      row.withdrawals = roundToSen(row.withdrawals + t.amount);
    }

    for (const shift of shifts) {
      const row = ensure(shift.cashierId, shift.cashierName);
      row.shiftCount += 1;
      if (shift.status === "CLOSED") {
        row.discrepancy = roundToSen(row.discrepancy + (shift.difference ?? 0));
      }
    }

    return {
      period: { from, to },
      shifts: shifts
        .sort((a, b) => b.openedAt - a.openedAt)
        .map((s) => ({
          id: s._id,
          code: s.code,
          cashier: s.cashierName,
          openedAt: s.openedAt,
          closedAt: s.closedAt,
          openingCash: s.openingCash,
          cashSales: s.cashSales,
          expectedCash: s.expectedCash,
          actualCash: s.actualCash,
          difference: s.difference,
          status: s.status,
        })),
      byCashier: Array.from(byCashier.values()).sort((a, b) => b.revenue - a.revenue),
    };
  },
});

export const financialReport = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    skip: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.REPORT_FINANCIAL);
    const from = args.from ?? startOfMonth(Date.now());
    const to = args.to ?? Date.now();

    const entries = (await ctx.db.query("journalEntries").collect()).filter(
      (e) => e.entryDate >= from && e.entryDate < to,
    );
    const entryIds = new Set(entries.map((e) => e._id));
    const allLines = await ctx.db.query("journalLines").collect();
    const lines = allLines.filter((l) => entryIds.has(l.journalEntryId));

    const bySource: Record<string, { count: number; total: number }> = {};
    for (const e of entries) {
      bySource[e.source] = bySource[e.source] ?? { count: 0, total: 0 };
      bySource[e.source].count += 1;
      bySource[e.source].total = roundToSen(bySource[e.source].total + e.totalDebit);
    }

    // Saldo kumulatif seluruh jurnal untuk posisi kas/bank/wallet liability.
    const tb = accounting.trialBalance(allLines);
    void lines;

    return {
      period: { from, to },
      trialBalance: tb,
      journalSummary: {
        totalEntries: entries.length,
        totalDebit: roundToSen(entries.reduce((s, e) => s + e.totalDebit, 0)),
        bySource: Object.entries(bySource).map(([source, v2]) => ({ source, ...v2 })),
      },
      positions: tb.rows
        .filter((r) => ["ASSET", "LIABILITY"].includes(r.accountType))
        .map((r) => ({ ...r, balance: roundToSen(r.debit - r.credit) })),
    };
  },
});

/** Export CSV (blueprint §56). */
export const exportCsv = query({
  args: {
    dataset: v.union(
      v.literal("sales"),
      v.literal("wallet"),
      v.literal("inventory"),
      v.literal("cashier"),
      v.literal("expenses"),
    ),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    skip: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.REPORT_VIEW);
    const from = args.from ?? startOfMonth(Date.now());
    const to = args.to ?? Date.now();
    const escape = (v2: unknown) => {
      const s = String(v2 ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const toCsv = (headers: string[], rows: unknown[][]) =>
      [headers, ...rows].map((r) => r.map(escape).join(",")).join("\n");

    if (args.dataset === "sales") {
      const rows = (await ctx.db.query("sales").collect())
        .filter((s) => s.createdAt >= from && s.createdAt < to && s.status !== "VOID")
        .sort((a, b) => b.createdAt - a.createdAt);
      return toCsv(
        ["Kode", "Tanggal", "Kasir", "Santri", "Metode", "Subtotal", "Diskon", "Total", "HPP", "Laba Kotor", "Status"],
        rows.map((s) => [
          s.code,
          new Date(s.createdAt).toISOString(),
          s.cashierName,
          s.studentName ?? "Umum",
          s.paymentMethod,
          s.subtotal,
          s.discount,
          s.total,
          s.costTotal,
          roundToSen(s.total - s.costTotal),
          s.status,
        ]),
      );
    }

    if (args.dataset === "wallet") {
      const rows = (await ctx.db.query("walletLedger").collect())
        .filter((e) => e.createdAt >= from && e.createdAt < to)
        .sort((a, b) => b.createdAt - a.createdAt);
      const students = await ctx.db.query("students").collect();
      const map = new Map(students.map((s) => [s._id, s]));
      return toCsv(
        ["Transaksi", "Tanggal", "Santri", "NIS", "Tipe", "Arah", "Nominal", "Saldo Sebelum", "Saldo Sesudah"],
        rows.map((e) => [
          e.transactionId,
          new Date(e.createdAt).toISOString(),
          map.get(e.studentId)?.name ?? "-",
          map.get(e.studentId)?.nis ?? "-",
          e.type,
          e.direction,
          e.amount,
          e.balanceBefore,
          e.balanceAfter,
        ]),
      );
    }

    if (args.dataset === "inventory") {
      const rows = (await ctx.db.query("products").collect()).filter((p) => p.isActive);
      return toCsv(
        ["SKU", "Nama", "Satuan", "Stok", "HPP Rata-rata", "Harga Jual", "Nilai Persediaan", "Min Stok"],
        rows.map((p) => [
          p.sku,
          p.name,
          p.unit,
          p.stock,
          p.averageCost,
          p.sellingPrice,
          inventoryValue({ quantity: p.stock, averageCost: p.averageCost }),
          p.minStock,
        ]),
      );
    }

    if (args.dataset === "cashier") {
      const rows = (await ctx.db.query("cashierShifts").collect())
        .filter((s) => s.openedAt >= from && s.openedAt < to)
        .sort((a, b) => b.openedAt - a.openedAt);
      return toCsv(
        ["Kode", "Kasir", "Dibuka", "Ditutup", "Modal", "Penjualan Tunai", "Harus", "Aktual", "Selisih", "Status"],
        rows.map((s) => [
          s.code,
          s.cashierName,
          new Date(s.openedAt).toISOString(),
          s.closedAt ? new Date(s.closedAt).toISOString() : "",
          s.openingCash,
          s.cashSales,
          s.expectedCash,
          s.actualCash ?? "",
          s.difference ?? "",
          s.status,
        ]),
      );
    }

    const rows = (await ctx.db.query("expenses").collect())
      .filter((e) => e.expenseDate >= from && e.expenseDate < to)
      .sort((a, b) => b.expenseDate - a.expenseDate);
    return toCsv(
      ["Kode", "Tanggal", "Kategori", "Keterangan", "Nominal", "Dicatat Oleh"],
      rows.map((e) => [
        e.code,
        new Date(e.expenseDate).toISOString(),
        accounting.accountName(e.category),
        e.description,
        e.amount,
        e.recordedByName ?? "-",
      ]),
    );
  },
});
