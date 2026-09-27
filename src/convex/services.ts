import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertPermission,
  BusinessRuleError,
  NotFoundError,
  requireUser,
  writeAudit,
} from "./lib/guards";
import {
  getSettings,
  requireString,
} from "./lib/helpers";
import { mutateWallet, postJournal } from "./lib/walletEngine";
import { PERMISSIONS } from "../lib/rbac";
import * as accounting from "../lib/accounting";
import { formatDateCode } from "../lib/codes";
import { assertRupiah, roundToSen } from "../lib/money";

// ============================================================== LAUNDRY ====

export const listLaundry = query({
  args: { status: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_LAUNDRY);
    let rows = await ctx.db.query("laundryOrders").collect();
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return {
      total: rows.length,
      revenue: roundToSen(
        rows.filter((r) => r.status === "COMPLETED").reduce((s, r) => s + r.totalAmount, 0),
      ),
      items: rows.slice(0, Math.min(args.limit ?? 50, 200)),
    };
  },
});

export const createLaundryOrder = mutation({
  args: {
    customerType: v.union(v.literal("STUDENT"), v.literal("WALK_IN")),
    customerStudentId: v.optional(v.id("students")),
    customerName: v.string(),
    serviceType: v.string(),
    pricePerKg: v.number(),
    weightKg: v.number(),
    note: v.optional(v.string()),
    dueAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_LAUNDRY);
    const serviceType = requireString(args.serviceType, "Jenis layanan", 60);
    if (args.weightKg <= 0) throw new BusinessRuleError("Berat harus lebih dari 0");
    assertRupiah(args.pricePerKg, "Harga per kg");

    const totalAmount = roundToSen(args.weightKg * args.pricePerKg);
    if (totalAmount <= 0) throw new BusinessRuleError("Total laundry tidak valid");

    const now = Date.now();
    const count = await ctx.db.query("laundryOrders").collect();
    const code = `LRY-${formatDateCode(now)}-${String(count.length + 1).padStart(4, "0")}`;
    const orderId = await ctx.db.insert("laundryOrders", {
      code,
      customerType: args.customerType,
      customerStudentId: args.customerStudentId,
      customerName: requireString(args.customerName, "Nama pelanggan", 120),
      serviceType,
      pricePerKg: args.pricePerKg,
      weightKg: args.weightKg,
      totalAmount,
      paidAmount: 0,
      status: "PENDING",
      dueAt: args.dueAt,
      note: args.note,
      createdAt: now,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      user,
      action: "CREATE_LAUNDRY_ORDER",
      entityType: "laundryOrder",
      entityId: orderId,
      newValue: { code, totalAmount, weightKg: args.weightKg },
    });
    return { orderId, code, totalAmount };
  },
});

export const addLaundryItem = mutation({
  args: {
    orderId: v.id("laundryOrders"),
    name: v.string(),
    quantity: v.number(),
    price: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_LAUNDRY);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new NotFoundError("Order laundry tidak ditemukan");
    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      throw new BusinessRuleError("Order sudah selesai");
    }
    if (args.quantity <= 0) throw new BusinessRuleError("Quantity harus lebih dari 0");

    const subtotal = roundToSen(args.quantity * args.price);
    await ctx.db.insert("laundryItems", {
      orderId: args.orderId,
      name: requireString(args.name, "Nama item", 100),
      quantity: args.quantity,
      price: args.price,
      subtotal,
      createdAt: Date.now(),
    });
    await ctx.db.patch(args.orderId, {
      totalAmount: roundToSen(order.totalAmount + subtotal),
      updatedAt: Date.now(),
    });
    return { subtotal };
  },
});

export const updateLaundryStatus = mutation({
  args: {
    orderId: v.id("laundryOrders"),
    status: v.union(
      v.literal("PENDING"),
      v.literal("PROCESSING"),
      v.literal("READY"),
      v.literal("COMPLETED"),
      v.literal("CANCELLED"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_LAUNDRY);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new NotFoundError("Order tidak ditemukan");
    await ctx.db.patch(args.orderId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      user,
      action: "UPDATE_LAUNDRY_STATUS",
      entityType: "laundryOrder",
      entityId: args.orderId,
      oldValue: { status: order.status },
      newValue: { status: args.status },
    });
    return { ok: true };
  },
});

/** Pembayaran laundry → terjual ke wallet (opsional) atau tunai. */
export const payLaundry = mutation({
  args: {
    orderId: v.id("laundryOrders"),
    method: v.union(v.literal("WALLET"), v.literal("CASH")),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_LAUNDRY);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new NotFoundError("Order tidak ditemukan");
    if (order.saleId) throw new BusinessRuleError("Order laundry sudah dibayar");
    if (order.totalAmount <= 0) throw new BusinessRuleError("Total tidak valid");

    const code = order.code;
    const now = Date.now();

    if (args.method === "WALLET") {
      if (!order.customerStudentId) {
        throw new BusinessRuleError("Santri belum ditentukan untuk pembayaran wallet");
      }
      await mutateWallet(ctx, user, {
        studentId: order.customerStudentId,
        type: "LAUNDRY",
        amount: order.totalAmount,
        note: `Laundry ${code}`,
        referenceType: "laundryOrder",
        referenceId: code,
        idempotencyKey: args.idempotencyKey,
      });
    }

    const saleId = await ctx.db.insert("sales", {
      code: `SALE-${code}`,
      invoiceNumber: `SALE-${code}`,
      studentId: order.customerStudentId,
      studentName: order.customerName,
      cashierId: user.id,
      cashierName: user.name,
      channel: "SERVICE",
      paymentMethod: args.method,
      identificationMethod: args.method === "WALLET" ? "MANUAL" : undefined,
      subtotal: order.totalAmount,
      discount: 0,
      serviceTotal: order.totalAmount,
      total: order.totalAmount,
      paidAmount: order.totalAmount,
      changeAmount: 0,
      costTotal: 0,
      status: "COMPLETED",
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
    });

    await ctx.db.insert("saleItems", {
      saleId,
      name: `Laundry ${order.serviceType} (${order.weightKg} kg)`,
      quantity: 1,
      unit: "order",
      sellingPrice: order.totalAmount,
      discount: 0,
      costPrice: 0,
      subtotal: order.totalAmount,
      cogs: 0,
      serviceType: "LAUNDRY",
      serviceRefId: code,
      createdAt: now,
    });

    await ctx.db.insert("payments", {
      saleId,
      method: args.method,
      amount: order.totalAmount,
      status: "SUCCESS",
      createdAt: now,
    });

    if (args.method === "CASH") {
      await ctx.db.insert("cashTransactions", {
        type: "SALE",
        direction: "IN",
        amount: order.totalAmount,
        referenceType: "laundryOrder",
        referenceId: code,
        createdBy: user.id,
        createdAt: now,
      });
    }

    await postJournal(ctx, {
      entryDate: now,
      description: `Pendapatan laundry ${code}`,
      source: "SERVICE",
      referenceType: "laundryOrder",
      referenceId: code,
      lines:
        args.method === "WALLET"
          ? accounting.serviceWalletJournal(accounting.COA.LAUNDRY_REVENUE, order.totalAmount)
          : accounting.serviceCashJournal(accounting.COA.LAUNDRY_REVENUE, order.totalAmount),
      user,
    });

    await ctx.db.patch(args.orderId, {
      status: "COMPLETED",
      paidAmount: order.totalAmount,
      saleId,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      user,
      action: "PAY_LAUNDRY",
      entityType: "laundryOrder",
      entityId: args.orderId,
      newValue: { code, amount: order.totalAmount, method: args.method },
    });

    return { saleId, code, total: order.totalAmount, method: args.method };
  },
});

// ========================================================== BARBERSHOP ====

export const listBarbershopServices = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await ctx.db.query("barbershopServices").collect();
  },
});

export const createBarbershopService = mutation({
  args: {
    name: v.string(),
    price: v.number(),
    durationMinutes: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_BARBERSHOP);
    assertRupiah(args.price, "Harga");
    if (args.price <= 0) throw new BusinessRuleError("Harga harus lebih dari 0");
    const now = Date.now();
    const id = await ctx.db.insert("barbershopServices", {
      name: requireString(args.name, "Nama layanan", 100),
      description: args.description,
      price: args.price,
      durationMinutes: Math.max(5, Math.round(args.durationMinutes)),
      isActive: true,
      createdAt: now,
    });
    return { id };
  },
});

export const listBookings = query({
  args: { status: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_BARBERSHOP);
    let rows = await ctx.db.query("barbershopBookings").collect();
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    rows.sort((a, b) => a.scheduledAt - b.scheduledAt);
    const page = rows.slice(0, Math.min(args.limit ?? 50, 200));
    const enriched = await Promise.all(
      page.map(async (b) => {
        const service = await ctx.db.get(b.serviceId);
        return { ...b, serviceName: service?.name ?? "-", servicePrice: service?.price ?? b.price };
      }),
    );
    return { total: rows.length, items: enriched };
  },
});

export const createBooking = mutation({
  args: {
    serviceId: v.id("barbershopServices"),
    customerType: v.union(v.literal("STUDENT"), v.literal("WALK_IN")),
    customerStudentId: v.optional(v.id("students")),
    customerName: v.string(),
    barberName: v.string(),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_BARBERSHOP);
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new NotFoundError("Layanan tidak ditemukan");
    if (!service.isActive) throw new BusinessRuleError("Layanan tidak aktif");

    const now = Date.now();
    const scheduledAt = args.scheduledAt ?? now;

    // Nomor antrean = jumlah booking aktif pada hari yang sama + 1.
    const sameDay = await ctx.db
      .query("barbershopBookings")
      .filter(
        (q) =>
          q.gte(q.field("scheduledAt"), new Date(scheduledAt).setHours(0, 0, 0, 0)) &&
          q.lt(q.field("scheduledAt"), new Date(scheduledAt).setHours(0, 0, 0, 0) + 86_400_000) &&
          q.neq(q.field("status"), "CANCELLED"),
      )
      .collect();

    const count = await ctx.db.query("barbershopBookings").collect();
    const code = `BRS-${formatDateCode(now)}-${String(count.length + 1).padStart(4, "0")}`;

    const id = await ctx.db.insert("barbershopBookings", {
      code,
      serviceId: args.serviceId,
      customerType: args.customerType,
      customerStudentId: args.customerStudentId,
      customerName: requireString(args.customerName, "Nama pelanggan", 120),
      barberName: requireString(args.barberName, "Nama barber", 80),
      queueNumber: sameDay.length + 1,
      scheduledAt,
      price: service.price,
      status: "WAITING",
      createdAt: now,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      user,
      action: "CREATE_BOOKING",
      entityType: "barbershopBooking",
      entityId: id,
      newValue: { code, service: service.name, price: service.price },
    });
    return { id, code, queueNumber: sameDay.length + 1 };
  },
});

export const updateBookingStatus = mutation({
  args: {
    bookingId: v.id("barbershopBookings"),
    status: v.union(
      v.literal("WAITING"),
      v.literal("IN_PROGRESS"),
      v.literal("DONE"),
      v.literal("CANCELLED"),
      v.literal("NO_SHOW"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_BARBERSHOP);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new NotFoundError("Booking tidak ditemukan");
    if (booking.saleId && args.status !== "CANCELLED") {
      throw new BusinessRuleError("Booking sudah dibayar");
    }
    await ctx.db.patch(args.bookingId, { status: args.status, updatedAt: Date.now() });
    await writeAudit(ctx, {
      user,
      action: "UPDATE_BOOKING_STATUS",
      entityType: "barbershopBooking",
      entityId: args.bookingId,
      oldValue: { status: booking.status },
      newValue: { status: args.status },
    });
    return { ok: true };
  },
});

export const payBooking = mutation({
  args: {
    bookingId: v.id("barbershopBookings"),
    method: v.union(v.literal("WALLET"), v.literal("CASH")),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_BARBERSHOP);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new NotFoundError("Booking tidak ditemukan");
    if (booking.saleId) throw new BusinessRuleError("Booking sudah dibayar");

    const service = await ctx.db.get(booking.serviceId);
    const amount = booking.price;
    const now = Date.now();

    if (args.method === "WALLET") {
      if (!booking.customerStudentId) {
        throw new BusinessRuleError("Santri belum ditentukan untuk pembayaran wallet");
      }
      await mutateWallet(ctx, user, {
        studentId: booking.customerStudentId,
        type: "BARBERSHOP",
        amount,
        note: `Barbershop ${booking.code}`,
        referenceType: "barbershopBooking",
        referenceId: booking.code,
        idempotencyKey: args.idempotencyKey,
      });
    }

    const saleId = await ctx.db.insert("sales", {
      code: `SALE-${booking.code}`,
      invoiceNumber: `SALE-${booking.code}`,
      studentId: booking.customerStudentId,
      studentName: booking.customerName,
      cashierId: user.id,
      cashierName: user.name,
      channel: "SERVICE",
      paymentMethod: args.method,
      subtotal: amount,
      discount: 0,
      serviceTotal: amount,
      total: amount,
      paidAmount: amount,
      changeAmount: 0,
      costTotal: 0,
      status: "COMPLETED",
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
    });

    await ctx.db.insert("saleItems", {
      saleId,
      name: `Barbershop — ${service?.name ?? "Layanan"}`,
      quantity: 1,
      unit: "booking",
      sellingPrice: amount,
      discount: 0,
      costPrice: 0,
      subtotal: amount,
      cogs: 0,
      serviceType: "BARBERSHOP",
      serviceRefId: booking.code,
      createdAt: now,
    });

    await ctx.db.insert("payments", {
      saleId,
      method: args.method,
      amount,
      status: "SUCCESS",
      createdAt: now,
    });

    if (args.method === "CASH") {
      await ctx.db.insert("cashTransactions", {
        type: "SALE",
        direction: "IN",
        amount,
        referenceType: "barbershopBooking",
        referenceId: booking.code,
        createdBy: user.id,
        createdAt: now,
      });
    }

    await postJournal(ctx, {
      entryDate: now,
      description: `Pendapatan barbershop ${booking.code}`,
      source: "SERVICE",
      referenceType: "barbershopBooking",
      referenceId: booking.code,
      lines:
        args.method === "WALLET"
          ? accounting.serviceWalletJournal(accounting.COA.BARBERSHOP_REVENUE, amount)
          : accounting.serviceCashJournal(accounting.COA.BARBERSHOP_REVENUE, amount),
      user,
    });

    await ctx.db.patch(args.bookingId, { status: "DONE", saleId, updatedAt: now });
    await writeAudit(ctx, {
      user,
      action: "PAY_BOOKING",
      entityType: "barbershopBooking",
      entityId: args.bookingId,
      newValue: { code: booking.code, amount, method: args.method },
    });
    return { saleId, code: booking.code, total: amount };
  },
});

// ============================================================== JASTIP ====

export const listJastip = query({
  args: { status: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_JASTIP);
    let rows = await ctx.db.query("jastipOrders").collect();
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return {
      total: rows.length,
      revenue: roundToSen(
        rows.filter((r) => r.status === "DELIVERED").reduce((s, r) => s + r.serviceFee, 0),
      ),
      items: rows.slice(0, Math.min(args.limit ?? 50, 200)),
    };
  },
});

export const createJastipOrder = mutation({
  args: {
    customerType: v.union(v.literal("STUDENT"), v.literal("WALK_IN")),
    customerStudentId: v.optional(v.id("students")),
    customerName: v.string(),
    buyerName: v.string(),
    destination: v.string(),
    items: v.array(
      v.object({ name: v.string(), quantity: v.number(), price: v.number() }),
    ),
    deliveryFee: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_JASTIP);
    const settings = await getSettings(ctx);
    if (args.items.length === 0) {
      throw new BusinessRuleError("Order jastip harus memiliki minimal satu barang");
    }

    let itemsTotal = 0;
    for (const item of args.items) {
      if (item.quantity <= 0) throw new BusinessRuleError("Quantity barang harus lebih dari 0");
      assertRupiah(item.price, "Harga barang");
      itemsTotal = roundToSen(itemsTotal + item.quantity * item.price);
    }

    const serviceFee = settings.jastipServiceFee;
    const deliveryFee = args.deliveryFee ?? settings.jastipDeliveryFee;
    const totalAmount = roundToSen(itemsTotal + serviceFee + deliveryFee);

    const now = Date.now();
    const count = await ctx.db.query("jastipOrders").collect();
    const code = `JST-${formatDateCode(now)}-${String(count.length + 1).padStart(4, "0")}`;

    const orderId = await ctx.db.insert("jastipOrders", {
      code,
      customerType: args.customerType,
      customerStudentId: args.customerStudentId,
      customerName: requireString(args.customerName, "Nama pengirim", 120),
      buyerName: requireString(args.buyerName, "Nama penerima", 120),
      itemsTotal,
      serviceFee,
      deliveryFee,
      totalAmount,
      paidAmount: 0,
      destination: requireString(args.destination, "Tujuan", 200),
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    });

    for (const item of args.items) {
      await ctx.db.insert("jastipItems", {
        orderId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        createdAt: now,
      });
    }

    await writeAudit(ctx, {
      user,
      action: "CREATE_JASTIP_ORDER",
      entityType: "jastipOrder",
      entityId: orderId,
      newValue: { code, totalAmount, itemsTotal },
    });
    return { orderId, code, totalAmount, serviceFee, deliveryFee };
  },
});

export const updateJastipStatus = mutation({
  args: {
    orderId: v.id("jastipOrders"),
    status: v.union(
      v.literal("PENDING"),
      v.literal("PICKED_UP"),
      v.literal("IN_DELIVERY"),
      v.literal("DELIVERED"),
      v.literal("CANCELLED"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_JASTIP);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new NotFoundError("Order tidak ditemukan");
    await ctx.db.patch(args.orderId, { status: args.status, updatedAt: Date.now() });
    await writeAudit(ctx, {
      user,
      action: "UPDATE_JASTIP_STATUS",
      entityType: "jastipOrder",
      entityId: args.orderId,
      oldValue: { status: order.status },
      newValue: { status: args.status },
    });
    return { ok: true };
  },
});

/**
 * Pembayaran jastip: 6Mart MENERIMA biaya layanan saja.
 * Nilai barang dikirim lewat payment gateway terpisah (tidak di 6Mart).
 */
export const payJastip = mutation({
  args: {
    orderId: v.id("jastipOrders"),
    method: v.union(v.literal("WALLET"), v.literal("CASH")),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_JASTIP);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new NotFoundError("Order tidak ditemukan");
    if (order.saleId) throw new BusinessRuleError("Order sudah dibayar");

    const serviceFee = order.serviceFee;
    if (serviceFee <= 0) throw new BusinessRuleError("Biaya layanan tidak valid");
    const now = Date.now();

    if (args.method === "WALLET") {
      if (!order.customerStudentId) {
        throw new BusinessRuleError("Santri belum ditentukan untuk pembayaran wallet");
      }
      await mutateWallet(ctx, user, {
        studentId: order.customerStudentId,
        type: "JASTIP",
        amount: serviceFee,
        note: `Jastip ${order.code}`,
        referenceType: "jastipOrder",
        referenceId: order.code,
        idempotencyKey: args.idempotencyKey,
      });
    }

    const saleId = await ctx.db.insert("sales", {
      code: `SALE-${order.code}`,
      invoiceNumber: `SALE-${order.code}`,
      studentId: order.customerStudentId,
      studentName: order.customerName,
      cashierId: user.id,
      cashierName: user.name,
      channel: "SERVICE",
      paymentMethod: args.method,
      subtotal: serviceFee,
      discount: 0,
      serviceTotal: serviceFee,
      total: serviceFee,
      paidAmount: serviceFee,
      changeAmount: 0,
      costTotal: 0,
      status: "COMPLETED",
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
    });

    await ctx.db.insert("saleItems", {
      saleId,
      name: `Jastip ke ${order.destination}`,
      quantity: 1,
      unit: "order",
      sellingPrice: serviceFee,
      discount: 0,
      costPrice: 0,
      subtotal: serviceFee,
      cogs: 0,
      serviceType: "JASTIP",
      serviceRefId: order.code,
      createdAt: now,
    });

    await ctx.db.insert("payments", {
      saleId,
      method: args.method,
      amount: serviceFee,
      status: "SUCCESS",
      createdAt: now,
    });

    if (args.method === "CASH") {
      await ctx.db.insert("cashTransactions", {
        type: "SALE",
        direction: "IN",
        amount: serviceFee,
        referenceType: "jastipOrder",
        referenceId: order.code,
        createdBy: user.id,
        createdAt: now,
      });
    }

    await postJournal(ctx, {
      entryDate: now,
      description: `Pendapatan jastip ${order.code}`,
      source: "SERVICE",
      referenceType: "jastipOrder",
      referenceId: order.code,
      lines:
        args.method === "WALLET"
          ? accounting.serviceWalletJournal(accounting.COA.JASTIP_REVENUE, serviceFee)
          : accounting.serviceCashJournal(accounting.COA.JASTIP_REVENUE, serviceFee),
      user,
    });

    await ctx.db.patch(args.orderId, {
      status: "DELIVERED",
      paidAmount: serviceFee,
      saleId,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      user,
      action: "PAY_JASTIP",
      entityType: "jastipOrder",
      entityId: args.orderId,
      newValue: { code: order.code, serviceFee, method: args.method },
    });
    return { saleId, code: order.code, serviceFee };
  },
});

/** Ringkasan operasional seluruh layanan. */
export const servicesSummary = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.DASHBOARD_VIEW);
    const [laundry, bookings, jastip, ppob] = await Promise.all([
      ctx.db.query("laundryOrders").collect(),
      ctx.db.query("barbershopBookings").collect(),
      ctx.db.query("jastipOrders").collect(),
      ctx.db.query("ppobTransactions").collect(),
    ]);
    return {
      laundry: {
        total: laundry.length,
        pending: laundry.filter((l) => ["PENDING", "PROCESSING"].includes(l.status)).length,
        ready: laundry.filter((l) => l.status === "READY").length,
        completed: laundry.filter((l) => l.status === "COMPLETED").length,
        revenue: roundToSen(laundry.filter((l) => l.status === "COMPLETED").reduce((s, l) => s + l.totalAmount, 0)),
      },
      barbershop: {
        total: bookings.length,
        waiting: bookings.filter((b) => ["WAITING", "IN_PROGRESS"].includes(b.status)).length,
        done: bookings.filter((b) => b.status === "DONE").length,
        revenue: roundToSen(bookings.filter((b) => b.status === "DONE").reduce((s, b) => s + b.price, 0)),
      },
      jastip: {
        total: jastip.length,
        active: jastip.filter((j) => ["PICKED_UP", "IN_DELIVERY"].includes(j.status)).length,
        delivered: jastip.filter((j) => j.status === "DELIVERED").length,
        revenue: roundToSen(jastip.filter((j) => j.status === "DELIVERED").reduce((s, j) => s + j.serviceFee, 0)),
      },
      ppob: {
        total: ppob.length,
        success: ppob.filter((p) => p.status === "SUCCESS").length,
        failed: ppob.filter((p) => p.status === "FAILED").length,
        margin: roundToSen(ppob.filter((p) => p.status === "SUCCESS").reduce((s, p) => s + p.margin, 0)),
      },
    };
  },
});
