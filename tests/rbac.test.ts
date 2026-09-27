import { describe, expect, test } from "bun:test";
import {
  PERMISSIONS,
  ROLE_LABELS,
  ROLES,
  canAny,
  isRoleKey,
  permissionsForRole,
  roleHasPermission,
  type RoleKey,
} from "../src/lib/rbac";

describe("definisi peran (blueprint §38)", () => {
  test("semua peran punya label Bahasa Indonesia", () => {
    for (const key of Object.values(ROLES) as RoleKey[]) {
      expect(ROLE_LABELS[key]).toBeTruthy();
    }
  });

  test("isRoleKey hanya menerima kunci peran yang dikenal", () => {
    expect(isRoleKey(ROLES.CASHIER)).toBe(true);
    expect(isRoleKey("super_admin")).toBe(true);
    expect(isRoleKey("hacker")).toBe(false);
    expect(isRoleKey("")).toBe(false);
  });

  test("peran tidak dikenal tidak memiliki izin sama sekali", () => {
    expect(permissionsForRole("hacker")).toEqual([]);
    expect(roleHasPermission("hacker", PERMISSIONS.SALE_CREATE)).toBe(false);
  });
});

describe("Super Admin memiliki akses penuh (blueprint §38)", () => {
  test("Super Admin memiliki setiap permission yang didefinisikan", () => {
    const owned = permissionsForRole(ROLES.SUPER_ADMIN);
    for (const p of Object.values(PERMISSIONS)) {
      expect(owned).toContain(p);
    }
  });

  test("Super Admin punya label dan kunci peran yang valid", () => {
    expect(ROLE_LABELS[ROLES.SUPER_ADMIN]).toBe("Super Admin");
  });
});

describe("Kasir (blueprint §26, §38)", () => {
  test("Kasir boleh membuat penjualan", () => {
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.SALE_CREATE)).toBe(true);
  });

  test("Kasir boleh top up dan penarikan wallet", () => {
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.WALLET_TOPUP)).toBe(true);
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.WALLET_WITHDRAW)).toBe(true);
  });

  test("Kasir TIDAK boleh mengubah konfigurasi sistem", () => {
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
  });

  test("Kasir TIDAK boleh mengelola pengguna", () => {
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.USER_MANAGE)).toBe(false);
  });

  test("Kasir TIDAK boleh melihat dashboard keuangan", () => {
    expect(roleHasPermission(ROLES.CASHIER, PERMISSIONS.DASHBOARD_FINANCIAL)).toBe(false);
  });
});

describe("Staff Inventory (blueprint §21, §38)", () => {
  test("boleh melihat dan menyesuaikan stok", () => {
    expect(roleHasPermission(ROLES.INVENTORY, PERMISSIONS.INVENTORY_VIEW)).toBe(true);
    expect(roleHasPermission(ROLES.INVENTORY, PERMISSIONS.INVENTORY_ADJUST)).toBe(true);
  });

  test("TIDAK boleh membuat penjualan", () => {
    expect(roleHasPermission(ROLES.INVENTORY, PERMISSIONS.SALE_CREATE)).toBe(false);
  });
});

describe("Finance (blueprint §29, §38)", () => {
  test("boleh membuat jurnal dan mencatat beban", () => {
    expect(roleHasPermission(ROLES.FINANCE, PERMISSIONS.FINANCE_JOURNAL)).toBe(true);
    expect(roleHasPermission(ROLES.FINANCE, PERMISSIONS.FINANCE_EXPENSE)).toBe(true);
  });

  test("boleh melihat laporan keuangan", () => {
    expect(roleHasPermission(ROLES.FINANCE, PERMISSIONS.REPORT_FINANCIAL)).toBe(true);
  });

  test("TIDAK boleh mengubah konfigurasi sistem", () => {
    expect(roleHasPermission(ROLES.FINANCE, PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
  });
});

describe("Owner hanya read-only (blueprint §38)", () => {
  test("Owner boleh melihat dashboard dan laporan", () => {
    expect(roleHasPermission(ROLES.OWNER, PERMISSIONS.DASHBOARD_VIEW)).toBe(true);
    expect(roleHasPermission(ROLES.OWNER, PERMISSIONS.REPORT_VIEW)).toBe(true);
    expect(roleHasPermission(ROLES.OWNER, PERMISSIONS.FINANCE_VIEW)).toBe(true);
  });

  test("Owner TIDAK boleh membuat penjualan, jurnal, atau top up", () => {
    expect(roleHasPermission(ROLES.OWNER, PERMISSIONS.SALE_CREATE)).toBe(false);
    expect(roleHasPermission(ROLES.OWNER, PERMISSIONS.FINANCE_JOURNAL)).toBe(false);
    expect(roleHasPermission(ROLES.OWNER, PERMISSIONS.WALLET_TOPUP)).toBe(false);
  });

  test("Owner TIDAK boleh mengelola pengguna", () => {
    expect(roleHasPermission(ROLES.OWNER, PERMISSIONS.USER_MANAGE)).toBe(false);
  });
});

describe("Wali dan Santri hanya bisa melihat wallet sendiri", () => {
  test("Wali boleh melihat wallet milik sendiri", () => {
    expect(roleHasPermission(ROLES.PARENT, PERMISSIONS.WALLET_VIEW_OWN)).toBe(true);
  });

  test("Wali tidak boleh melihat seluruh wallet", () => {
    expect(roleHasPermission(ROLES.PARENT, PERMISSIONS.WALLET_VIEW)).toBe(false);
  });

  test("Santri hanya boleh melihat wallet sendiri", () => {
    expect(permissionsForRole(ROLES.STUDENT)).toEqual([PERMISSIONS.WALLET_VIEW_OWN]);
  });
});

describe("canAny (blueprint §38)", () => {
  test("true bila salah satu permission dimiliki", () => {
    expect(
      canAny(ROLES.CASHIER, [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.SALE_CREATE]),
    ).toBe(true);
  });

  test("false bila tidak ada yang dimiliki", () => {
    expect(canAny(ROLES.CASHIER, [PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.USER_MANAGE])).toBe(
      false,
    );
  });

  test("daftar kosong menghasilkan false", () => {
    expect(canAny(ROLES.CASHIER, [])).toBe(false);
  });
});

describe("matriks izin tidak memiliki duplikat dan konsisten", () => {
  test("tidak ada permission duplikat di setiap peran", () => {
    for (const key of Object.values(ROLES) as RoleKey[]) {
      const perms = permissionsForRole(key);
      expect(new Set(perms).size).toBe(perms.length);
    }
  });

  test("setiap permission yang diberikan benar-benar ada di PERMISSIONS", () => {
    const known = new Set(Object.values(PERMISSIONS));
    for (const key of Object.values(ROLES) as RoleKey[]) {
      for (const p of permissionsForRole(key)) {
        expect(known.has(p)).toBe(true);
      }
    }
  });

  test("Manager mewarisi seluruh izin kasir dan inventory", () => {
    for (const p of permissionsForRole(ROLES.CASHIER)) {
      expect(roleHasPermission(ROLES.MANAGER, p)).toBe(true);
    }
    for (const p of permissionsForRole(ROLES.INVENTORY)) {
      expect(roleHasPermission(ROLES.MANAGER, p)).toBe(true);
    }
  });
});
