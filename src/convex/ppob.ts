import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import {
  assertPermission,
  BusinessRuleError,
  NotFoundError,
  requireUser,
  writeAudit,
} from "./lib/guards";
import { beginIdempotent, completeIdempotent, failIdempotent } from "./lib/helpers";
import { mutateWallet, postJournal } from "./lib/walletEngine";
import { getPpobProvider, getPaymentProvider, type PpobProduct } from "./providers";
import { internal } from "./_generated/api";
import { PERMISSIONS } from "../lib/rbac";
import { formatDateCode } from "../lib/codes";
import * as accounting from "../lib/accounting";
import { assertRupiah, roundToSen } from "../lib/money";

export const listProducts = query({
  args: { category: v.optional(v.string()), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    let rows = await ctx.db.query("ppobProducts").collect();
    if (!args.includeInactive) rows = rows.filter((r) => r.isActive);
    if (args.category) rows = rows.filter((r) => r.category === args.category);
    return rows.sort((a, b) => a.category.localeCompare(b.category) || a.price - b.price);
  },
});

export const listTransactions = query({
  args: {
    status: v.optional(v.string()),
    studentId: v.optional(v.id("students")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_PPOB);
    let rows = await ctx.db.query("ppobTransactions").collect();
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    if (args.studentId) rows = rows.filter((r) => r.customerStudentId === args.studentId);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return {
      total: rows.length,
      revenue: roundToSen(rows.filter((r) => r.status === "SUCCESS").reduce((s, r) => s + r.margin, 0)),
      items: rows.slice(0, Math.min(args.limit ?? 50, 200)),
    };
  },
});

/** Sinkronkan katalog produk dari provider (sandbox / production). */
export const syncProducts = action({
  args: {},
  handler: async (ctx) => {
    const provider = getPpobProvider();
    const products: PpobProduct[] = await provider.listProducts();
    const now = Date.now();
    for (const p of products) {
      const existing = await ctx.runQuery(internal.ppob.findProductByCode, { code: p.code });
      if (existing) {
        await ctx.runMutation(internal.ppob.upsertProduct, {
          id: existing._id,
          name: p.name,
          category: p.category,
          price: p.price,
          costPrice: p.costPrice,
        });
      } else {
        await ctx.runMutation(internal.ppob.upsertProduct, {
          name: p.name,
          code: p.code,
          category: p.category,
          price: p.price,
          costPrice: p.costPrice,
          createdAt: now,
        });
      }
    }
    return { synced: products.length, provider: provider.name, environment: provider.environment };
  },
});

export const findProductByCode = internalQuery({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("ppobProducts")
      .filter((q) => q.eq(q.field("code"), args.code))
      .first();
  },
});

export const upsertProduct = internalMutation({
  args: {
    id: v.optional(v.id("ppobProducts")),
    code: v.optional(v.string()),
    name: v.string(),
    category: v.union(
      v.literal("PULSA"),
      v.literal("PLN"),
      v.literal("DATA"),
      v.literal("GAME"),
      v.literal("E_WALLET"),
      v.literal("OTHER"),
    ),
    price: v.number(),
    costPrice: v.number(),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.id) {
      await ctx.db.patch(args.id, {
        name: args.name,
        category: args.category,
        price: args.price,
        costPrice: args.costPrice,
        updatedAt: now,
      });
      return { id: args.id };
    }
    const id = await ctx.db.insert("ppobProducts", {
      code: args.code!,
      name: args.name,
      category: args.category,
      price: args.price,
      costPrice: args.costPrice,
      isActive: true,
      createdAt: args.createdAt ?? now,
    });
    return { id };
  },
});

/**
 * Buat transaksi PPOB.
 *
 * Alur: validasi → (opsional) debit wallet → charge ke provider → jurnal.
 * Idempotency key mencegah double charge ke provider.
 */
export const createTransaction = mutation({
  args: {
    productId: v.id("ppobProducts"),
    customerIdentifier: v.string(),
    customerName: v.optional(v.string()),
    studentId: v.optional(v.id("students")),
    paymentMethod: v.union(v.literal("WALLET"), v.literal("CASH")),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_PPOB);

    const product = await ctx.db.get(args.productId);
    if (!product) throw new NotFoundError("Produk PPOB tidak ditemukan");
    if (!product.isActive) throw new BusinessRuleError("Produk PPOB tidak aktif");
    assertRupiah(product.price, "Harga PPOB");

    const hit = await beginIdempotent(
      ctx,
      "ppob.create",
      args.idempotencyKey,
      `${args.productId}:${args.customerIdentifier}`,
      user.id,
    );
    if (hit.status === "REPLAY") return { ...(hit.result as any), replayed: true };

    const now = Date.now();
    const count = await ctx.db.query("ppobTransactions").collect();
    const code = `PPB-${formatDateCode(now)}-${String(count.length + 1).padStart(4, "0")}`;

    try {
      // 1. Insert PENDING dulu agar status terlacak walau provider lambat.
      const txId = await ctx.db.insert("ppobTransactions", {
        code,
        productId: args.productId,
        productName: product.name,
        category: product.category,
        customerStudentId: args.studentId,
        customerName: args.customerName ?? product.name,
        customerIdentifier: args.customerIdentifier,
        price: product.price,
        costPrice: product.costPrice,
        margin: roundToSen(product.price - product.costPrice),
        provider: getPpobProvider().name,
        status: "PENDING",
        idempotencyKey: args.idempotencyKey,
        createdAt: now,
        updatedAt: now,
      });

      // 2. Debit wallet bila diperlukan (happens sebelum charge).
      if (args.paymentMethod === "WALLET") {
        if (!args.studentId) {
          throw new BusinessRuleError("Santri wajib diisi untuk pembayaran wallet");
        }
        await mutateWallet(ctx, user, {
          studentId: args.studentId,
          type: "PPOB",
          amount: product.price,
          note: `PPOB ${code}`,
          referenceType: "ppobTransaction",
          referenceId: code,
          idempotencyKey: `${args.idempotencyKey}-wallet`,
        });
      }

      // 3. Charge ke provider.
      const provider = getPpobProvider();
      const response = await provider.charge({
        code: code,
        customerIdentifier: args.customerIdentifier,
        product: {
          code: product.code,
          name: product.name,
          category: product.category as PpobProduct["category"],
          price: product.price,
          costPrice: product.costPrice,
        },
        referenceId: code,
      });

      if (response.status === "FAILED") {
        // Kembalikan dana bila sudah ter-debit.
        if (args.paymentMethod === "WALLET" && args.studentId) {
          await mutateWallet(ctx, user, {
            studentId: args.studentId,
            type: "REFUND",
            amount: product.price,
            note: `PPOB gagal ${code}`,
            referenceType: "ppobTransaction",
            referenceId: code,
            idempotencyKey: `${args.idempotencyKey}-refund`,
          });
        }
        await ctx.db.patch(txId, {
          status: "FAILED",
          message: response.message,
          providerReference: response.providerReference,
          updatedAt: Date.now(),
        });
        await failIdempotent(ctx, "ppob.create", args.idempotencyKey);
        throw new BusinessRuleError(`PPOB gagal: ${response.message}`);
      }

      // 4. Jurnal pendapatan PPOB + HPP ke provider.
      const saleId = await ctx.db.insert("sales", {
        code: `SALE-${code}`,
        invoiceNumber: `SALE-${code}`,
        studentId: args.studentId,
        studentName: args.customerName,
        cashierId: user.id,
        cashierName: user.name,
        channel: "SERVICE",
        paymentMethod: args.paymentMethod,
        subtotal: product.price,
        discount: 0,
        serviceTotal: product.price,
        total: product.price,
        paidAmount: product.price,
        changeAmount: 0,
        costTotal: product.costPrice,
        status: "COMPLETED",
        idempotencyKey: args.idempotencyKey,
        createdAt: now,
      });

      await ctx.db.insert("saleItems", {
        saleId,
        name: `PPOB — ${product.name}`,
        quantity: 1,
        unit: "trx",
        sellingPrice: product.price,
        discount: 0,
        costPrice: product.costPrice,
        subtotal: product.price,
        cogs: product.costPrice,
        serviceType: "PPOB",
        serviceRefId: code,
        createdAt: now,
      });

      await ctx.db.insert("payments", {
        saleId,
        method: args.paymentMethod,
        amount: product.price,
        reference: response.providerReference,
        status: "SUCCESS",
        createdAt: now,
      });

      if (args.paymentMethod === "CASH") {
        await ctx.db.insert("cashTransactions", {
          type: "SALE",
          direction: "IN",
          amount: product.price,
          referenceType: "ppob",
          referenceId: code,
          createdBy: user.id,
          createdAt: now,
        });
      }

      await postJournal(ctx, {
        entryDate: now,
        description: `Pendapatan PPOB ${code}`,
        source: "PPOB",
        referenceType: "ppobTransaction",
        referenceId: code,
        lines:
          args.paymentMethod === "WALLET"
            ? accounting.serviceWalletJournal(accounting.COA.PPOB_REVENUE, product.price)
            : accounting.serviceCashJournal(accounting.COA.PPOB_REVENUE, product.price),
        user,
      });
      await postJournal(ctx, {
        entryDate: now,
        description: `HPP PPOB ${code}`,
        source: "PPOB",
        referenceType: "ppobTransaction",
        referenceId: code,
        lines: accounting.ppobCogsJournal(product.costPrice),
        user,
      });

      await ctx.db.patch(txId, {
        status: "SUCCESS",
        message: response.message,
        providerReference: response.providerReference,
        saleId,
        updatedAt: Date.now(),
      });

      const result = {
        transactionId: txId,
        code,
        status: "SUCCESS" as const,
        price: product.price,
        serialNumber: response.serialNumber,
        provider: provider.name,
        environment: provider.environment,
      };
      await completeIdempotent(ctx, "ppob.create", args.idempotencyKey, result);

      await writeAudit(ctx, {
        user,
        action: "PPOB_TRANSACTION",
        entityType: "ppobTransaction",
        entityId: txId,
        newValue: { code, product: product.name, price: product.price, status: "SUCCESS" },
      });

      return { ...result, replayed: false };
    } catch (error) {
      await failIdempotent(ctx, "ppob.create", args.idempotencyKey);
      throw error;
    }
  },
});

/** Retry transaksi gagal (memakai idempotency key baru). */
export const retryTransaction = mutation({
  args: { transactionId: v.id("ppobTransactions") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_PPOB);
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new NotFoundError("Transaksi tidak ditemukan");
    if (tx.status !== "FAILED") {
      throw new BusinessRuleError("Hanya transaksi FAILED yang dapat dicoba ulang");
    }
    const provider = getPpobProvider();
    const response = await provider.checkStatus(tx.providerReference ?? tx.code);
    await ctx.db.patch(args.transactionId, {
      status: response.status,
      message: response.message,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      user,
      action: "PPOB_RETRY",
      entityType: "ppobTransaction",
      entityId: args.transactionId,
      newValue: { status: response.status },
    });
    return { status: response.status, message: response.message };
  },
});

/** Informasi provider aktif (menandai dengan jelas mode sandbox). */
export const providerInfo = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const ppob = getPpobProvider();
    const payment = getPaymentProvider();
    return {
      ppob: {
        name: ppob.name,
        environment: ppob.environment,
        isSandbox: ppob.environment === "SANDBOX",
      },
      payment: {
        name: payment.name,
        environment: payment.environment,
        isSandbox: payment.environment === "SANDBOX",
      },
    };
  },
});
