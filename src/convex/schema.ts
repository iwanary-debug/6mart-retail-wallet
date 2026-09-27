import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

/** Buang satu kunci dari object (dipakai untuk `authTables`). */
function omit<T extends object, K extends keyof T>(source: T, key: K): Omit<T, K> {
  const { [key]: _removed, ...rest } = source;
  void _removed;
  return rest;
}

/**
 * 6Mart — Master schema.
 *
 * Money convention: seluruh nilai uang disimpan sebagai INTEGER rupiah penuh
 * (tidak ada pecahan sen di ekosistem 6Mart). Tidak ada floating point.
 * Quantity boleh pecahan (mis. 1.5 kg) dan disimpan sebagai number.
 */

const timestamps = {
  createdAt: v.number(),
  updatedAt: v.optional(v.number()),
};

export default defineSchema({
  // ---------------------------------------------------------------- RBAC ----
  permissions: defineTable({
    key: v.string(), // "sale.create"
    module: v.string(),
    description: v.string(),
    createdAt: v.number(),
  }).index("by_key", ["key"]),

  roles: defineTable({
    key: v.string(), // "cashier"
    name: v.string(),
    description: v.string(),
    permissions: v.array(v.string()),
    isSystem: v.optional(v.boolean()),
    ...timestamps,
  }).index("by_key", ["key"]),

  // Profile staff. `subject` = id dari authUsers (Convex Auth), null untuk akun demo lokal.
  // Tabel `users` adalah tabel milik Convex Auth yang DIPERLUAS dengan field
  // staff 6Mart. Field milik auth (email, name, image, phone, ...) tetap
  // optional agar dokumen yang dibuat `createAccount` valid, sementara field
  // 6Mart dibuat optional dengan nilai default yang di-resolve di sisi server
  // (lihat `lib/guards.ts` -> `toSessionUser`).
  users: defineTable({
    // --- field bawaan Convex Auth ---
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // --- field staff 6Mart ---
    subject: v.optional(v.string()),
    roleKey: v.optional(v.string()),
    roleLabel: v.optional(v.string()),
    permissions: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
    lastLoginAt: v.optional(v.number()),
    failedLoginCount: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
    // `createdAt` opsional khusus tabel ini: Convex Auth membuat dokumen
    // pengguna tanpa field timestamp.
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_subject", ["subject"])
    .index("by_role", ["roleKey"]),

  // ------------------------------------------------------- MASTER DATA ----
  parents: defineTable({
    code: v.string(),
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  students: defineTable({
    nis: v.string(),
    name: v.string(),
    gender: v.union(v.literal("L"), v.literal("P")),
    className: v.string(),
    dormitory: v.optional(v.string()),
    room: v.optional(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE"), v.literal("GRADUATED")),
    externalRef: v.optional(v.string()), // id dari PIAT 6 Super App
    ...timestamps,
  })
    .index("by_nis", ["nis"])
    .index("by_name", ["name"])
    .index("by_status", ["status"]),

  parentStudents: defineTable({
    parentId: v.id("parents"),
    studentId: v.id("students"),
    relation: v.string(), // "AYAH" | "IBU" | "WALI"
    isPrimary: v.boolean(),
    ...timestamps,
  })
    .index("by_parent", ["parentId"])
    .index("by_student", ["studentId"]),

  // Kartu RFID = payment instrument SAJA. Saldo selalu di wallets.
  studentCards: defineTable({
    code: v.string(),
    studentId: v.id("students"),
    rfidUid: v.optional(v.string()),
    qrToken: v.string(),
    status: v.union(
      v.literal("ACTIVE"),
      v.literal("BLOCKED"),
      v.literal("LOST"),
      v.literal("REPLACED"),
    ),
    issuedAt: v.number(),
    blockedAt: v.optional(v.number()),
    replacedByCardId: v.optional(v.id("studentCards")),
    replacedByCardCode: v.optional(v.string()),
    note: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_rfid", ["rfidUid"])
    .index("by_qr", ["qrToken"])
    .index("by_student", ["studentId"])
    .index("by_status", ["status"]),

  categories: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    ...timestamps,
  }).index("by_name", ["name"]),

  suppliers: defineTable({
    code: v.string(),
    name: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
    status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
    ...timestamps,
  })
    .index("by_code", ["code"]),

  products: defineTable({
    sku: v.string(),
    barcode: v.optional(v.string()),
    name: v.string(),
    categoryId: v.optional(v.id("categories")),
    supplierId: v.optional(v.id("suppliers")),
    unit: v.string(), // pcs, bungkus, kg, ...
    purchasePrice: v.number(), // rupiah, integer
    sellingPrice: v.number(), // rupiah, integer
    minStock: v.number(),
    // Denormalisasi stock + valuation agar POS tidak perlu join berat.
    stock: v.number(),
    averageCost: v.number(), // rupiah per unit (bisa pecahan sen)
    isActive: v.boolean(),
    trackInventory: v.boolean(),
    ...timestamps,
  })
    .index("by_sku", ["sku"])
    .index("by_barcode", ["barcode"])
    .index("by_name", ["name"])
    .index("by_active", ["isActive"]),

  // ------------------------------------------------------------- WALLET ----
  wallets: defineTable({
    studentId: v.id("students"),
    code: v.string(),
    currentBalance: v.number(), // rupiah integer
    status: v.union(v.literal("ACTIVE"), v.literal("FROZEN"), v.literal("CLOSED")),
    version: v.number(), // optimistic concurrency guard
    lastTransactionAt: v.optional(v.number()),
    ...timestamps,
  })
    .index("by_student", ["studentId"])
    .index("by_code", ["code"]),

  walletLedger: defineTable({
    walletId: v.id("wallets"),
    studentId: v.id("students"),
    transactionId: v.string(),
    type: v.union(
      v.literal("TOPUP"),
      v.literal("PURCHASE"),
      v.literal("WITHDRAWAL"),
      v.literal("REFUND"),
      v.literal("ADJUSTMENT"),
      v.literal("LAUNDRY"),
      v.literal("BARBERSHOP"),
      v.literal("JASTIP"),
      v.literal("PPOB"),
    ),
    direction: v.union(v.literal("CREDIT"), v.literal("DEBIT")),
    amount: v.number(), // selalu positif
    balanceBefore: v.number(),
    balanceAfter: v.number(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    note: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_wallet", ["walletId"])
    .index("by_student", ["studentId"])
    .index("by_type", ["type"])
    .index("by_reference", ["referenceType", "referenceId"])
    .index("by_created", ["createdAt"]),

  walletLimits: defineTable({
    studentId: v.id("students"),
    dailyDebitLimit: v.number(),
    dailyTopupLimit: v.number(),
    maxBalance: v.optional(v.number()),
    minBalance: v.number(),
    withdrawalEnabled: v.boolean(),
    requiresApprovalAbove: v.optional(v.number()),
    ...timestamps,
  }).index("by_student", ["studentId"]),

  // ---------------------------------------------------------- INVENTORY ----
  purchases: defineTable({
    code: v.string(),
    invoiceNumber: v.optional(v.string()),
    supplierId: v.optional(v.id("suppliers")),
    totalAmount: v.number(),
    paidAmount: v.number(),
    paymentMethod: v.union(v.literal("CASH"), v.literal("TRANSFER"), v.literal("CREDIT")),
    status: v.union(
      v.literal("DRAFT"),
      v.literal("RECEIVED"),
      v.literal("CANCELLED"),
    ),
    receivedBy: v.optional(v.string()),
    receivedAt: v.optional(v.number()),
    note: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  purchaseItems: defineTable({
    purchaseId: v.id("purchases"),
    productId: v.id("products"),
    quantity: v.number(),
    unitCost: v.number(),
    subtotal: v.number(),
    ...timestamps,
  })
    .index("by_purchase", ["purchaseId"])
    .index("by_product", ["productId"]),

  inventoryMovements: defineTable({
    productId: v.id("products"),
    type: v.union(
      v.literal("PURCHASE"),
      v.literal("SALE"),
      v.literal("RETURN"),
      v.literal("ADJUSTMENT_IN"),
      v.literal("ADJUSTMENT_OUT"),
      v.literal("DAMAGE"),
      v.literal("LOSS"),
    ),
    quantity: v.number(), // positif
    unitCostBefore: v.number(),
    unitCostAfter: v.number(),
    stockBefore: v.number(),
    stockAfter: v.number(),
    referenceType: v.string(),
    referenceId: v.string(),
    note: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_product", ["productId"])
    .index("by_type", ["type"])
    .index("by_reference", ["referenceType", "referenceId"])
    .index("by_created", ["createdAt"]),

  // --------------------------------------------------------------- POS ----
  cashierShifts: defineTable({
    code: v.string(),
    cashierId: v.id("users"),
    cashierName: v.string(),
    openingCash: v.number(),
    cashSales: v.number(),
    cashIn: v.number(),
    cashOut: v.number(),
    cashExpenses: v.number(),
    expectedCash: v.number(),
    actualCash: v.optional(v.number()),
    difference: v.optional(v.number()),
    openedAt: v.number(),
    closedAt: v.optional(v.number()),
    status: v.union(v.literal("OPEN"), v.literal("CLOSED")),
    note: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_cashier", ["cashierId"])
    .index("by_status", ["status"]),

  cashTransactions: defineTable({
    shiftId: v.optional(v.id("cashierShifts")),
    type: v.union(
      v.literal("SALE"),
      v.literal("WITHDRAWAL"),
      v.literal("EXPENSE"),
      v.literal("CASH_IN"),
      v.literal("CASH_OUT"),
      v.literal("OPENING_BALANCE"),
      v.literal("SHIFT_ADJUSTMENT"),
    ),
    direction: v.union(v.literal("IN"), v.literal("OUT")),
    amount: v.number(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    note: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_shift", ["shiftId"])
    .index("by_type", ["type"])
    .index("by_created", ["createdAt"]),

  sales: defineTable({
    code: v.string(),
    invoiceNumber: v.string(),
    studentId: v.optional(v.id("students")),
    studentName: v.optional(v.string()),
    cashierId: v.id("users"),
    cashierName: v.string(),
    shiftId: v.optional(v.id("cashierShifts")),
    channel: v.union(
      v.literal("COUNTER"),
      v.literal("SELF_SERVICE"),
      v.literal("SERVICE"),
    ),
    paymentMethod: v.union(
      v.literal("CASH"),
      v.literal("WALLET"),
      v.literal("MIXED"),
    ),
    identificationMethod: v.optional(
      v.union(v.literal("RFID"), v.literal("QR"), v.literal("NIS"), v.literal("MANUAL")),
    ),
    subtotal: v.number(),
    discount: v.number(),
    serviceTotal: v.number(), // laundry/barbershop/jastip/ppob
    total: v.number(),
    paidAmount: v.number(),
    changeAmount: v.number(),
    costTotal: v.number(), // HPP
    status: v.union(
      v.literal("COMPLETED"),
      v.literal("VOID"),
      v.literal("REFUNDED"),
    ),
    receiptNote: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_student", ["studentId"])
    .index("by_cashier", ["cashierId"])
    .index("by_shift", ["shiftId"])
    .index("by_created", ["createdAt"])
    .index("by_status", ["status"]),

  saleItems: defineTable({
    saleId: v.id("sales"),
    productId: v.optional(v.id("products")),
    name: v.string(),
    quantity: v.number(),
    unit: v.string(),
    sellingPrice: v.number(),
    discount: v.number(),
    costPrice: v.number(),
    subtotal: v.number(),
    cogs: v.number(),
    serviceType: v.optional(v.string()), // LAUNDRY | BARBERSHOP | JASTIP | PPOB
    serviceRefId: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_sale", ["saleId"])
    .index("by_product", ["productId"]),

  payments: defineTable({
    saleId: v.id("sales"),
    method: v.union(
      v.literal("CASH"),
      v.literal("WALLET"),
      v.literal("TOPUP"),
      v.literal("VIRTUAL_ACCOUNT"),
      v.literal("PAYMENT_GATEWAY"),
    ),
    amount: v.number(),
    reference: v.optional(v.string()),
    walletLedgerId: v.optional(v.id("walletLedger")),
    status: v.union(v.literal("SUCCESS"), v.literal("PENDING"), v.literal("FAILED")),
    ...timestamps,
  }).index("by_sale", ["saleId"]),

  refunds: defineTable({
    code: v.string(),
    saleId: v.id("sales"),
    amount: v.number(),
    method: v.union(v.literal("CASH"), v.literal("WALLET")),
    reason: v.string(),
    processedBy: v.optional(v.string()),
    processedByName: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_sale", ["saleId"])
    .index("by_code", ["code"]),

  // -------------------------------------------------------- ACCOUNTING ----
  chartOfAccounts: defineTable({
    code: v.string(),
    name: v.string(),
    type: v.union(
      v.literal("ASSET"),
      v.literal("LIABILITY"),
      v.literal("EQUITY"),
      v.literal("REVENUE"),
      v.literal("COGS"),
      v.literal("EXPENSE"),
    ),
    normalBalance: v.union(v.literal("DEBIT"), v.literal("CREDIT")),
    isActive: v.boolean(),
    description: v.optional(v.string()),
    ...timestamps,
  }).index("by_code", ["code"]),

  journalEntries: defineTable({
    code: v.string(),
    entryDate: v.number(),
    description: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    source: v.union(
      v.literal("SALE"),
      v.literal("TOPUP"),
      v.literal("WITHDRAWAL"),
      v.literal("REFUND"),
      v.literal("PURCHASE"),
      v.literal("EXPENSE"),
      v.literal("SERVICE"),
      v.literal("PPOB"),
      v.literal("MANUAL"),
      v.literal("OPENING"),
    ),
    totalDebit: v.number(),
    totalCredit: v.number(),
    status: v.union(v.literal("POSTED"), v.literal("REVERSED")),
    reversedBy: v.optional(v.id("journalEntries")),
    createdBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_date", ["entryDate"])
    .index("by_reference", ["referenceType", "referenceId"])
    .index("by_source", ["source"]),

  journalLines: defineTable({
    journalEntryId: v.id("journalEntries"),
    accountCode: v.string(),
    accountName: v.string(),
    debit: v.number(),
    credit: v.number(),
    memo: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_entry", ["journalEntryId"])
    .index("by_account", ["accountCode"]),

  expenses: defineTable({
    code: v.string(),
    expenseDate: v.number(),
    category: v.string(), // kode akun beban
    description: v.string(),
    amount: v.number(),
    paymentMethod: v.union(v.literal("CASH"), v.literal("TRANSFER")),
    shiftId: v.optional(v.id("cashierShifts")),
    recordedBy: v.optional(v.string()),
    recordedByName: v.optional(v.string()),
    journalEntryId: v.optional(v.id("journalEntries")),
    ...timestamps,
  })
    .index("by_date", ["expenseDate"])
    .index("by_category", ["category"]),

  // ----------------------------------------------------------- LAYANAN ----
  laundryOrders: defineTable({
    code: v.string(),
    customerType: v.union(v.literal("STUDENT"), v.literal("WALK_IN")),
    customerStudentId: v.optional(v.id("students")),
    customerName: v.string(),
    serviceType: v.string(), // CUCI_SATU, CUCI_LIPAT, SETrika, ...
    pricePerKg: v.number(),
    weightKg: v.number(),
    totalAmount: v.number(),
    paidAmount: v.number(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("PROCESSING"),
      v.literal("READY"),
      v.literal("COMPLETED"),
      v.literal("CANCELLED"),
    ),
    saleId: v.optional(v.id("sales")),
    dueAt: v.optional(v.number()),
    note: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"])
    .index("by_student", ["customerStudentId"]),

  laundryItems: defineTable({
    orderId: v.id("laundryOrders"),
    name: v.string(),
    quantity: v.number(),
    price: v.number(),
    subtotal: v.number(),
    note: v.optional(v.string()),
    ...timestamps,
  }).index("by_order", ["orderId"]),

  barbershopServices: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    durationMinutes: v.number(),
    isActive: v.boolean(),
    ...timestamps,
  }).index("by_active", ["isActive"]),

  barbershopBookings: defineTable({
    code: v.string(),
    serviceId: v.id("barbershopServices"),
    customerType: v.union(v.literal("STUDENT"), v.literal("WALK_IN")),
    customerStudentId: v.optional(v.id("students")),
    customerName: v.string(),
    barberName: v.string(),
    queueNumber: v.number(),
    scheduledAt: v.number(),
    price: v.number(),
    status: v.union(
      v.literal("WAITING"),
      v.literal("IN_PROGRESS"),
      v.literal("DONE"),
      v.literal("CANCELLED"),
      v.literal("NO_SHOW"),
    ),
    saleId: v.optional(v.id("sales")),
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"])
    .index("by_scheduled", ["scheduledAt"]),

  jastipOrders: defineTable({
    code: v.string(),
    customerType: v.union(v.literal("STUDENT"), v.literal("WALK_IN")),
    customerStudentId: v.optional(v.id("students")),
    customerName: v.string(),
    buyerName: v.string(),
    itemsTotal: v.number(),
    serviceFee: v.number(),
    deliveryFee: v.number(),
    totalAmount: v.number(),
    paidAmount: v.number(),
    destination: v.string(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("PICKED_UP"),
      v.literal("IN_DELIVERY"),
      v.literal("DELIVERED"),
      v.literal("CANCELLED"),
    ),
    saleId: v.optional(v.id("sales")),
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"]),

  jastipItems: defineTable({
    orderId: v.id("jastipOrders"),
    name: v.string(),
    quantity: v.number(),
    price: v.number(),
    note: v.optional(v.string()),
    ...timestamps,
  }).index("by_order", ["orderId"]),

  // -------------------------------------------------------------- PPOB ----
  ppobProducts: defineTable({
    code: v.string(),
    name: v.string(),
    category: v.union(
      v.literal("PULSA"),
      v.literal("PLN"),
      v.literal("DATA"),
      v.literal("GAME"),
      v.literal("E_WALLET"),
      v.literal("OTHER"),
    ),
    price: v.number(), // rupiah
    costPrice: v.number(), // rupiah (harga beli dari provider)
    isActive: v.boolean(),
    ...timestamps,
  })
    .index("by_category", ["category"])
    .index("by_active", ["isActive"]),

  ppobTransactions: defineTable({
    code: v.string(),
    productId: v.optional(v.id("ppobProducts")),
    productName: v.string(),
    category: v.string(),
    customerStudentId: v.optional(v.id("students")),
    customerName: v.string(),
    customerIdentifier: v.string(), // nomor HP / nomor PLN
    price: v.number(),
    costPrice: v.number(),
    margin: v.number(),
    provider: v.string(), // "SANDBOX" | nama provider nyata
    providerReference: v.optional(v.string()),
    status: v.union(
      v.literal("PENDING"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
      v.literal("REFUNDED"),
    ),
    message: v.optional(v.string()),
    saleId: v.optional(v.id("sales")),
    idempotencyKey: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_status", ["status"])
    .index("by_student", ["customerStudentId"])
    .index("by_created", ["createdAt"]),

  // Top up via payment provider / virtual account (abstraction ready).
  walletTopups: defineTable({
    code: v.string(),
    studentId: v.id("students"),
    walletId: v.id("wallets"),
    amount: v.number(),
    method: v.union(
      v.literal("MANUAL"),
      v.literal("CASH"),
      v.literal("BANK_TRANSFER"),
      v.literal("VIRTUAL_ACCOUNT"),
      v.literal("PAYMENT_GATEWAY"),
    ),
    status: v.union(
      v.literal("PENDING"),
      v.literal("SUCCESS"),
      v.literal("FAILED"),
    ),
    provider: v.optional(v.string()),
    providerReference: v.optional(v.string()),
    virtualAccountNumber: v.optional(v.string()),
    paidAt: v.optional(v.number()),
    performedBy: v.optional(v.string()),
    performedByName: v.optional(v.string()),
    journalEntryId: v.optional(v.id("journalEntries")),
    idempotencyKey: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_student", ["studentId"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  walletWithdrawals: defineTable({
    code: v.string(),
    studentId: v.id("students"),
    walletId: v.id("wallets"),
    amount: v.number(),
    status: v.union(
      v.literal("PENDING"),
      v.literal("APPROVED"),
      v.literal("REJECTED"),
      v.literal("COMPLETED"),
    ),
    reason: v.optional(v.string()),
    shiftId: v.optional(v.id("cashierShifts")),
    requestedBy: v.optional(v.string()),
    approvedBy: v.optional(v.string()),
    approvedByName: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    journalEntryId: v.optional(v.id("journalEntries")),
    idempotencyKey: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_code", ["code"])
    .index("by_student", ["studentId"])
    .index("by_status", ["status"]),

  // ----------------------------------------------- PLATFORM / OBSERVABILITY ----
  settings: defineTable({
    key: v.string(),
    value: v.string(),
    group: v.string(),
    label: v.string(),
    valueType: v.union(v.literal("STRING"), v.literal("NUMBER"), v.literal("BOOLEAN")),
    ...timestamps,
  }).index("by_key", ["key"]),

  auditLogs: defineTable({
    userId: v.optional(v.id("users")),
    userName: v.string(),
    userRole: v.optional(v.string()),
    action: v.string(),
    entityType: v.string(),
    entityId: v.optional(v.string()),
    oldValue: v.optional(v.string()),
    newValue: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    note: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_created", ["createdAt"])
    .index("by_user", ["userId"])
    .index("by_action", ["action"])
    .index("by_entity", ["entityType"]),

  notifications: defineTable({
    channel: v.union(v.literal("IN_APP"), v.literal("EMAIL"), v.literal("WHATSAPP")),
    recipientType: v.union(
      v.literal("USER"),
      v.literal("STUDENT"),
      v.literal("PARENT"),
      v.literal("SYSTEM"),
    ),
    recipientId: v.optional(v.string()),
    title: v.string(),
    message: v.string(),
    severity: v.union(
      v.literal("INFO"),
      v.literal("SUCCESS"),
      v.literal("WARNING"),
      v.literal("ERROR"),
    ),
    isRead: v.boolean(),
    ...timestamps,
  })
    .index("by_recipient", ["recipientType", "recipientId"])
    .index("by_created", ["createdAt"]),

  /**
   * Idempotency keys untuk mencegah double-processing (blueprint §14, §38).
   * Key unik per scope; response disimpan agar request ulang mengembalikan
   * hasil yang sama, bukan menjalankan transaksi dua kali.
   */
  idempotencyKeys: defineTable({
    key: v.string(),
    scope: v.string(),
    requestHash: v.string(),
    status: v.union(v.literal("IN_PROGRESS"), v.literal("COMPLETED"), v.literal("FAILED")),
    response: v.optional(v.string()),
    createdBy: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_key_scope", ["key", "scope"]),

  /**
   * Idempotency untuk webhook provider (VA / payment gateway / PPOB).
   */
  webhookEvents: defineTable({
    provider: v.string(),
    eventId: v.string(),
    eventType: v.string(),
    payload: v.string(),
    status: v.union(
      v.literal("RECEIVED"),
      v.literal("PROCESSED"),
      v.literal("DUPLICATE"),
      v.literal("FAILED"),
    ),
    processedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_provider_event", ["provider", "eventId"]),

  // Performance instrumentation untuk fast checkout (blueprint §52).
  performanceMetrics: defineTable({
    operation: v.string(), // checkout, walletLookup, payment, stockLookup
    durationMs: v.number(),
    success: v.boolean(),
    cashierId: v.optional(v.id("users")),
    detail: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_operation", ["operation"])
    .index("by_created", ["createdAt"]),

  // PIAT 6 Super App integration layer (blueprint §48).
  integrationLogs: defineTable({
    direction: v.union(v.literal("INBOUND"), v.literal("OUTBOUND")),
    endpoint: v.string(),
    operation: v.string(),
    status: v.union(v.literal("SUCCESS"), v.literal("FAILED")),
    requestPayload: v.optional(v.string()),
    responsePayload: v.optional(v.string()),
    error: v.optional(v.string()),
    durationMs: v.number(),
    ...timestamps,
  })
    .index("by_created", ["createdAt"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    ...timestamps,
  })
    .index("by_token", ["token"])
    .index("by_user", ["userId"]),

  // ------------------------------------------------ CONVEX AUTH BUILT-IN ----
  // Tabel milik @convex-dev/auth (sesi, akun tertaut, refresh token, dll).
  // `users` TIDAK di-spread karena tabel tersebut sudah didefinisikan di atas
  // dalam bentuk yang sudah diperluas dengan field staff 6Mart.
  ...omit(authTables, "users"),
});
