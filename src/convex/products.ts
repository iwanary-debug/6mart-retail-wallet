import { v } from "convex/values";
import { mutation, query } from "./_generated/server";import {
  assertPermission,
  BusinessRuleError,
  NotFoundError,
  requireUser,
  writeAudit,
} from "./lib/guards";
import { getSettings, requireString } from "./lib/helpers";
import { PERMISSIONS } from "../lib/rbac";
import { assertRupiah, roundToSen } from "../lib/money";
// -------------------------------------------------------------- KATEGORI ----

export const listCategories = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const rows = await ctx.db.query("categories").collect();
    const products = await ctx.db.query("products").collect();
    const counts = new Map<string, number>();
    for (const p of products) {
      if (!p.categoryId) continue;
      counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    }
    return rows
      .map((c) => ({ ...c, productCount: counts.get(c._id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createCategory = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PRODUCT_MANAGE);
    const name = requireString(args.name, "Nama kategori", 80);
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing) throw new BusinessRuleError("Kategori sudah ada");
    const now = Date.now();
    const id = await ctx.db.insert("categories", {
      name,
      description: args.description,
      isActive: true,
      createdAt: now,
    });
    await writeAudit(ctx, {
      user,
      action: "CREATE_CATEGORY",
      entityType: "category",
      entityId: id,
      newValue: { name },
    });
    return { id };
  },
});

export const updateCategory = mutation({
  args: {
    id: v.id("categories"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PRODUCT_MANAGE);
    const category = await ctx.db.get(args.id);
    if (!category) throw new NotFoundError("Kategori tidak ditemukan");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = requireString(args.name, "Nama kategori", 80);
    if (args.description !== undefined) patch.description = args.description;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    await ctx.db.patch(args.id, patch);
    await writeAudit(ctx, {
      user,
      action: "UPDATE_CATEGORY",
      entityType: "category",
      entityId: args.id,
      oldValue: { name: category.name, isActive: category.isActive },
      newValue: patch,
    });
    return { ok: true };
  },
});

// --------------------------------------------------------------- SUPPLIER ----

export const listSuppliers = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    let rows = await ctx.db.query("suppliers").collect();
    if (args.search) {
      const s = args.search.toLowerCase();
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(s) || r.code.toLowerCase().includes(s),
      );
    }
    const purchases = await ctx.db.query("purchases").collect();
    const stats = new Map<string, { count: number; total: number }>();
    for (const p of purchases) {
      if (!p.supplierId) continue;
      const cur = stats.get(p.supplierId) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += p.totalAmount;
      stats.set(p.supplierId, cur);
    }
    return rows
      .map((r) => ({
        ...r,
        purchaseCount: stats.get(r._id)?.count ?? 0,
        purchaseTotal: stats.get(r._id)?.total ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createSupplier = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SUPPLIER_MANAGE);
    const name = requireString(args.name, "Nama supplier", 120);
    const now = Date.now();
    const count = await ctx.db.query("suppliers").collect();
    const code = `SUP-${String(count.length + 1).padStart(4, "0")}`;
    const id = await ctx.db.insert("suppliers", {
      code,
      name,
      phone: args.phone,
      address: args.address,
      contactPerson: args.contactPerson,
      status: "ACTIVE",
      createdAt: now,
    });
    await writeAudit(ctx, {
      user,
      action: "CREATE_SUPPLIER",
      entityType: "supplier",
      entityId: id,
      newValue: { code, name },
    });
    return { id, code };
  },
});

export const updateSupplier = mutation({
  args: {
    id: v.id("suppliers"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
    status: v.optional(v.union(v.literal("ACTIVE"), v.literal("INACTIVE"))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SUPPLIER_MANAGE);
    const supplier = await ctx.db.get(args.id);
    if (!supplier) throw new NotFoundError("Supplier tidak ditemukan");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = requireString(args.name, "Nama", 120);
    if (args.phone !== undefined) patch.phone = args.phone;
    if (args.address !== undefined) patch.address = args.address;
    if (args.contactPerson !== undefined) patch.contactPerson = args.contactPerson;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.id, patch);
    await writeAudit(ctx, {
      user,
      action: "UPDATE_SUPPLIER",
      entityType: "supplier",
      entityId: args.id,
      oldValue: { name: supplier.name, status: supplier.status },
      newValue: patch,
    });
    return { ok: true };
  },
});

// ---------------------------------------------------------------- PRODUK ----

export const listProducts = query({
  args: {
    search: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    lowStockOnly: v.optional(v.boolean()),
    includeInactive: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const settings = await getSettings(ctx);
    let rows = await ctx.db.query("products").collect();
    if (!args.includeInactive) rows = rows.filter((r) => r.isActive);
    if (args.categoryId) rows = rows.filter((r) => r.categoryId === args.categoryId);
    if (args.search) {
      const s = args.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          r.sku.toLowerCase().includes(s) ||
          (r.barcode ?? "").includes(s),
      );
    }
    if (args.lowStockOnly) {
      rows = rows.filter((r) => r.stock <= Math.max(r.minStock, settings.lowStockThreshold));
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const limit = Math.min(args.limit ?? 200, 500);
    return { total: rows.length, items: rows.slice(0, limit) };
  },
});

/** Pencarian cepat untuk POS: barcode persis, lalu nama/SKU. */
export const searchForPos = query({
  args: { term: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SALE_CREATE);
    const term = args.term.trim();
    if (!term) return [];
    const rows = await ctx.db.query("products").collect();
    const active = rows.filter((r) => r.isActive);

    const byBarcode = active.find((r) => r.barcode === term);
    if (byBarcode) return [byBarcode];

    const s = term.toLowerCase();
    const scored = active
      .map((r) => {
        const name = r.name.toLowerCase();
        const sku = r.sku.toLowerCase();
        let score = 99;
        if (name.startsWith(s)) score = 0;
        else if (sku.startsWith(s)) score = 1;
        else if (name.includes(s)) score = 2;
        else if (sku.includes(s)) score = 3;
        else if ((r.barcode ?? "").includes(term)) score = 4;
        return { r, score };
      })
      .filter((x) => x.score < 99)
      .sort((a, b) => a.score - b.score || a.r.name.localeCompare(b.r.name))
      .map((x) => x.r);

    return scored.slice(0, args.limit ?? 20);
  },
});

export const getProduct = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const product = await ctx.db.get(args.id);
    if (!product) throw new NotFoundError("Produk tidak ditemukan");
    const movements = await ctx.db
      .query("inventoryMovements")
      .withIndex("by_product", (q) => q.eq("productId", args.id))
      .order("desc")
      .take(20);
    return {
      product,
      inventoryValue: roundToSen(product.stock * product.averageCost),
      movements,
    };
  },
});

export const createProduct = mutation({
  args: {
    sku: v.string(),
    name: v.string(),
    barcode: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    supplierId: v.optional(v.id("suppliers")),
    unit: v.string(),
    purchasePrice: v.number(),
    sellingPrice: v.number(),
    minStock: v.optional(v.number()),
    trackInventory: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PRODUCT_MANAGE);

    const sku = requireString(args.sku, "SKU", 40).toUpperCase();
    const name = requireString(args.name, "Nama produk", 150);
    assertRupiah(args.purchasePrice, "Harga beli");
    assertRupiah(args.sellingPrice, "Harga jual");
    if (args.sellingPrice < args.purchasePrice) {
      // Diizinkan (barang promos) tetapi dicatat di audit.
    }

    const dupSku = await ctx.db
      .query("products")
      .withIndex("by_sku", (q) => q.eq("sku", sku))
      .unique();
    if (dupSku) throw new BusinessRuleError(`SKU ${sku} sudah digunakan`);

    if (args.barcode) {
      const dupBarcode = await ctx.db
        .query("products")
        .withIndex("by_barcode", (q) => q.eq("barcode", args.barcode))
        .unique();
      if (dupBarcode) throw new BusinessRuleError(`Barcode ${args.barcode} sudah digunakan`);
    }

    const now = Date.now();
    const id = await ctx.db.insert("products", {
      sku,
      name,
      barcode: args.barcode,
      categoryId: args.categoryId,
      supplierId: args.supplierId,
      unit: requireString(args.unit, "Satuan", 12),
      purchasePrice: args.purchasePrice,
      sellingPrice: args.sellingPrice,
      minStock: args.minStock ?? 0,
      // Stok awal harus lewat pembelian/adjustment, bukan diisi bebas,
      // agar ada inventory movement + jurnal yang konsisten.
      stock: 0,
      averageCost: args.purchasePrice,
      isActive: true,
      trackInventory: args.trackInventory ?? true,
      createdAt: now,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      user,
      action: "CREATE_PRODUCT",
      entityType: "product",
      entityId: id,
      newValue: { sku, name, purchasePrice: args.purchasePrice, sellingPrice: args.sellingPrice },
    });
    return { id };
  },
});

export const updateProduct = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    barcode: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    supplierId: v.optional(v.id("suppliers")),
    unit: v.optional(v.string()),
    purchasePrice: v.optional(v.number()),
    sellingPrice: v.optional(v.number()),
    minStock: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    trackInventory: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PRODUCT_MANAGE);
    const product = await ctx.db.get(args.id);
    if (!product) throw new NotFoundError("Produk tidak ditemukan");

    if (args.barcode) {
      const dup = await ctx.db
        .query("products")
        .withIndex("by_barcode", (q) => q.eq("barcode", args.barcode))
        .unique();
      if (dup && dup._id !== args.id) {
        throw new BusinessRuleError(`Barcode ${args.barcode} sudah digunakan`);
      }
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = requireString(args.name, "Nama produk", 150);
    if (args.barcode !== undefined) patch.barcode = args.barcode;
    if (args.categoryId !== undefined) patch.categoryId = args.categoryId;
    if (args.supplierId !== undefined) patch.supplierId = args.supplierId;
    if (args.unit !== undefined) patch.unit = requireString(args.unit, "Satuan", 12);
    if (args.purchasePrice !== undefined) {
      assertRupiah(args.purchasePrice, "Harga beli");
      patch.purchasePrice = args.purchasePrice;
    }
    if (args.sellingPrice !== undefined) {
      assertRupiah(args.sellingPrice, "Harga jual");
      patch.sellingPrice = args.sellingPrice;
    }
    if (args.minStock !== undefined) patch.minStock = args.minStock;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    if (args.trackInventory !== undefined) patch.trackInventory = args.trackInventory;

    await ctx.db.patch(args.id, patch);
    await writeAudit(ctx, {
      user,
      action: "UPDATE_PRODUCT",
      entityType: "product",
      entityId: args.id,
      oldValue: {
        name: product.name,
        purchasePrice: product.purchasePrice,
        sellingPrice: product.sellingPrice,
        isActive: product.isActive,
      },
      newValue: patch,
    });
    return { ok: true };
  },
});

/** Nonaktifkan produk (soft delete). Transaksi lama tidak pernah dihapus. */
export const archiveProduct = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PRODUCT_MANAGE);
    const product = await ctx.db.get(args.id);
    if (!product) throw new NotFoundError("Produk tidak ditemukan");
    if (product.stock > 0) {
      throw new BusinessRuleError(
        `Produk masih memiliki stok ${product.stock}. Selling Adjustment Out terlebih dahulu.`,
      );
    }
    await ctx.db.patch(args.id, { isActive: false, updatedAt: Date.now() });
    await writeAudit(ctx, {
      user,
      action: "ARCHIVE_PRODUCT",
      entityType: "product",
      entityId: args.id,
      newValue: { isActive: false },
    });
    return { ok: true };
  },
});

export const lowStock = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PRODUCT_VIEW);
    const settings = await getSettings(ctx);
    const rows = await ctx.db.query("products").collect();
    return rows
      .filter((p) => p.isActive && p.trackInventory)
      .filter((p) => p.stock <= Math.max(p.minStock, settings.lowStockThreshold))
      .map((p) => ({
        id: p._id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        stock: p.stock,
        minStock: p.minStock,
        sellingPrice: p.sellingPrice,
      }))
      .sort((a, b) => a.stock - b.stock);
  },
});
