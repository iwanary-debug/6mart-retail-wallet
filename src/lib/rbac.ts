/**
 * RBAC 6Mart (blueprint §5, §20).
 *
 * Permission di-enforce di LAPIS SERVER (Convex mutations) DAN di UI.
 * Menyembunyikan menu saja tidak dianggap sebagai permission.
 */

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  MANAGER: "manager",
  SUPERVISOR: "supervisor",
  CASHIER: "cashier",
  INVENTORY: "inventory",
  FINANCE: "finance",
  OWNER: "owner",
  PARENT: "parent",
  STUDENT: "student",
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  // Master data
  STUDENT_VIEW: "student.view",
  STUDENT_MANAGE: "student.manage",
  PARENT_MANAGE: "parent.manage",
  CARD_MANAGE: "card.manage",
  PRODUCT_VIEW: "product.view",
  PRODUCT_MANAGE: "product.manage",
  SUPPLIER_MANAGE: "supplier.manage",
  USER_MANAGE: "user.manage",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_VIEW: "audit.view",

  // POS
  SALE_CREATE: "sale.create",
  SALE_VIEW: "sale.view",
  SALE_REFUND: "sale.refund",
  SALE_VOID: "sale.void",
  SHIFT_MANAGE: "shift.manage",

  // Inventory
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_ADJUST: "inventory.adjust",
  PURCHASE_MANAGE: "purchase.manage",

  // Wallet
  WALLET_VIEW: "wallet.view",
  WALLET_TOPUP: "wallet.topup",
  WALLET_WITHDRAW: "wallet.withdraw",
  WALLET_ADJUST: "wallet.adjust",
  WALLET_VIEW_OWN: "wallet.view.own",

  // Finance
  FINANCE_VIEW: "finance.view",
  FINANCE_JOURNAL: "finance.journal",
  FINANCE_EXPENSE: "finance.expense",
  FINANCE_PURCHASE: "finance.purchase",

  // Reports
  REPORT_VIEW: "report.view",
  REPORT_FINANCIAL: "report.financial",

  // Services
  SERVICE_LAUNDRY: "service.laundry",
  SERVICE_BARBERSHOP: "service.barbershop",
  SERVICE_JASTIP: "service.jastip",
  SERVICE_PPOB: "service.ppob",

  // Dashboard
  DASHBOARD_VIEW: "dashboard.view",
  DASHBOARD_FINANCIAL: "dashboard.financial",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const STAFF_VIEW: string[] = [
  PERMISSIONS.SALE_VIEW,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.DASHBOARD_VIEW,
];

const CASHIER_PERMISSIONS: string[] = [
  PERMISSIONS.SALE_CREATE,
  PERMISSIONS.SALE_VIEW,
  PERMISSIONS.SALE_REFUND,
  PERMISSIONS.SHIFT_MANAGE,
  PERMISSIONS.WALLET_VIEW,
  PERMISSIONS.WALLET_TOPUP,
  PERMISSIONS.WALLET_WITHDRAW,
  PERMISSIONS.WALLET_ADJUST,
  PERMISSIONS.WALLET_VIEW_OWN,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.STUDENT_VIEW,
  PERMISSIONS.DASHBOARD_VIEW,
  PERMISSIONS.REPORT_VIEW,
  PERMISSIONS.CARD_MANAGE,
  PERMISSIONS.SERVICE_LAUNDRY,
  PERMISSIONS.SERVICE_BARBERSHOP,
  PERMISSIONS.SERVICE_JASTIP,
  PERMISSIONS.SERVICE_PPOB,
];

const INVENTORY_PERMISSIONS: string[] = [
  ...STAFF_VIEW,
  PERMISSIONS.PRODUCT_MANAGE,
  PERMISSIONS.SUPPLIER_MANAGE,
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.INVENTORY_ADJUST,
  PERMISSIONS.PURCHASE_MANAGE,
];

const FINANCE_PERMISSIONS: string[] = [
  ...STAFF_VIEW,
  PERMISSIONS.FINANCE_VIEW,
  PERMISSIONS.FINANCE_JOURNAL,
  PERMISSIONS.FINANCE_EXPENSE,
  PERMISSIONS.FINANCE_PURCHASE,
  PERMISSIONS.REPORT_VIEW,
  PERMISSIONS.REPORT_FINANCIAL,
  PERMISSIONS.DASHBOARD_FINANCIAL,
  PERMISSIONS.WALLET_VIEW,
  PERMISSIONS.WALLET_TOPUP,
  PERMISSIONS.WALLET_ADJUST,
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.PURCHASE_MANAGE,
  PERMISSIONS.AUDIT_VIEW,
];

const SUPERVISOR_PERMISSIONS: string[] = Array.from(
  new Set([
    ...CASHIER_PERMISSIONS,
    ...INVENTORY_PERMISSIONS.filter((p) => p !== PERMISSIONS.PRODUCT_MANAGE),
    PERMISSIONS.SALE_VOID,
    PERMISSIONS.REPORT_FINANCIAL,
    PERMISSIONS.DASHBOARD_FINANCIAL,
  ]),
);

const MANAGER_PERMISSIONS: string[] = Array.from(
  new Set([
    ...CASHIER_PERMISSIONS,
    ...INVENTORY_PERMISSIONS,
    ...FINANCE_PERMISSIONS,
    PERMISSIONS.SALE_VOID,
    PERMISSIONS.STUDENT_MANAGE,
    PERMISSIONS.PARENT_MANAGE,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
  ]),
);

export const ROLE_PERMISSIONS: Record<RoleKey, string[]> = {
  [ROLES.SUPER_ADMIN]: Array.from(
    new Set([
      ...MANAGER_PERMISSIONS,
      ...Object.values(PERMISSIONS),
    ]),
  ),
  [ROLES.MANAGER]: MANAGER_PERMISSIONS,
  [ROLES.SUPERVISOR]: SUPERVISOR_PERMISSIONS,
  [ROLES.CASHIER]: CASHIER_PERMISSIONS,
  [ROLES.INVENTORY]: INVENTORY_PERMISSIONS,
  [ROLES.FINANCE]: FINANCE_PERMISSIONS,
  // Owner / Management: oversee seluruh toko. Master data (produk, santri,
  // supplier) boleh dikelola karena managing data adalah tugas manajemen —
  // tanpa ini halaman Produk dan Santri tidak muncul sama sekali di menu
  // Master Data. Jurnal keuangan, void penjualan, pengaturan, dan manajemen
  // pengguna tetap tidak dibuka supaya peran ini tetap bukan super admin.
  [ROLES.OWNER]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.DASHBOARD_FINANCIAL,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.REPORT_FINANCIAL,
    PERMISSIONS.SALE_VIEW,
    PERMISSIONS.PRODUCT_VIEW,
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.SUPPLIER_MANAGE,
    PERMISSIONS.INVENTORY_VIEW,
    PERMISSIONS.STUDENT_VIEW,
    PERMISSIONS.STUDENT_MANAGE,
    PERMISSIONS.PARENT_MANAGE,
    PERMISSIONS.WALLET_VIEW,
    PERMISSIONS.FINANCE_VIEW,
    PERMISSIONS.AUDIT_VIEW,
  ],
  [ROLES.PARENT]: [PERMISSIONS.WALLET_VIEW_OWN, PERMISSIONS.STUDENT_VIEW],
  [ROLES.STUDENT]: [PERMISSIONS.WALLET_VIEW_OWN],
};

export const ROLE_LABELS: Record<RoleKey, string> = {
  [ROLES.SUPER_ADMIN]: "Super Admin",
  [ROLES.MANAGER]: "Manager 6Mart",
  [ROLES.SUPERVISOR]: "Supervisor",
  [ROLES.CASHIER]: "Kasir",
  [ROLES.INVENTORY]: "Staff Inventory",
  [ROLES.FINANCE]: "Finance",
  [ROLES.OWNER]: "Owner / Management",
  [ROLES.PARENT]: "Wali Santri",
  [ROLES.STUDENT]: "Santri",
};

export function isRoleKey(value: string): value is RoleKey {
  return Object.values(ROLES).includes(value as RoleKey);
}

export function permissionsForRole(roleKey: string): string[] {
  if (!isRoleKey(roleKey)) return [];
  return ROLE_PERMISSIONS[roleKey];
}

export function roleHasPermission(roleKey: string, permission: string): boolean {
  return permissionsForRole(roleKey).includes(permission);
}

export function canAny(roleKey: string, permissions: string[]): boolean {
  const owned = permissionsForRole(roleKey);
  return permissions.some((p) => owned.includes(p));
}
