import { action, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { requireUser, writeAudit, type SessionUser } from "./lib/guards";
import { DEFAULT_SETTINGS, upsertSetting } from "./lib/helpers";
import { changeStock } from "./lib/inventoryEngine";
import { mutateWallet, postJournal } from "./lib/walletEngine";
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, type RoleKey } from "../lib/rbac";
import * as accounting from "../lib/accounting";
import { buildCode } from "../lib/codes";
import { roundToSen } from "../lib/money";

/** Bentuk SessionUser dari baris tabel users (untuk dipakai engine internal). */
function asSessionUser(row: Doc<"users">): SessionUser {
  return {
    id: row._id,
    name: row.name ?? row.email ?? "Pengguna",
    email: row.email ?? "",
    roleKey: (row.roleKey ?? ROLES.SUPER_ADMIN) as RoleKey,
    permissions: ROLE_PERMISSIONS[row.roleKey as RoleKey] ?? [],
    subject: row.subject ?? "seed",
  };
}

/**
 * Seed data demo 6Mart (blueprint §50).
 * Semua data ditandai sebagai demo/development lewat audit note.
 */

const DEMO_PASSWORD = "6mart2026";

const DEMO_USERS: { name: string; email: string; roleKey: RoleKey; phone: string }[] = [
  { name: "Administrator 6Mart", email: "admin@6mart.test", roleKey: ROLES.SUPER_ADMIN, phone: "081200000001" },
  { name: "Budi Santoso (Manager)", email: "manager@6mart.test", roleKey: ROLES.MANAGER, phone: "081200000002" },
  { name: "Siti Aminah (Kasir)", email: "cashier@6mart.test", roleKey: ROLES.CASHIER, phone: "081200000003" },
  { name: "Dewi Lestari (Finance)", email: "finance@6mart.test", roleKey: ROLES.FINANCE, phone: "081200000004" },
  { name: "Rizky Pratama (Inventory)", email: "inventory@6mart.test", roleKey: ROLES.INVENTORY, phone: "081200000005" },
  { name: "Pak Hendra (Supervisor)", email: "supervisor@6mart.test", roleKey: ROLES.SUPERVISOR, phone: "081200000006" },
  { name: "Hasan (Owner)", email: "owner@6mart.test", roleKey: ROLES.OWNER, phone: "081200000007" },
];

const CATEGORIES = [
  "Makanan Instan",
  "Minuman",
  "Snack & Kerookan",
  "Kebutuhan Harian",
  "Alat Tulis",
  "Obat & Apotek",
  "Rumah Tangga",
];

const PRODUCTS = [
  { sku: "MI-001", name: "Indomie Goreng", barcode: "8998866200201", cat: 0, buy: 2800, sell: 3500, unit: "pcs", min: 20, stock: 120 },
  { sku: "MI-002", name: "Indomie Kuah Soto", barcode: "8998866200218", cat: 0, buy: 2800, sell: 3500, unit: "pcs", min: 20, stock: 95 },
  { sku: "MI-003", name: "Mi Sogek Goreng", barcode: "8992775001369", cat: 0, buy: 2700, sell: 3300, unit: "pcs", min: 15, stock: 60 },
  { sku: "MI-004", name: "Kornet Sup Ayam", barcode: "8999999030001", cat: 0, buy: 9000, sell: 11000, unit: "pcs", min: 10, stock: 40 },
  { sku: "MN-001", name: "Air Mineral 600ml", barcode: "8999999520017", cat: 1, buy: 2000, sell: 3000, unit: "btl", min: 30, stock: 200 },
  { sku: "MN-002", name: "Teh Pucuk 350ml", barcode: "8992775001360", cat: 1, buy: 3000, sell: 4000, unit: "btl", min: 20, stock: 85 },
  { sku: "MN-003", name: "Susu Ultra Milk 250ml", barcode: "8991102551001", cat: 1, buy: 5500, sell: 7000, unit: "pcs", min: 15, stock: 50 },
  { sku: "MN-004", name: "Kopi Kapal Api Sachet", barcode: "8992775001361", cat: 1, buy: 1200, sell: 2000, unit: "sachet", min: 25, stock: 140 },
  { sku: "SN-001", name: "Chitato 68g", barcode: "8999999030002", cat: 2, buy: 9000, sell: 11000, unit: "pcs", min: 10, stock: 35 },
  { sku: "SN-002", name: "Taro Rings 160g", barcode: "8999999030003", cat: 2, buy: 9500, sell: 12000, unit: "pcs", min: 10, stock: 22 },
  { sku: "SN-003", name: "Oreo Sandwich", barcode: "8999999030004", cat: 2, buy: 7000, sell: 9000, unit: "pcs", min: 10, stock: 18 },
  { sku: "SN-004", name: "Wafer Cokelat 250g", barcode: "8999999030005", cat: 2, buy: 11000, sell: 14000, unit: "pcs", min: 5, stock: 12 },
  { sku: "KD-001", name: "Sabun Mandi Lifebuoy", barcode: "8999999030006", cat: 3, buy: 3500, sell: 4500, unit: "pcs", min: 10, stock: 30 },
  { sku: "KD-002", name: "Pasta Gigi Pepsodent", barcode: "8999999030007", cat: 3, buy: 8000, sell: 10000, unit: "pcs", min: 8, stock: 9 },
  { sku: "KD-003", name: "Sabun Cuci Rinso 800g", barcode: "8999999030008", cat: 3, buy: 13000, sell: 16000, unit: "pcs", min: 8, stock: 16 },
  { sku: "KD-004", name: "Tisu Wajah Sella", barcode: "8999999030009", cat: 3, buy: 6000, sell: 8000, unit: "pcs", min: 6, stock: 4 },
  { sku: "AT-001", name: "Buku Tulis 38 Lembar", barcode: "8999999030010", cat: 4, buy: 4500, sell: 6000, unit: "pcs", min: 10, stock: 28 },
  { sku: "AT-002", name: "Pulpen Faster C-1", barcode: "8999999030011", cat: 4, buy: 12000, sell: 15000, unit: "box", min: 5, stock: 3 },
  { sku: "AT-003", name: "Penghapus", barcode: "8999999030012", cat: 4, buy: 1500, sell: 2500, unit: "pcs", min: 10, stock: 20 },
  { sku: "OB-001", name: "Obat Kepala Penadol", barcode: "8999999030013", cat: 5, buy: 8500, sell: 11000, unit: "strip", min: 5, stock: 14 },
  { sku: "OB-002", name: "Plester Wound", barcode: "8999999030014", cat: 5, buy: 7500, sell: 9500, unit: "box", min: 5, stock: 2 },
  { sku: "RT-001", name: "Sabun Cuci Cair 1L", barcode: "8999999030015", cat: 6, buy: 18000, sell: 22000, unit: "pcs", min: 4, stock: 6 },
  { sku: "RT-002", name: "Kantong Sampah 50l", barcode: "8999999030016", cat: 6, buy: 12000, sell: 15000, unit: "roll", min: 5, stock: 1 },
];

const STUDENTS = [
  { nis: "26001", name: "Ahmad Fauzi", gender: "L" as const, cls: "XII-A", dorm: "Asrama Putra 1", room: "A-101" },
  { nis: "26002", name: "Siti Nurhaliza", gender: "P" as const, cls: "XII-A", dorm: "Asrama Putri 1", room: "B-201" },
  { nis: "26003", name: "Abdullah Hakim", gender: "L" as const, cls: "XI-B", dorm: "Asrama Putra 2", room: "A-202" },
  { nis: "26004", name: "Nabila Rahma", gender: "P" as const, cls: "XI-B", dorm: "Asrama Putri 2", room: "B-202" },
  { nis: "26005", name: "Muhammad Rizki", gender: "L" as const, cls: "X-A", dorm: "Asrama Putra 1", room: "A-103" },
  { nis: "26006", name: "Aisyah Putri", gender: "P" as const, cls: "X-A", dorm: "Asrama Putri 1", room: "B-103" },
  { nis: "26007", name: "Ilham Nurcahyo", gender: "L" as const, cls: "IX-C", dorm: "Asrama Putra 3", room: "A-305" },
  { nis: "26008", name: "Zahra Amelia", gender: "P" as const, cls: "IX-C", dorm: "Asrama Putri 3", room: "B-305" },
  { nis: "26009", name: "Fajar Setiawan", gender: "L" as const, cls: "VIII-B", dorm: "Asrama Putra 2", room: "A-206" },
  { nis: "26010", name: "Kirana Dewi", gender: "P" as const, cls: "VIII-B", dorm: "Asrama Putri 2", room: "B-206" },
  { nis: "26011", name: "Bagus Hermawan", gender: "L" as const, cls: "VII-A", dorm: "Asrama Putra 1", room: "A-107" },
  { nis: "26012", name: "Aluna Safitri", gender: "P" as const, cls: "VII-A", dorm: "Asrama Putri 1", room: "B-107" },
];

const PARENTS = [
  { code: "PRN-0001", name: "Bapak Ahmad Fauzi", phone: "081311111111" },
  { code: "PRN-0002", name: "Bapak Sutrisno", phone: "081322222222" },
  { code: "PRN-0003", name: "Ibu Hj. Maryam", phone: "081333333333" },
];

function token(seed: number) {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (seed * 31 + i * 7) % 256;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const status = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    const students = await ctx.db.query("students").collect();
    const products = await ctx.db.query("products").collect();
    return {
      seeded: users.length > 0 && students.length > 0,
      users: users.length,
      students: students.length,
      products: products.length,
      sales: (await ctx.db.query("sales").collect()).length,
      wallets: (await ctx.db.query("wallets").collect()).length,
      ledgerEntries: (await ctx.db.query("walletLedger").collect()).length,
      journalEntries: (await ctx.db.query("journalEntries").collect()).length,
    };
  },
});

/**
 * Menggabungkan dokumen auth (dibuat Convex Auth) dengan dokumen staff 6Mart.
 *
 * Pada instalasi awal, tabel `users` berisi dua jenis dokumen:
 *   - dokumen staff  : punya `roleKey`, dibuat oleh seed
 *   - dokumen auth   : dibuat `createAccount` dari Convex Auth, punya `email`
 *
 * Keduanya memakai tabel yang sama, sehingga harus digabung: field staff
 * disalin ke dokumen auth, lalu dokumen staff dihapus. Dengan begitu
 * `requireUser` selalu menemukan satu dokumen per akun.
 */
export const linkAuthAccounts = mutation({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("users").collect();
    const staff = all.filter((u) => u.roleKey);
    const authDocs = all.filter((u) => !u.roleKey && u.email);

    const linked: string[] = [];
    const removed: string[] = [];

    for (const staffRow of staff) {
      const email = (staffRow.email ?? "").toLowerCase();
      if (!email) continue;
      const authRow = authDocs.find((a) => (a.email ?? "").toLowerCase() === email);
      if (!authRow) continue;

      await ctx.db.patch(authRow._id, {
        roleKey: staffRow.roleKey,
        permissions: staffRow.permissions,
        isActive: staffRow.isActive ?? true,
        name: authRow.name ?? staffRow.name,
        createdAt: staffRow.createdAt ?? authRow.createdAt,
        updatedAt: Date.now(),
      });
      await ctx.db.delete(staffRow._id);
      linked.push(email);
      removed.push(staffRow._id);
    }

    // Dokumen auth yang tidak punya pasangan staff (mis. akun salah kirim)
    // diberi peran paling kecil supaya tidak bisa melakukan apa pun.
    for (const authRow of authDocs) {
      if (linked.includes((authRow.email ?? "").toLowerCase())) continue;
      await ctx.db.patch(authRow._id, {
        roleKey: ROLES.STUDENT,
        permissions: [],
        isActive: false,
        updatedAt: Date.now(),
      });
    }

    return { linked, removed, total: all.length };
  },
});

/** Seed idempoten. Aman dipanggil berkali-kali. */
export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.roleKey !== ROLES.SUPER_ADMIN && user.roleKey !== ROLES.MANAGER) {
      throw new Error("Hanya Super Admin atau Manager yang dapat menjalankan seed");
    }
    return runSeed(ctx, user);
  },
});

/**
 * Bootstrap satu-kali untuk instalasi lokal/development.
 *
 * Syarat: database masih kosong (tabel `roles` belum berisi baris).
 * Setelah data ada, endpoint ini otomatis menolak sehingga tidak menjadi
 * celah keamanan. Jalur normal setelahnya: masuk sebagai Super Admin lalu
 * jalankan `seed`.
 */
export const bootstrap = mutation({
  args: {},
  handler: async (ctx) => {
    const existingRoles = await ctx.db.query("roles").collect();
    if (existingRoles.length > 0) {
      throw new Error(
        "Database sudah terisi. Gunakan akun Super Admin dan jalankan seed dari aplikasi.",
      );
    }

    // Pengguna sementara yang mencatat provenance audit bootstrapping.
    const bootstrapUser: SessionUser = {
      id: "bootstrap" as SessionUser["id"],
      name: "System Bootstrap",
      email: "bootstrap@6mart.local",
      roleKey: ROLES.SUPER_ADMIN,
      permissions: ROLE_PERMISSIONS[ROLES.SUPER_ADMIN] ?? [],
      subject: "bootstrap",
    };

    const result = await runSeed(ctx, bootstrapUser);
    return result;
  },
});

async function runSeed(ctx: MutationCtx, user: SessionUser) {
    const now = Date.now();
    const created: Record<string, number> = {};
    // 1. Roles
    if ((await ctx.db.query("roles").collect()).length === 0) {
      const roleDefs: { key: RoleKey; name: string; description: string; createdAt: number }[] = [
        { key: ROLES.SUPER_ADMIN, name: "Super Admin", description: "Akses penuh sistem", createdAt: now },
        { key: ROLES.MANAGER, name: "Manager 6Mart", description: "Operasional, penjualan, keuangan", createdAt: now },
        { key: ROLES.SUPERVISOR, name: "Supervisor", description: "Pengawasan kasir dan operasional", createdAt: now },
        { key: ROLES.CASHIER, name: "Kasir", description: "Transaksi penjualan dan shift kasir", createdAt: now },
        { key: ROLES.INVENTORY, name: "Staff Inventory", description: "Produk, stok, pembelian", createdAt: now },
        { key: ROLES.FINANCE, name: "Finance", description: "Jurnal, beban, laporan keuangan", createdAt: now },
        { key: ROLES.OWNER, name: "Owner / Management", description: "Dashboard dan laporan manajemen", createdAt: now },
        { key: ROLES.PARENT, name: "Wali Santri", description: "Lihat saldo dan transaksi anak", createdAt: now },
        { key: ROLES.STUDENT, name: "Santri", description: "Akses terbatas wallet sendiri", createdAt: now },
      ];
      for (const def of roleDefs) {
        await ctx.db.insert("roles", {
          key: def.key,
          name: def.name,
          description: def.description,
          permissions: ROLE_PERMISSIONS[def.key],
          isSystem: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const key of Object.values(PERMISSIONS)) {
      const exists = await ctx.db
        .query("permissions")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (!exists) {
        await ctx.db.insert("permissions", {
          key,
          module: key.split(".")[0],
          description: key,
          createdAt: now,
        });
      }
    }

    // 2. Settings
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await upsertSetting(ctx, key as keyof typeof DEFAULT_SETTINGS, value as string | number | boolean);
    }

    // 3. Chart of Accounts
    if ((await ctx.db.query("chartOfAccounts").collect()).length === 0) {
      for (const account of accounting.CHART_OF_ACCOUNTS) {
        await ctx.db.insert("chartOfAccounts", {
          ...account,
          isActive: true,
          createdAt: now,
        });
      }
    }

    // 4. Users
    const existingUsers = await ctx.db.query("users").collect();
    if (existingUsers.length === 0) {
      for (const def of DEMO_USERS) {
        await ctx.db.insert("users", {
          name: def.name,
          email: def.email,
          roleKey: def.roleKey,
          phone: def.phone,
          isActive: true,
          createdAt: now,
        });
      }
      created.users = DEMO_USERS.length;
    }
    const users = await ctx.db.query("users").collect();
    const admin = asSessionUser(users.find((u) => u.roleKey === ROLES.SUPER_ADMIN) ?? users[0]);
    const cashier = asSessionUser(users.find((u) => u.roleKey === ROLES.CASHIER) ?? users[0]);

    // 5. Categories
    let categories = await ctx.db.query("categories").collect();
    if (categories.length === 0) {
      for (const name of CATEGORIES) {
        await ctx.db.insert("categories", { name, isActive: true, createdAt: now });
      }
      categories = await ctx.db.query("categories").collect();
      created.categories = categories.length;
    }

    // 6. Suppliers
    let suppliers = await ctx.db.query("suppliers").collect();
    if (suppliers.length === 0) {
      const defs = [
        { code: "SUP-0001", name: "PT Sumber Pangan Nusantara", phone: "0311234567", contactPerson: "Pak Joko" },
        { code: "SUP-0002", name: "CV Berkah Grosir", phone: "0321234567", contactPerson: "Bu Sari" },
        { code: "SUP-0003", name: "Toko Serba Ada", phone: "0331234567", contactPerson: "Pak Ahmad" },
      ];
      for (const d of defs) {
        await ctx.db.insert("suppliers", {
          ...d,
          address: "Jawa Timur",
          status: "ACTIVE",
          createdAt: now,
        });
      }
      suppliers = await ctx.db.query("suppliers").collect();
      created.suppliers = suppliers.length;
    }

    // 7. Products + stock in via pembelian (agar ada movement & jurnal)
    let products = await ctx.db.query("products").collect();
    if (products.length === 0) {
      for (let i = 0; i < PRODUCTS.length; i++) {
        const p = PRODUCTS[i];
        const productId = await ctx.db.insert("products", {
          sku: p.sku,
          name: p.name,
          barcode: p.barcode,
          categoryId: categories[p.cat]?._id,
          supplierId: suppliers[i % suppliers.length]?._id,
          unit: p.unit,
          purchasePrice: p.buy,
          sellingPrice: p.sell,
          minStock: p.min,
          stock: 0,
          averageCost: p.buy,
          isActive: true,
          trackInventory: true,
          createdAt: now,
          updatedAt: now,
        });
        await changeStock(ctx, {
          productId,
          quantity: p.stock,
          unitCost: p.buy,
          type: "PURCHASE",
          referenceType: "seed",
          referenceId: "SEED-OPENING",
          note: "Stok awal demo",
          user,
        });
      }
      products = await ctx.db.query("products").collect();
      created.products = products.length;

      // Jurnal stok awal
      const totalValue = roundToSen(
        PRODUCTS.reduce((s, p) => s + p.stock * p.buy, 0),
      );
      if (totalValue > 0) {
        await postJournal(ctx, {
          entryDate: now,
          description: "Stok awal 6Mart (demo)",
          source: "OPENING",
          referenceType: "seed",
          referenceId: "SEED-OPENING",
          lines: accounting.buildJournalLines([
            { accountCode: accounting.COA.INVENTORY, debit: totalValue, memo: "Stok awal" },
            { accountCode: accounting.COA.OWNER_EQUITY, credit: totalValue, memo: "Modal stok awal" },
          ]),
          user,
        });
      }
    }

    // 8. Parents + students + cards + wallets
    let students = await ctx.db.query("students").collect();
    if (students.length === 0) {
      for (let i = 0; i < PARENTS.length; i++) {
        const p = PARENTS[i];
        const exists = await ctx.db
          .query("parents")
          .withIndex("by_code", (q) => q.eq("code", p.code))
          .unique();
        if (!exists) {
          await ctx.db.insert("parents", {
            ...p,
            email: `${p.code.toLowerCase()}@contoh.test`,
            address: "Bondowoso, Jawa Timur",
            status: "ACTIVE",
            createdAt: now,
          });
        }
      }
      const parents = await ctx.db.query("parents").collect();

      for (let i = 0; i < STUDENTS.length; i++) {
        const s = STUDENTS[i];
        const studentId = await ctx.db.insert("students", {
          nis: s.nis,
          name: s.name,
          gender: s.gender,
          className: s.cls,
          dormitory: s.dorm,
          room: s.room,
          status: "ACTIVE",
          createdAt: now,
        });

        const walletId = await ctx.db.insert("wallets", {
          studentId,
          code: buildCode("WAL", now, i + 1),
          currentBalance: 0,
          status: "ACTIVE",
          version: 1,
          createdAt: now,
          updatedAt: now,
        });

        await ctx.db.insert("walletLimits", {
          studentId,
          dailyDebitLimit: 1_000_000,
          dailyTopupLimit: 2_000_000,
          maxBalance: 3_000_000,
          minBalance: 0,
          withdrawalEnabled: true,
          createdAt: now,
          updatedAt: now,
        });

        // Kartu RFID + QR untuk identifikasi cepat
        const rfidUid = `A${(i + 1).toString().padStart(4, "0")}B${(9000 + i * 137).toString(16).toUpperCase()}`;
        await ctx.db.insert("studentCards", {
          code: buildCode("RFD", now, i + 1),
          studentId,
          rfidUid,
          qrToken: token(i + 1),
          status: "ACTIVE",
          issuedAt: now,
          createdAt: now,
        });

        if (i < parents.length) {
          await ctx.db.insert("parentStudents", {
            parentId: parents[i]._id,
            studentId,
            relation: i === 0 ? "AYAH" : "WALI",
            isPrimary: true,
            createdAt: now,
            updatedAt: now,
          });
        }
        void walletId;
      }
      students = await ctx.db.query("students").collect();
      created.students = students.length;
    }

    // 9. Top up untuk sebagian santri (via ledger resmi)
    const existingLedger = await ctx.db.query("walletLedger").collect();
    if (existingLedger.length === 0 && students.length > 0) {
      const amounts = [500_000, 350_000, 250_000, 400_000, 150_000, 600_000, 200_000, 300_000];
      for (let i = 0; i < Math.min(8, students.length); i++) {
        await mutateWallet(ctx, admin, {
          studentId: students[i]._id,
          type: "TOPUP",
          amount: amounts[i],
          note: "Top up demo (saldo awal)",
          method: "BANK_TRANSFER",
          provider: "SEED",
          providerReference: `SEED-${i + 1}`,
          idempotencyKey: `seed-topup-${i + 1}`,
        });
      }
      created.topups = Math.min(8, students.length);
    }

    // 10. Penjualan contoh
    const existingSales = await ctx.db.query("sales").collect();
    if (existingSales.length === 0 && students.length > 0 && products.length > 0) {
      const shiftId = await ctx.db.insert("cashierShifts", {
        code: "SHF-SEED-0001",
        cashierId: cashier.id,
        cashierName: cashier.name,
        openingCash: 200_000,
        cashSales: 0,
        cashIn: 0,
        cashOut: 0,
        cashExpenses: 0,
        expectedCash: 200_000,
        openedAt: now - 3 * 86_400_000,
        status: "OPEN",
        createdAt: now,
      });

      const baskets: { studentIndex: number; items: { sku: string; qty: number }[]; method: "WALLET" | "CASH" }[] = [
        { studentIndex: 0, items: [{ sku: "MI-001", qty: 2 }, { sku: "MN-001", qty: 2 }], method: "WALLET" },
        { studentIndex: 1, items: [{ sku: "SN-001", qty: 1 }, { sku: "MN-002", qty: 1 }], method: "WALLET" },
        { studentIndex: 2, items: [{ sku: "MI-002", qty: 3 }, { sku: "MN-004", qty: 2 }], method: "WALLET" },
        { studentIndex: 0, items: [{ sku: "AT-001", qty: 1 }], method: "CASH" },
        { studentIndex: 3, items: [{ sku: "MN-003", qty: 1 }, { sku: "SN-002", qty: 1 }], method: "WALLET" },
        { studentIndex: 4, items: [{ sku: "KD-001", qty: 1 }, { sku: "MI-004", qty: 1 }], method: "WALLET" },
      ];

      let salesCount = 0;
      for (let i = 0; i < baskets.length; i++) {
        const basket = baskets[i];
        const student = students[basket.studentIndex];
        const productMap = new Map(products.map((p) => [p.sku, p]));
        const lines = basket.items
          .map((it) => {
            const product = productMap.get(it.sku);
            if (!product) return null;
            return { product, quantity: it.qty };
          })
          .filter((x): x is { product: (typeof products)[number]; quantity: number } => x !== null);
        if (lines.length === 0) continue;

        const subtotal = roundToSen(
          lines.reduce((s, l) => s + l.product.sellingPrice * l.quantity, 0),
        );
        const walletAmount = basket.method === "WALLET" ? subtotal : 0;
        const cashAmount = subtotal - walletAmount;

        const wallet = await ctx.db
          .query("wallets")
          .withIndex("by_student", (q) => q.eq("studentId", student._id))
          .unique();
        if (basket.method === "WALLET" && (wallet?.currentBalance ?? 0) < subtotal) continue;

        const saleCode = buildCode("SAL", now, i + 1);
        const saleId = await ctx.db.insert("sales", {
          code: saleCode,
          invoiceNumber: saleCode,
          studentId: student._id,
          studentName: student.name,
          cashierId: cashier.id,
          cashierName: cashier.name,
          shiftId,
          channel: "COUNTER",
          paymentMethod: basket.method,
          identificationMethod: basket.method === "WALLET" ? "RFID" : undefined,
          subtotal,
          discount: 0,
          serviceTotal: 0,
          total: subtotal,
          paidAmount: subtotal,
          changeAmount: 0,
          costTotal: 0,
          status: "COMPLETED",
          createdAt: now - (6 - i) * 3_600_000,
        });

        let cogsTotal = 0;
        for (const line of lines) {
          const lineCogs = roundToSen(line.product.averageCost * line.quantity);
          cogsTotal = roundToSen(cogsTotal + lineCogs);
          await ctx.db.insert("saleItems", {
            saleId,
            productId: line.product._id,
            name: line.product.name,
            quantity: line.quantity,
            unit: line.product.unit,
            sellingPrice: line.product.sellingPrice,
            discount: 0,
            costPrice: line.product.averageCost,
            subtotal: roundToSen(line.product.sellingPrice * line.quantity),
            cogs: lineCogs,
            createdAt: now,
          });
          await changeStock(ctx, {
            productId: line.product._id,
            quantity: line.quantity,
            type: "SALE",
            referenceType: "sale",
            referenceId: saleCode,
            note: `Penjualan ${saleCode}`,
            user,
          });
        }
        await ctx.db.patch(saleId, { costTotal: cogsTotal });

        if (walletAmount > 0) {
          const res = await mutateWallet(ctx, cashier, {
            studentId: student._id,
            type: "PURCHASE",
            amount: walletAmount,
            note: `Pembelian ${saleCode}`,
            referenceType: "sale",
            referenceId: saleCode,
            idempotencyKey: `seed-sale-${i + 1}-wallet`,
          });
          await ctx.db.insert("payments", {
            saleId,
            method: "WALLET",
            amount: walletAmount,
            reference: res.transactionId,
            walletLedgerId: res.ledgerId,
            status: "SUCCESS",
            createdAt: now,
          });
          await postJournal(ctx, {
            entryDate: now,
            description: `Penjualan ${saleCode} (wallet)`,
            source: "SALE",
            referenceType: "sale",
            referenceId: saleCode,
            lines: accounting.walletPurchaseJournal(walletAmount),
            user: cashier,
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
            shiftId,
            type: "SALE",
            direction: "IN",
            amount: cashAmount,
            referenceType: "sale",
            referenceId: saleCode,
            createdBy: cashier.id,
            createdAt: now,
          });
          await postJournal(ctx, {
            entryDate: now,
            description: `Penjualan ${saleCode} (tunai)`,
            source: "SALE",
            referenceType: "sale",
            referenceId: saleCode,
            lines: accounting.cashSaleJournal(cashAmount),
            user: cashier,
          });
        }
        if (cogsTotal > 0) {
          await postJournal(ctx, {
            entryDate: now,
            description: `HPP penjualan ${saleCode}`,
            source: "SALE",
            referenceType: "sale",
            referenceId: saleCode,
            lines: accounting.cogsJournal(cogsTotal),
            user: cashier,
          });
        }
        salesCount += 1;
      }
      created.sales = salesCount;
    }

    // 11. Beban operasional contoh
    if ((await ctx.db.query("expenses").collect()).length === 0) {
      const expenses = [
        { category: accounting.COA.ELECTRICITY_EXPENSE, description: "Token listrik 6Mart", amount: 250_000 },
        { category: accounting.COA.INTERNET_EXPENSE, description: "Internet Laffaz", amount: 350_000 },
        { category: accounting.COA.SUPPLIES_EXPENSE, description: "Perlengkapan toko", amount: 125_000 },
      ];
      for (let i = 0; i < expenses.length; i++) {
        const e = expenses[i];
        const journalEntryId = await postJournal(ctx, {
          entryDate: now - i * 86_400_000,
          description: `${e.description}`,
          source: "EXPENSE",
          referenceType: "expense",
          referenceId: `SEED-EXP-${i + 1}`,
          lines: accounting.expenseJournal(e.category, e.amount),
          user: admin,
        });
        await ctx.db.insert("expenses", {
          code: `EXP-SEED-${String(i + 1).padStart(4, "0")}`,
          expenseDate: now - i * 86_400_000,
          category: e.category,
          description: e.description,
          amount: e.amount,
          paymentMethod: "CASH",
          recordedBy: admin.id,
          recordedByName: admin.name,
          journalEntryId,
          createdAt: now,
        });
      }
      created.expenses = expenses.length;
    }

    // 12. Layanan & PPOB katalog
    if ((await ctx.db.query("barbershopServices").collect()).length === 0) {
      const defs = [
        { name: "Potong Rambut", price: 10_000, durationMinutes: 20 },
        { name: "Cuci Potong", price: 15_000, durationMinutes: 30 },
        { name: "Keramas", price: 18_000, durationMinutes: 30 },
        { name: "Cukur Kumis", price: 7_000, durationMinutes: 10 },
      ];
      for (const d of defs) {
        await ctx.db.insert("barbershopServices", { ...d, isActive: true, createdAt: now });
      }
      created.barbershopServices = defs.length;
    }

    await writeAudit(ctx, {
      user,
      action: "SEED_DEMO_DATA",
      entityType: "system",
      note: "Seeding data demo (DEVELOPMENT)",
      newValue: created,
    });

    return { ok: true, created, demoPassword: DEMO_PASSWORD };
}

/**
 * Membuat akun auth (password) untuk user demo.
 * Dijalankan sekali setelah seed; memakai alur signUp resmi Convex Auth
 * sehingga password benar-benar di-hash (bukan plaintext).
 */
export const createDemoAccounts = action({
  args: {},
  handler: async (ctx) => {
    const results: { email: string; ok: boolean; error?: string }[] = [];
    for (const def of DEMO_USERS) {
      try {
        await ctx.runAction(internal.users.ensureAuthAccount, {
          email: def.email,
          name: def.name,
          password: DEMO_PASSWORD,
        });
        results.push({ email: def.email, ok: true });
      } catch (error) {
        results.push({
          email: def.email,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { results, password: DEMO_PASSWORD };
  },
});

async function _unusedCreateDemoAccounts() {
  return null;
}
void _unusedCreateDemoAccounts;

export { DEMO_PASSWORD, DEMO_USERS };
