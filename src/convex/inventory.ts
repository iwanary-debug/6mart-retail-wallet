import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertPermission,
  BusinessRuleError,
  NotFoundError,
  notify,
  requireUser,
  writeAudit,
} from "./lib/guards";
import {
  getSettings,
  nextTransactionCode,
  requireString,
  startOfDay,
  startOfMonth,
} from "./lib/helpers";
import { changeStock } from "./lib/inventoryEngine";
import { postJournal } from "./lib/walletEngine";
import { PERMISSIONS } from "../lib/rbac";
import * as accounting from "../lib/accounting";
import { assertRupiah, roundToSen } from "../lib/money";
import { inventoryValue } from "../lib/costing";

// ---------------------------------------------------------------- QUERIES ----

export const listMovements = query({
  args: {
    productId: v.optional(v.id("products")),
    type: v.optional(v.string()),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.INVENTORY_VIEW);

    let rows = await ctx.db.query("inventoryMovements").collect();
    if (args.productId) rows = rows.filter((r) => r.productId === args.productId);
    if (args.type) rows = rows.filter((r) => r.type === args.type);
    if (args.referenceType) rows = rows.filter((r) => r.referenceType === args.referenceType);
    if (args.referenceId) rows = rows.filter((r) => r.referenceId === args.referenceId);
    if (args.from !== undefined) rows = rows.filter((r) => r.createdAt >= args.from!);
    if (args.to !== undefined) rows = rows.filter((r) => r.createdAt <= args.to!);
    rows.sort((a, b) => b.createdAt - a.createdAt);

    const limit = Math.min(args.limit ?? 100, 500);
    const page = rows.slice(0, limit);
    const enriched = await Promise.all(
      page.map(async (m) => {
        const product = await ctx.db.get(m.productId);
        return {
          ...m,
          productName: product?.name ?? "-",
          sku: product?.sku ?? "-",
          unit: product?.unit ?? "-",
          valueChange: roundToSen(
            (m.stockAfter - m.stockBefore) * m.unitCostAfter,
          ),
        };
      }),
    );
    return { total: rows.length, items: enriched };
  },
});

export const stockOverview = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.INVENTORY_VIEW);
    const products = await ctx.db.query("products").collect();
    const settings = await getSettings(ctx);
    const active = products.filter((p) => p.isActive);

    const totalValue = roundToSen(
      active.reduce((s, p) => s + inventoryValue({ quantity: p.stock, averageCost: p.averageCost }), 0),
    );
    const totalRetailValue = roundToSen(
      active.reduce((s, p) => s + p.stock * p.sellingPrice, 0),
    );
    const lowStock = active.filter(
      (p) => p.trackInventory && p.stock <= Math.max(p.minStock, settings.lowStockThreshold),
    );
    const outOfStock = active.filter((p) => p.trackInventory && p.stock <= 0);

    return {
      totalProducts: active.length,
      totalSkus: active.filter((p) => p.trackInventory).length,
      totalValue,
      totalRetailValue,
      potentialProfit: roundToSen(totalRetailValue - totalValue),
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      lowStock: lowStock
        .map((p) => ({
          id: p._id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          stock: p.stock,
          minStock: p.minStock,
        }))
        .sort((a, b) => a.stock - b.stock)
        .slice(0, 20),
    };
  },
});

export const listPurchases = query({
  args: { status: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.INVENTORY_VIEW);
    let rows = await ctx.db.query("purchases").collect();
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    const limit = Math.min(args.limit ?? 50, 200);
    const page = rows.slice(0, limit);
    const enriched = await Promise.all(
      page.map(async (p) => {
        const supplier = p.supplierId ? await ctx.db.get(p.supplierId) : null;
        const items = await ctx.db
          .query("purchaseItems")
          .withIndex("by_purchase", (q) => q.eq("purchaseId", p._id))
          .collect();
        return { ...p, supplierName: supplier?.name ?? "-", itemCount: items.length };
      }),
    );
    return { total: rows.length, items: enriched };
  },
});

export const getPurchase = query({
  args: { id: v.id("purchases") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const purchase = await ctx.db.get(args.id);
    if (!purchase) throw new NotFoundError("Pembelian tidak ditemukan");
    const items = await ctx.db
      .query("purchaseItems")
      .withIndex("by_purchase", (q) => q.eq("purchaseId", args.id))
      .collect();
    const supplier = purchase.supplierId ? await ctx.db.get(purchase.supplierId) : null;
    const enriched = await Promise.all(
      items.map(async (i) => {
        const product = await ctx.db.get(i.productId);
        return { ...i, productName: product?.name ?? "-", sku: product?.sku ?? "-", unit: product?.unit ?? "-" };
      }),
    );
    return { purchase, supplier, items: enriched };
  },
});

// -------------------------------------------------------------- MUTATIONS ----

/** Catat pembelian + terima barang (stok masuk, average cost, jurnal). */
export const createPurchase = mutation({
  args: {
    supplierId: v.optional(v.id("suppliers")),
    invoiceNumber: v.optional(v.string()),
    paymentMethod: v.union(v.literal("CASH"), v.literal("TRANSFER"), v.literal("CREDIT")),
    note: v.optional(v.string()),
    items: v.array(
      v.object({
        productId: v.id("products"),
        quantity: v.number(),
        unitCost: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PURCHASE_MANAGE);

    if (args.items.length === 0) {
      throw new BusinessRuleError("Pembelian harus memiliki minimal satu item");
    }

    const now = Date.now();
    const code = await nextTransactionCode(ctx, "purchases", "PO", now);

    // Validasi & kuantitas total
    let totalAmount = 0;
    for (const item of args.items) {
      if (item.quantity <= 0) {
        throw new BusinessRuleError("Quantity pembelian harus lebih dari 0");
      }
      assertRupiah(item.unitCost, "Harga satuan beli");
      totalAmount = roundToSen(totalAmount + item.quantity * item.unitCost);
    }

    const purchaseId = await ctx.db.insert("purchases", {
      code,
      invoiceNumber: args.invoiceNumber,
      supplierId: args.supplierId,
      totalAmount,
      paidAmount: args.paymentMethod === "CREDIT" ? 0 : totalAmount,
      paymentMethod: args.paymentMethod,
      status: "RECEIVED",
      receivedBy: user.id,
      receivedAt: now,
      note: args.note,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of args.items) {
      await ctx.db.insert("purchaseItems", {
        purchaseId,
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        subtotal: roundToSen(item.quantity * item.unitCost),
        createdAt: now,
      });

      await changeStock(ctx, {
        productId: item.productId,
        quantity: item.quantity,
        unitCost: item.unitCost,
        type: "PURCHASE",
        referenceType: "purchase",
        referenceId: code,
        note: `Pembelian ${code}`,
        user,
      });
    }

    // Jurnal: pembelian menambah persediaan, TIDAK menambah pendapatan.
    if (args.paymentMethod === "CREDIT") {
      await postJournal(ctx, {
        entryDate: now,
        description: `Pembelian ${code}`,
        source: "PURCHASE",
        referenceType: "purchase",
        referenceId: code,
        lines: accounting.purchaseCreditJournal(totalAmount),
        user,
      });
    } else {
      await postJournal(ctx, {
        entryDate: now,
        description: `Pembelian ${code}`,
        source: "PURCHASE",
        referenceType: "purchase",
        referenceId: code,
        lines: accounting.purchasePaidJournal(
          totalAmount,
          args.paymentMethod === "CASH" ? "CASH" : "BANK",
        ),
        user,
      });
    }

    // Notifikasi stok menipis
    const settings = await getSettings(ctx);
    for (const item of args.items) {
      const product = await ctx.db.get(item.productId);
      if (
        product &&
        product.trackInventory &&
        product.stock <= Math.max(product.minStock, settings.lowStockThreshold)
      ) {
        await notify(ctx, {
          recipientType: "SYSTEM",
          title: "Stok Menipis",
          message: `${product.name} tersisa ${product.stock} ${product.unit}.`,
          severity: "WARNING",
        });
      }
    }

    await writeAudit(ctx, {
      user,
      action: "CREATE_PURCHASE",
      entityType: "purchase",
      entityId: purchaseId,
      newValue: { code, totalAmount, itemCount: args.items.length },
    });

    return { purchaseId, code, totalAmount };
  },
});

/** Penyesuaian stok manual (rusak, hilang,-found, koreksi opname). */
export const adjustStock = mutation({
  args: {
    productId: v.id("products"),
    type: v.union(
      v.literal("ADJUSTMENT_IN"),
      v.literal("ADJUSTMENT_OUT"),
      v.literal("DAMAGE"),
      v.literal("LOSS"),
    ),
    quantity: v.number(),
    unitCost: v.optional(v.number()),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.INVENTORY_ADJUST);
    const reason = requireString(args.reason, "Alasan", 300);
    if (args.quantity <= 0) {
      throw new BusinessRuleError("Quantity harus lebih dari 0");
    }

    const product = await ctx.db.get(args.productId);
    if (!product) throw new NotFoundError("Produk tidak ditemukan");

    const isLossLike = args.type === "DAMAGE" || args.type === "LOSS";
    const result = await changeStock(ctx, {
      productId: args.productId,
      quantity: args.quantity,
      unitCost: args.type === "ADJUSTMENT_IN" ? (args.unitCost ?? product.purchasePrice) : undefined,
      type: args.type,
      referenceType: "stockAdjustment",
      referenceId: `ADJ-${Date.now()}`,
      note: reason,
      user,
    });

    // Rugi (barang rusak/hilang) membebani beban operasional.
    if (isLossLike) {
      await postJournal(ctx, {
        entryDate: Date.now(),
        description: `${args.type === "DAMAGE" ? "Barang rusak" : "Barang hilang"} — ${product.name}`,
        source: "MANUAL",
        referenceType: "stockAdjustment",
        referenceId: result.movementId,
        lines: accounting.buildJournalLines([
          {
            accountCode: accounting.COA.OTHER_EXPENSE,
            debit: result.cogs,
            memo: `${reason} (${product.name})`,
          },
          {
            accountCode: accounting.COA.INVENTORY,
            credit: result.cogs,
            memo: "Pengurangan persediaan",
          },
        ]),
        user,
      });
    }

    await writeAudit(ctx, {
      user,
      action: "ADJUST_STOCK",
      entityType: "product",
      entityId: args.productId,
      oldValue: { stock: result.stockBefore, averageCost: result.averageCostBefore },
      newValue: { stock: result.stockAfter, averageCost: result.averageCostAfter, reason },
    });

    return result;
  },
});

export const stockValuation = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.INVENTORY_VIEW);
    const products = await ctx.db.query("products").collect();
    const monthStart = startOfMonth(Date.now());
    const dayStart = startOfDay(Date.now());

    const movements = await ctx.db.query("inventoryMovements").collect();
    const salesThisMonth = movements.filter(
      (m) => m.type === "SALE" && m.createdAt >= monthStart,
    );
    const cogsThisMonth = roundToSen(
      salesThisMonth.reduce((s, m) => s + Math.abs(m.stockBefore - m.stockAfter) * m.unitCostBefore, 0),
    );
    const salesToday = movements.filter((m) => m.type === "SALE" && m.createdAt >= dayStart);

    return {
      inventoryValue: roundToSen(
        products
          .filter((p) => p.isActive)
          .reduce((s, p) => s + inventoryValue({ quantity: p.stock, averageCost: p.averageCost }), 0),
      ),
      cogsThisMonth,
      salesThisMonth: salesThisMonth.length,
      salesToday: salesToday.length,
      byProduct: products
        .filter((p) => p.isActive && p.trackInventory)
        .map((p) => ({
          id: p._id,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          stock: p.stock,
          averageCost: p.averageCost,
          sellingPrice: p.sellingPrice,
          value: inventoryValue({ quantity: p.stock, averageCost: p.averageCost }),
        }))
        .sort((a, b) => b.value - a.value),
    };
  },
});
