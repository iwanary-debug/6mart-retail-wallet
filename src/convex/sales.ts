import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  assertPermission,
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  recordMetric,
  requireUser,
  writeAudit,
} from "./lib/guards";
import {
  beginIdempotent,
  completeIdempotent,
  failIdempotent,
  getSettings,
  nextTransactionCode,
  requireString,
} from "./lib/helpers";
import { changeStock } from "./lib/inventoryEngine";
import { mutateWallet, postJournal } from "./lib/walletEngine";
import { PERMISSIONS, ROLES } from "../lib/rbac";
import * as accounting from "../lib/accounting";
import { assertRupiah, roundToSen } from "../lib/money";
import { startTimer } from "./lib/helpers";

// ----------------------------------------------------------- CASHIER SHIFT ----

export const openShift = mutation({
  args: { openingCash: v.number() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SHIFT_MANAGE);
    assertRupiah(args.openingCash, "Modal awal");

    const existing = await ctx.db
      .query("cashierShifts")
      .withIndex("by_cashier", (q) => q.eq("cashierId", user.id))
      .filter((q) => q.eq(q.field("status"), "OPEN"))
      .first();
    if (existing) {
      throw new BusinessRuleError(
        "Anda masih memiliki shift terbuka. Tutup shift terlebih dahulu.",
      );
    }

    const now = Date.now();
    const code = `SHF-${now.toString().slice(-8)}`;

    const shiftId = await ctx.db.insert("cashierShifts", {
      code,
      cashierId: user.id,
      cashierName: user.name,
      openingCash: args.openingCash,
      cashSales: 0,
      cashIn: 0,
      cashOut: 0,
      cashExpenses: 0,
      expectedCash: args.openingCash,
      openedAt: now,
      status: "OPEN",
      createdAt: now,
      updatedAt: now,
    });

    if (args.openingCash > 0) {
      await ctx.db.insert("cashTransactions", {
        shiftId,
        type: "OPENING_BALANCE",
        direction: "IN",
        amount: args.openingCash,
        note: "Modal awal shift",
        createdBy: user.id,
        createdAt: now,
      });
    }

    await writeAudit(ctx, {
      user,
      action: "OPEN_SHIFT",
      entityType: "cashierShift",
      entityId: shiftId,
      newValue: { openingCash: args.openingCash },
    });

    return { shiftId, code };
  },
});

/**
 * Menghitung Expected kas untuk satu shift dari transaksi kasnya.
 *
 * Nilai `expectedCash` yang tersimpan di dokumen shift HANYA akurat setelah
 * shift ditutup. Selama shift masih terbuka, field itu masih sama dengan
 * modal awal — penjualan tunai yang masuk tidak pernah ikut dihitung. Karena
 * itu modal "Tutup Shift" harus menghitung ulang dari transaksi, bukan
 * membaca field yang tersimpan.
 *
 * Rumus yang sama dipakai `closeShift` supaya angka di layar dan angka yang
 * tercatat di audit log tidak pernah berbeda.
 */
function computeShiftCash(
  shift: {
    openingCash: number;
    cashIn: number;
    cashOut: number;
    cashExpenses: number;
  },
  txs: { type: string; direction: string; amount: number }[],
) {
  const cashSales = roundToPen(
    txs
      .filter((t) => t.type === "SALE" && t.direction === "IN")
      .reduce((s, t) => s + t.amount, 0),
  );
  const withdrawals = roundToPen(
    txs.filter((t) => t.type === "WITHDRAWAL").reduce((s, t) => s + t.amount, 0),
  );
  const expenses = roundToPen(
    txs.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amount, 0),
  );
  const cashIn = roundToPen(
    txs.filter((t) => t.type === "CASH_IN").reduce((s, t) => s + t.amount, 0),
  );
  const cashOut = roundToPen(
    txs.filter((t) => t.type === "CASH_OUT").reduce((s, t) => s + t.amount, 0),
  );

  const expectedCash = roundToSen(
    shift.openingCash + cashSales + cashIn - withdrawals - expenses - cashOut,
  );

  return { cashSales, withdrawals, expenses, cashIn, cashOut, expectedCash };
}

export const closeShift = mutation({
  args: { shiftId: v.id("cashierShifts"), actualCash: v.number(), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SHIFT_MANAGE);
    assertRupiah(args.actualCash, "Kas aktual");

    const shift = await ctx.db.get(args.shiftId);
    if (!shift) throw new NotFoundError("Shift tidak ditemukan");
    if (shift.status !== "OPEN") throw new BusinessRuleError("Shift sudah ditutup");
    if (shift.cashierId !== user.id && user.roleKey !== ROLES.SUPER_ADMIN && user.roleKey !== ROLES.MANAGER) {
      throw new ForbiddenError("Anda hanya dapat menutup shift Anda sendiri");
    }

    // Recalculate dari cash transactions agar akurat.
    const txs = await ctx.db
      .query("cashTransactions")
      .withIndex("by_shift", (q) => q.eq("shiftId", args.shiftId))
      .collect();
    const { cashSales, expenses, cashIn, cashOut, expectedCash } =
      computeShiftCash(shift, txs);
    const difference = roundToSen(args.actualCash - expectedCash);
    const now = Date.now();

    await ctx.db.patch(args.shiftId, {
      cashSales,
      cashIn,
      cashOut,
      cashExpenses: expenses,
      expectedCash,
      actualCash: args.actualCash,
      difference,
      closedAt: now,
      status: "CLOSED",
      note: args.note,
      updatedAt: now,
    });

    if (difference !== 0) {
      await ctx.db.insert("cashTransactions", {
        shiftId: args.shiftId,
        type: "SHIFT_ADJUSTMENT",
        direction: difference > 0 ? "IN" : "OUT",
        amount: Math.abs(difference),
        note: `Selisih tutup shift ${difference > 0 ? "lebih" : "kurang"}`,
        createdBy: user.id,
        createdAt: now,
      });
    }

    await writeAudit(ctx, {
      user,
      action: "CLOSE_SHIFT",
      entityType: "cashierShift",
      entityId: args.shiftId,
      newValue: { expectedCash, actualCash: args.actualCash, difference, cashSales },
    });

    return { expectedCash, actualCash: args.actualCash, difference, cashSales };
  },
});

function roundToPen(value: number) {
  return roundToSen(value);
}

export const currentShift = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return await ctx.db
      .query("cashierShifts")
      .withIndex("by_cashier", (q) => q.eq("cashierId", user.id))
      .filter((q) => q.eq(q.field("status"), "OPEN"))
      .first();
  },
});

export const listShifts = query({
  args: { status: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SALE_VIEW);
    let rows = await ctx.db.query("cashierShifts").collect();
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    rows.sort((a, b) => b.openedAt - a.openedAt);
    return { total: rows.length, items: rows.slice(0, Math.min(args.limit ?? 50, 200)) };
  },
});

export const shiftDetail = query({
  args: { shiftId: v.id("cashierShifts") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const shift = await ctx.db.get(args.shiftId);
    if (!shift) throw new NotFoundError("Shift tidak ditemukan");
    const txs = await ctx.db
      .query("cashTransactions")
      .withIndex("by_shift", (q) => q.eq("shiftId", args.shiftId))
      .collect();
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_shift", (q) => q.eq("shiftId", args.shiftId))
      .collect();
    // `shift.expectedCash` baru akurat setelah shift ditutup, jadi frontend
    // membutuhkan angka yang dihitung ulang dari transaksi kas.
    const cash = computeShiftCash(shift, txs);
    return {
      shift,
      ...cash,
      transactions: txs.sort((a, b) => a.createdAt - b.createdAt),
      sales,
    };
  },
});

export const cashMovement = mutation({
  args: {
    type: v.union(v.literal("CASH_IN"), v.literal("CASH_OUT")),
    amount: v.number(),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SHIFT_MANAGE);
    assertRupiah(args.amount, "Nominal");
    if (args.amount <= 0) throw new BusinessRuleError("Nominal harus lebih dari 0");
    const note = requireString(args.note, "Keterangan", 200);

    const shift = await currentShiftOf(ctx, user.id);
    const now = Date.now();
    const id = await ctx.db.insert("cashTransactions", {
      shiftId: shift?._id,
      type: args.type,
      direction: args.type === "CASH_IN" ? "IN" : "OUT",
      amount: args.amount,
      note,
      createdBy: user.id,
      createdAt: now,
    });

    if (shift) {
      await ctx.db.patch(shift._id, {
        [args.type === "CASH_IN" ? "cashIn" : "cashOut"]:
          (args.type === "CASH_IN" ? shift.cashIn : shift.cashOut) + args.amount,
        updatedAt: now,
      });
    }

    await writeAudit(ctx, {
      user,
      action: args.type,
      entityType: "cashTransaction",
      entityId: id,
      newValue: { amount: args.amount, note },
    });
    return { id };
  },
});

async function currentShiftOf(ctx: any, cashierId: Id<"users">) {
  return await ctx.db
    .query("cashierShifts")
    .withIndex("by_cashier", (q: any) => q.eq("cashierId", cashierId))
    .filter((q: any) => q.eq(q.field("status"), "OPEN"))
    .first();
}

// ------------------------------------------------------------------ SALES ----

export const listSales = query({
  args: {
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    cashierId: v.optional(v.id("users")),
    studentId: v.optional(v.id("students")),
    paymentMethod: v.optional(v.string()),
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SALE_VIEW);
    let rows = await ctx.db.query("sales").collect();
    if (args.from !== undefined) rows = rows.filter((r) => r.createdAt >= args.from!);
    if (args.to !== undefined) rows = rows.filter((r) => r.createdAt <= args.to!);
    if (args.cashierId) rows = rows.filter((r) => r.cashierId === args.cashierId);
    if (args.studentId) rows = rows.filter((r) => r.studentId === args.studentId);
    if (args.paymentMethod) rows = rows.filter((r) => r.paymentMethod === args.paymentMethod);
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    if (args.search) {
      const s = args.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.code.toLowerCase().includes(s) ||
          r.invoiceNumber.toLowerCase().includes(s) ||
          (r.studentName ?? "").toLowerCase().includes(s),
      );
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);
    const limit = Math.min(args.limit ?? 50, 200);

    const page = rows.slice(0, limit);
    const withRefunds = await Promise.all(
      page.map(async (s) => {
        const refunds = await ctx.db
          .query("refunds")
          .withIndex("by_sale", (q) => q.eq("saleId", s._id))
          .collect();
        return {
          ...s,
          refundedAmount: roundToSen(refunds.reduce((sum, r) => sum + r.amount, 0)),
        };
      }),
    );

    return {
      total: rows.length,
      totalAmount: roundToSen(rows.reduce((s, r) => s + r.total, 0)),
      items: withRefunds,
    };
  },
});

export const getSale = query({
  args: { id: v.id("sales"), skip: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const sale = await ctx.db.get(args.id);
    if (!sale) throw new NotFoundError("Transaksi tidak ditemukan");
    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.id))
      .collect();
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_sale", (q) => q.eq("saleId", args.id))
      .collect();
    const refunds = await ctx.db
      .query("refunds")
      .withIndex("by_sale", (q) => q.eq("saleId", args.id))
      .collect();
    const settings = await getSettings(ctx);

    let balanceAfter: number | null = null;
    if (sale.studentId) {
      const wallet = await ctx.db
        .query("wallets")
        .withIndex("by_student", (q) => q.eq("studentId", sale.studentId!))
        .unique();
      balanceAfter = wallet?.currentBalance ?? null;
    }

    return {
      sale,
      items,
      payments,
      refunds,
      storeName: settings.storeName,
      receiptHeader: settings.receiptHeader,
      receiptFooter: settings.receiptFooter,
      balanceAfter,
    };
  },
});

/**
 * CHECKOUT — operasi paling kritis di 6Mart (blueprint §8, §43).
 *
 * Semua langkah berikut terjadi dalam SATU transaksi Convex (atomic):
 *   1. Validasi shift kasir
 *   2. Validasi stok & harga
 *   3. Buat sale + sale_items
 *   4. Debit wallet (ledger) bila pembayaran wallet
 *   5. Kurangi stok + catat HPP (weighted average)
 *   6. Buat jurnal Revenue + COGS
 *   7. Catat kas & audit
 *
 * Idempotency key mencegah double charge bila tombol ditekan 2x.
 */
export const checkout = mutation({
  args: {
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
        discount: v.optional(v.number()),
      }),
    ),
    studentId: v.optional(v.id("students")),
    identificationMethod: v.optional(
      v.union(v.literal("RFID"), v.literal("QR"), v.literal("NIS"), v.literal("MANUAL")),
    ),
    walletAmount: v.optional(v.number()),
    cashAmount: v.optional(v.number()),
    cashTendered: v.optional(v.number()),
    globalDiscount: v.optional(v.number()),
    idempotencyKey: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const stopWatch = startTimer();
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SALE_CREATE);

    const settings = await getSettings(ctx);
    if (args.items.length === 0) {
      throw new BusinessRuleError("Keranjang masih kosong");
    }

    // 1. Shift kasir harus terbuka
    const shift = await currentShiftOf(ctx, user.id);
    if (!shift) {
      throw new BusinessRuleError("Buka shift kasir terlebih dahulu sebelum transaksi");
    }

    // 2. Idempotency (anti double-charge)
    const hit = await beginIdempotent(
      ctx,
      "pos.checkout",
      args.idempotencyKey,
      JSON.stringify({ items: args.items, studentId: args.studentId ?? null }),
      user.id,
    );
    if (hit.status === "REPLAY") {
      return { ...(hit.result as any), replayed: true };
    }

    try {
      const result = await processCheckout(ctx, user, args, shift, settings);
      await completeIdempotent(ctx, "pos.checkout", args.idempotencyKey, result);
      await recordMetric(ctx, "checkout", stopWatch(), true, user.id, result.code);
      return { ...result, replayed: false };
    } catch (error) {
      await failIdempotent(ctx, "pos.checkout", args.idempotencyKey);
      await recordMetric(
        ctx,
        "checkout",
        stopWatch(),
        false,
        user.id,
        error instanceof Error ? error.message.slice(0, 200) : "error",
      );
      throw error;
    }
  },
});

async function processCheckout(
  ctx: any,
  user: Awaited<ReturnType<typeof requireUser>>,
  args: {
    items: { productId: Id<"products">; quantity: number; discount?: number }[];
    studentId?: Id<"students">;
    identificationMethod?: "RFID" | "QR" | "NIS" | "MANUAL";
    walletAmount?: number;
    cashAmount?: number;
    cashTendered?: number;
    globalDiscount?: number;
    idempotencyKey: string;
    note?: string;
  },
  shift: { _id: Id<"cashierShifts">; openingCash: number; cashSales: number; cashExpenses: number },
  settings: Awaited<ReturnType<typeof getSettings>>,
) {
  const now = Date.now();
  const code = await nextTransactionCode(ctx, "sales", "SAL", now);

  // 3. Hitung total & validasi harga
  let subtotal = 0;
  let totalDiscount = 0;
  const lines: {
    product: any;
    quantity: number;
    sellingPrice: number;
    averageCost: number;
    discount: number;
    subtotal: number;
  }[] = [];

  for (const item of args.items) {
    if (item.quantity <= 0) {
      throw new BusinessRuleError("Quantity item harus lebih dari 0");
    }
    const product = await ctx.db.get(item.productId);
    if (!product) throw new NotFoundError("Produk tidak ditemukan");
    if (!product.isActive) {
      throw new BusinessRuleError(`Produk "${product.name}" sudah tidak aktif`);
    }
    if (product.trackInventory && item.quantity > product.stock + 1e-9) {
      throw new BusinessRuleError(
        `Stok "${product.name}" tidak cukup. Tersedia ${product.stock} ${product.unit}, diminta ${item.quantity}.`,
      );
    }
    const lineSubtotal = roundToSen(item.quantity * product.sellingPrice);
    const lineDiscount = Math.min(item.discount ?? 0, lineSubtotal);
    subtotal = roundToSen(subtotal + lineSubtotal);
    totalDiscount = roundToSen(totalDiscount + lineDiscount);
    lines.push({
      product,
      quantity: item.quantity,
      sellingPrice: product.sellingPrice,
      averageCost: product.averageCost,
      discount: lineDiscount,
      subtotal: roundToSen(lineSubtotal - lineDiscount),
    });
  }

  const globalDiscount = Math.min(args.globalDiscount ?? 0, subtotal);
  totalDiscount = roundToSen(totalDiscount + globalDiscount);
  const total = roundToSen(subtotal - totalDiscount);
  if (total <= 0) throw new BusinessRuleError("Total transaksi harus lebih dari 0");

  // 4. Validasi pembayaran
  //
  // `cashAmount` = nominal tunai yang HARUS masuk laci.
  // `cashTendered` = uang yang benar-benar diserahkan pelanggan. Kelebihannya
  // menjadi kembalian: keluar lagi ke pelanggan, jadi TIDAK menambah uang di
  // laci maupun penjualan tunai shift.
  //
  // Tanpa `cashTendered`, kembalian selalu nol karena `cashAmount` dipatok
  // tepat sebesar tagihan.
  const walletAmount = Math.min(args.walletAmount ?? 0, total);
  const cashAmount = Math.min(args.cashAmount ?? 0, roundToSen(total - walletAmount));
  const cashTendered = Math.max(
    cashAmount,
    Math.min(args.cashTendered ?? cashAmount, cashAmount + 1_000_000),
  );
  const paidAmount = roundToSen(walletAmount + cashAmount);
  const changeDue = roundToSen(cashTendered - cashAmount);
  if (paidAmount < total) {
    throw new BusinessRuleError(
      `Pembayaran kurang. Total ${total}, dibayar ${paidAmount}.`,
    );
  }
  if (cashAmount > 0 && !settings.cashPaymentEnabled) {
    throw new BusinessRuleError("Pembayaran tunai sedang dinonaktifkan");
  }

  const paymentMethod =
    walletAmount > 0 && cashAmount > 0 ? "MIXED" : walletAmount > 0 ? "WALLET" : "CASH";

  // 5. Validasi saldo wallet cukup SEBELUM membuat data apa pun
  if (walletAmount > 0) {
    if (!args.studentId) {
      throw new BusinessRuleError("Pembayaran wallet memerlukan data santri");
    }
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_student", (q: any) => q.eq("studentId", args.studentId))
      .unique();
    if (!wallet) throw new BusinessRuleError("Wallet santri tidak ditemukan");
    if (wallet.status !== "ACTIVE") {
      throw new BusinessRuleError("Wallet santri tidak aktif");
    }
    if (wallet.currentBalance < walletAmount) {
      throw new BusinessRuleError(
        `Saldo tidak cukup. Saldo ${wallet.currentBalance}, total transaksi ${walletAmount}.`,
      );
    }
  }

  // 6. Buat header sale
  const student = args.studentId ? await ctx.db.get(args.studentId) : null;
  const saleId = await ctx.db.insert("sales", {
    code,
    invoiceNumber: code,
    studentId: args.studentId,
    studentName: student?.name,
    cashierId: user.id,
    cashierName: user.name,
    shiftId: shift._id,
    channel: "COUNTER",
    paymentMethod,
    identificationMethod: args.identificationMethod ?? (args.studentId ? "MANUAL" : undefined),
    subtotal,
    discount: totalDiscount,
    serviceTotal: 0,
    total,
    paidAmount,
    changeAmount: changeDue,
    cashTendered,
    costTotal: 0,
    status: "COMPLETED",
    receiptNote: args.note,
    durationMs: undefined,
    idempotencyKey: args.idempotencyKey,
    createdAt: now,
  });

  // 7. Sale items + outflow stock + COGS
  let cogsTotal = 0;
  for (const line of lines) {
    const lineCogs = line.product.trackInventory
      ? roundToSen(line.quantity * line.averageCost)
      : 0;
    cogsTotal = roundToSen(cogsTotal + lineCogs);

    await ctx.db.insert("saleItems", {
      saleId,
      productId: line.product._id,
      name: line.product.name,
      quantity: line.quantity,
      unit: line.product.unit,
      sellingPrice: line.sellingPrice,
      discount: line.discount,
      costPrice: line.averageCost,
      subtotal: line.subtotal,
      cogs: lineCogs,
      createdAt: now,
    });

    if (line.product.trackInventory) {
      await changeStock(ctx, {
        productId: line.product._id,
        quantity: line.quantity,
        type: "SALE",
        referenceType: "sale",
        referenceId: code,
        note: `Penjualan ${code}`,
        user,
      });
    }
  }

  await ctx.db.patch(saleId, { costTotal: cogsTotal, durationMs: 0 });

  // 8. Pembayaran wallet → debit via ledger (TIDAK Ubah saldo langsung)
  if (walletAmount > 0 && args.studentId) {
    const walletResult = await mutateWallet(ctx, user, {
      studentId: args.studentId,
      type: "PURCHASE",
      amount: walletAmount,
      note: `Pembelian ${code}`,
      referenceType: "sale",
      referenceId: code,
      idempotencyKey: `${args.idempotencyKey}-wallet`,
      // Bypass limit top up; limit debit tetap berlaku untuk keamanan.
      skipLimits: false,
    });
    await ctx.db.insert("payments", {
      saleId,
      method: "WALLET",
      amount: walletAmount,
      reference: walletResult.transactionId,
      walletLedgerId: walletResult.ledgerId,
      status: "SUCCESS",
      createdAt: now,
    });
  }

  if (cashAmount > 0) {
    await ctx.db.insert("payments", {
      saleId,
      method: "CASH",
      amount: cashAmount,
      status: "SUCCESS",
      createdAt: now,
    });
    await ctx.db.insert("cashTransactions", {
      shiftId: shift._id,
      type: "SALE",
      direction: "IN",
      amount: cashAmount,
      referenceType: "sale",
      referenceId: code,
      createdBy: user.id,
      createdAt: now,
    });
    await ctx.db.patch(shift._id, {
      cashSales: shift.cashSales + cashAmount,
      updatedAt: now,
    });
  }

  // 9. Jurnal otomatis
  if (walletAmount > 0) {
    await postJournal(ctx, {
      entryDate: now,
      description: `Penjualan ${code} (wallet)`,
      source: "SALE",
      referenceType: "sale",
      referenceId: code,
      lines: accounting.walletPurchaseJournal(walletAmount),
      user,
    });
  }
  if (cashAmount > 0) {
    await postJournal(ctx, {
      entryDate: now,
      description: `Penjualan ${code} (tunai)`,
      source: "SALE",
      referenceType: "sale",
      referenceId: code,
      lines: accounting.cashSaleJournal(cashAmount),
      user,
    });
  }
  if (cogsTotal > 0) {
    await postJournal(ctx, {
      entryDate: now,
      description: `HPP penjualan ${code}`,
      source: "SALE",
      referenceType: "sale",
      referenceId: code,
      lines: accounting.cogsJournal(cogsTotal),
      user,
    });
  }

  await writeAudit(ctx, {
    user,
    action: "CREATE_SALE",
    entityType: "sale",
    entityId: saleId,
    newValue: { code, total, paymentMethod, student: student?.name, cogs: cogsTotal },
  });

  let balanceAfter: number | null = null;
  if (args.studentId) {
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_student", (q: any) => q.eq("studentId", args.studentId))
      .unique();
    balanceAfter = wallet?.currentBalance ?? null;
  }

  return {
    saleId,
    code,
    total,
    subtotal,
    discount: totalDiscount,
    paidAmount,
    changeAmount: changeDue,
    cashTendered,
    paymentMethod,
    balanceAfter,
    cogs: cogsTotal,
    studentName: student?.name,
  };
}

/** REFUND — tidak menghapus transaksi lama (blueprint §20). */
export const refund = mutation({
  args: {
    saleId: v.id("sales"),
    amount: v.optional(v.number()),
    reason: v.string(),
    restoreStock: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SALE_REFUND);
    const reason = requireString(args.reason, "Alasan retur", 300);

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new NotFoundError("Transaksi tidak ditemukan");
    if (sale.status === "VOID") throw new BusinessRuleError("Transaksi sudah dibatalkan");

    const existingRefunds = await ctx.db
      .query("refunds")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .collect();
    const alreadyRefunded = roundToSen(existingRefunds.reduce((s, r) => s + r.amount, 0));
    const refundable = roundToSen(sale.total - alreadyRefunded);
    if (refundable <= 0) {
      throw new BusinessRuleError("Transaksi ini sudah diretur sepenuhnya");
    }
    const amount = args.amount === undefined ? refundable : Math.min(args.amount, refundable);
    if (amount <= 0) throw new BusinessRuleError("Nominal retur tidak valid");

    const now = Date.now();
    const code = await nextTransactionCode(ctx, "refunds", "RFN", now);
    // Retur selalu ke metode asal.
    const method: "CASH" | "WALLET" = sale.paymentMethod === "WALLET" ? "WALLET" : "CASH";

    // Kembalikan barang ke persediaan (jika diminta & ada produk).
    let restoredValue = 0;
    if (args.restoreStock !== false) {
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
        .collect();
      for (const item of items) {
        if (!item.productId || item.serviceType) continue;
        const refundQty = roundToSen(Math.min(item.quantity, item.cogs / (item.costPrice || 1)));
        if (refundQty <= 0) continue;
        const change = await changeStock(ctx, {
          productId: item.productId,
          quantity: Math.min(refundQty, item.quantity),
          unitCost: item.costPrice,
          type: "RETURN",
          referenceType: "refund",
          referenceId: code,
          note: `Retur ${code}`,
          user,
        });
        restoredValue = roundToSen(restoredValue + change.cogs);
      }
    }

    // Kembalikan dana ke wallet bila metode asal wallet.
    if (method === "WALLET" && sale.studentId) {
      await mutateWallet(ctx, user, {
        studentId: sale.studentId,
        type: "REFUND",
        amount,
        note: `Retur ${code} — ${reason}`,
        referenceType: "refund",
        referenceId: code,
        idempotencyKey: `${code}-refund`,
      });
    } else {
      const shift = await currentShiftOf(ctx, user.id);
      if (shift) {
        await ctx.db.insert("cashTransactions", {
          shiftId: shift._id,
          type: "EXPENSE",
          direction: "OUT",
          amount,
          referenceType: "refund",
          referenceId: code,
          note: `Retur ${code}`,
          createdBy: user.id,
          createdAt: now,
        });
        await ctx.db.patch(shift._id, {
          cashExpenses: shift.cashExpenses + amount,
          updatedAt: now,
        });
      }
    }

    const refundId = await ctx.db.insert("refunds", {
      code,
      saleId: args.saleId,
      amount,
      method,
      reason,
      processedBy: user.id,
      processedByName: user.name,
      createdAt: now,
    });

    // Jurnal retur
    await postJournal(ctx, {
      entryDate: now,
      description: `Retur ${code}`,
      source: "REFUND",
      referenceType: "refund",
      referenceId: code,
      lines:
        method === "WALLET"
          ? accounting.walletRefundJournal(amount)
          : accounting.cashRefundJournal(amount),
      user,
    });
    if (restoredValue > 0) {
      await postJournal(ctx, {
        entryDate: now,
        description: `Retur barang ${code}`,
        source: "REFUND",
        referenceType: "refund",
        referenceId: code,
        lines: accounting.returnInventoryJournal(restoredValue),
        user,
      });
    }

    const totalRefunded = roundToPen(alreadyRefunded + amount);
    if (totalRefunded >= sale.total) {
      await ctx.db.patch(args.saleId, { status: "REFUNDED" });
    }

    await writeAudit(ctx, {
      user,
      action: "REFUND",
      entityType: "sale",
      entityId: args.saleId,
      oldValue: { status: sale.status, refunded: alreadyRefunded },
      newValue: { amount, method, reason, refunded: totalRefunded },
    });

    return { refundId, code, amount, method, restoredValue };
  },
});

export const voidSale = mutation({
  args: { saleId: v.id("sales"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SALE_VOID);
    const reason = requireString(args.reason, "Alasan pembatalan", 300);
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new NotFoundError("Transaksi tidak ditemukan");
    if (sale.status !== "COMPLETED") {
      throw new BusinessRuleError("Hanya transaksi COMPLETED yang dapat dibatalkan");
    }
    const refunds = await ctx.db
      .query("refunds")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .collect();
    if (refunds.length > 0) {
      throw new BusinessRuleError("Transaksi yang sudah diretur tidak dapat dibatalkan. Gunakan retur.");
    }

    await ctx.db.patch(args.saleId, {
      status: "VOID",
      receiptNote: `VOID: ${reason}`,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      user,
      action: "VOID_SALE",
      entityType: "sale",
      entityId: args.saleId,
      oldValue: { status: sale.status },
      newValue: { status: "VOID", reason },
    });
    return { ok: true };
  },
});
