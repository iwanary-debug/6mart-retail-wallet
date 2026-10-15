import { v } from "convex/values";
import { mutation } from "./_generated/server";
import {
  assertPermission,
  BusinessRuleError,
  requireUser,
  writeAudit,
} from "./lib/guards";
import { requireString } from "./lib/helpers";
import { assertRupiah, roundToSen } from "../lib/money";
import { PERMISSIONS } from "../lib/rbac";
import { createStudentInternal } from "./students";

/**
 * Impor massal produk & santri dari CSV.
 *
 * Satu baris CSV = satu dokumen. Baris yang tidak valid tidak menghentikan
 * proses: laporan dikembalikan per baris supaya operator tahu baris mana
 * yang perlu diperbaiki, tanpa mengulang seluruh impor.
 *
 * Header (urutan bebas, pemisah koma atau titik koma, case-insensitive):
 *   Produk : sku, nama, barcode, satuan, hargaBeli, hargaJual, stokMin
 *   Santri : nis, nama, jenisKelamin, kelas, asrama, kamar
 *
 * `stokAwal` sengaja tidak diterima: stok harus masuk lewat pembelian atau
 * penyesuaian supaya ada inventory movement dan jurnal yang konsisten.
 */

export interface ImportReport {
  total: number;
  created: number;
  failed: number;
  errors: { row: number; message: string }[];
}

function toNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export const importProducts = mutation({
  args: {
    rows: v.array(
      v.object({
        sku: v.optional(v.string()),
        name: v.optional(v.string()),
        barcode: v.optional(v.string()),
        unit: v.optional(v.string()),
        purchasePrice: v.optional(v.string()),
        sellingPrice: v.optional(v.string()),
        minStock: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<ImportReport> => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PRODUCT_MANAGE);

    const report: ImportReport = {
      total: args.rows.length,
      created: 0,
      failed: 0,
      errors: [],
    };
    const now = Date.now();
    const seen = new Set<string>();

    for (const [i, row] of args.rows.entries()) {
      // Baris CSV bernomor dari 2 karena baris pertama adalah header.
      const lineNo = i + 2;
      try {
        const sku = requireString(row.sku ?? "", "SKU", 40).toUpperCase();
        if (seen.has(sku)) {
          throw new BusinessRuleError(`SKU ${sku} duplikat di dalam file`);
        }
        seen.add(sku);

        const existing = await ctx.db
          .query("products")
          .withIndex("by_sku", (q) => q.eq("sku", sku))
          .unique();
        if (existing) throw new BusinessRuleError(`SKU ${sku} sudah ada`);

        const name = requireString(row.name ?? "", "Nama produk", 150);
        const purchasePrice = toNumber(row.purchasePrice);
        const sellingPrice = toNumber(row.sellingPrice);
        if (purchasePrice === null) {
          throw new BusinessRuleError("Harga beli wajib diisi angka");
        }
        if (sellingPrice === null) {
          throw new BusinessRuleError("Harga jual wajib diisi angka");
        }
        assertRupiah(purchasePrice, "Harga beli");
        assertRupiah(sellingPrice, "Harga jual");

        const barcode = (row.barcode ?? "").trim();
        if (barcode) {
          const dupBarcode = await ctx.db
            .query("products")
            .withIndex("by_barcode", (q) => q.eq("barcode", barcode))
            .unique();
          if (dupBarcode) {
            throw new BusinessRuleError(`Barcode ${barcode} sudah dipakai produk lain`);
          }
        }

        await ctx.db.insert("products", {
          sku,
          name,
          barcode: barcode || undefined,
          unit: (row.unit ?? "").trim() || "pcs",
          purchasePrice: roundToSen(purchasePrice),
          sellingPrice: roundToSen(sellingPrice),
          minStock: toNumber(row.minStock) ?? 0,
          stock: 0,
          averageCost: roundToSen(purchasePrice),
          isActive: true,
          trackInventory: true,
          createdAt: now,
          updatedAt: now,
        });

        report.created += 1;
      } catch (err) {
        report.failed += 1;
        report.errors.push({
          row: lineNo,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (report.created > 0) {
      await writeAudit(ctx, {
        user,
        action: "IMPORT_PRODUCTS",
        entityType: "product",
        entityId: "bulk",
        newValue: {
          total: report.total,
          created: report.created,
          failed: report.failed,
        },
      });
    }
    return report;
  },
});

export const importStudents = mutation({
  args: {
    rows: v.array(
      v.object({
        nis: v.optional(v.string()),
        name: v.optional(v.string()),
        gender: v.optional(v.string()),
        className: v.optional(v.string()),
        dormitory: v.optional(v.string()),
        room: v.optional(v.string()),
      }),
    ),
    createWallet: v.optional(v.boolean()),
    createCard: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<ImportReport> => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.STUDENT_MANAGE);

    const report: ImportReport = {
      total: args.rows.length,
      created: 0,
      failed: 0,
      errors: [],
    };
    const seen = new Set<string>();

    for (const [i, row] of args.rows.entries()) {
      const lineNo = i + 2;
      try {
        const nis = requireString(row.nis ?? "", "NIS", 30).trim();
        if (seen.has(nis)) {
          throw new BusinessRuleError(`NIS ${nis} duplikat di dalam file`);
        }
        seen.add(nis);

        const existing = await ctx.db
          .query("students")
          .withIndex("by_nis", (q) => q.eq("nis", nis))
          .unique();
        if (existing) throw new BusinessRuleError(`NIS ${nis} sudah terdaftar`);

        const name = requireString(row.name ?? "", "Nama", 120);
        const className = requireString(row.className ?? "", "Kelas", 40);

        const raw = (row.gender ?? "").trim().toUpperCase();
        let gender: "L" | "P";
        if (raw === "P" || raw === "PEREMPUAN" || raw === "F") gender = "P";
        else if (raw === "L" || raw === "LAKI-LAKI" || raw === "M") gender = "L";
        else {
          throw new BusinessRuleError(
            `Jenis kelamin "${row.gender ?? ""}" tidak dikenal — isi L atau P`,
          );
        }

        // Wallet dan kartu dibuat dengan aturan yang sama seperti
        // `students:create`, supaya hasil impor tidak berbeda dari input manual.
        await createStudentInternal(ctx, user, {
          nis,
          name,
          gender,
          className,
          dormitory: (row.dormitory ?? "").trim() || undefined,
          room: (row.room ?? "").trim() || undefined,
          createWallet: args.createWallet,
          createCard: args.createCard,
        });

        report.created += 1;
      } catch (err) {
        report.failed += 1;
        report.errors.push({
          row: lineNo,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (report.created > 0) {
      await writeAudit(ctx, {
        user,
        action: "IMPORT_STUDENTS",
        entityType: "student",
        entityId: "bulk",
        newValue: {
          total: report.total,
          created: report.created,
          failed: report.failed,
        },
      });
    }
    return report;
  },
});
