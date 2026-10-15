import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
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
    // Bayar di tempat: order laundry langsung dibayar setelah dibuat.
    payNow: v.optional(v.boolean()),
    paymentMethod: v.optional(v.union(v.literal("WALLET"), v.literal("CASH"))),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_LAUNDRY);
    const serviceType = requireString(args.serviceType, "Jenis layanan", 60);
    if (args.weightKg <= 0) throw new BusinessRuleError("Berat harus lebih dari 0");
    assertRupiah(args.pricePerKg, "Harga per kg");
    const settings = await getSettings(ctx);

    // Biaya layanan datar ditambahkan di atas berat × harga per kg.
    const serviceFee = roundToSen(settings.laundryServiceFee);
    const totalAmount = roundToSen(args.weightKg * args.pricePerKg + serviceFee);
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
      serviceFee,
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
    // Bayar di tempat supaya kasir tidak perlu membuka halaman kasir lagi.
    let payment: { saleId: Id<"sales">; code: string; total: number } | null = null;
    if (args.payNow) {
      const fresh = await ctx.db.get(orderId);
      if (fresh) {
        payment = await settleLaundryOrder(
          ctx,
          user,
          fresh,
          args.paymentMethod ?? "CASH",
          args.idempotencyKey ?? `laundry-create-${code}`,
          now,
        );
      }
    }

    return { orderId, code, totalAmount, payment };
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
/**
 * Menyelesaikan pembayaran satu order laundry.
 *
 * Dipisah dari mutation supaya bisa dipakai dari tombol "Bayar" pada daftar
 * order maupun langsung dari form order baru (`payNow`), dengan aturan yang
 * sama. Bayar di tempat berarti kasir tidak perlu membuka halaman kasir.
 */
async function settleLaundryOrder(
  ctx: any,
  user: Awaited<ReturnType<typeof requireUser>>,
  order: { _id: Id<"laundryOrders"> } & Record<string, any>,
  method: "WALLET" | "CASH",
  idempotencyKey: string,
  now: number,
) {
  if (order.saleId) throw new BusinessRuleError("Order laundry sudah dibayar");
  if (order.totalAmount <= 0) throw new BusinessRuleError("Total tidak valid");

  const code = order.code;

  if (method === "WALLET") {
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
        idempotencyKey: idempotencyKey,
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
      paymentMethod: method,
      identificationMethod: method === "WALLET" ? "MANUAL" : undefined,
      subtotal: order.totalAmount,
      discount: 0,
      serviceTotal: order.totalAmount,
      total: order.totalAmount,
      paidAmount: order.totalAmount,
      changeAmount: 0,
      costTotal: 0,
      status: "COMPLETED",
      idempotencyKey: idempotencyKey,
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
      method: method,
      amount: order.totalAmount,
      status: "SUCCESS",
      createdAt: now,
    });

    if (method === "CASH") {
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
        method === "WALLET"
          ? accounting.serviceWalletJournal(accounting.COA.LAUNDRY_REVENUE, order.totalAmount)
          : accounting.serviceCashJournal(accounting.COA.LAUNDRY_REVENUE, order.totalAmount),
      user,
    });

    await ctx.db.patch(order._id, {
      status: "COMPLETED",
      paidAmount: order.totalAmount,
      saleId,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      user,
      action: "PAY_LAUNDRY",
      entityType: "laundryOrder",
      entityId: order._id,
      newValue: { code, amount: order.totalAmount, method: method },
    });

  return { saleId, code, total: order.totalAmount, method };
}

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
    return settleLaundryOrder(
      ctx,
      user,
      order,
      args.method,
      args.idempotencyKey,
      Date.now(),
    );
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
    // Bayar di tempat: booking langsung dibayar setelah dibuat.
    payNow: v.optional(v.boolean()),
    paymentMethod: v.optional(v.union(v.literal("WALLET"), v.literal("CASH"))),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_BARBERSHOP);
    const service = await ctx.db.get(args.serviceId);
    if (!service) throw new NotFoundError("Layanan tidak ditemukan");
    if (!service.isActive) throw new BusinessRuleError("Layanan tidak aktif");
    const settings = await getSettings(ctx);
    // Biaya layanan datar ditambahkan di atas harga layanan yang dipilih.
    const serviceFee = roundToSen(settings.barbershopServiceFee);
    const totalAmount = roundToSen(service.price + serviceFee);

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
      // Biaya layanan datar ditambahkan di atas harga layanan.
      serviceFee: serviceFee,
      totalAmount: totalAmount,
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
    // Bayar di tempat supaya kasir tidak perlu membuka halaman kasir lagi.
    let payment: { saleId: Id<"sales">; code: string; amount: number } | null = null;
    if (args.payNow) {
      const fresh = await ctx.db.get(id);
      if (fresh) {
        payment = await settleBooking(
          ctx,
          user,
          fresh,
          args.paymentMethod ?? "CASH",
          args.idempotencyKey ?? `booking-create-${code}`,
          now,
        );
      }
    }

    return { id, code, queueNumber: sameDay.length + 1, payment };
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

/**
 * Menyelesaikan pembayaran satu booking barbershop.
 *
 * Dipisah dari mutation supaya bisa dipakai dari tombol "Bayar" pada daftar
 * booking maupun langsung dari form booking baru (`payNow`), dengan aturan
 * yang sama. Bayar di tempat berarti kasir tidak perlu membuka halaman kasir.
 */
async function settleBooking(
  ctx: any,
  user: Awaited<ReturnType<typeof requireUser>>,
  booking: { _id: Id<"barbershopBookings"> } & Record<string, any>,
  method: "WALLET" | "CASH",
  idempotencyKey: string,
  now: number,
) {
  if (booking.saleId) throw new BusinessRuleError("Booking sudah dibayar");

  // Yang ditagih harga layanan + biaya layanan datar. Order lama dibuat
  // sebelum biaya datar ada, jadi `totalAmount` bisa saja belum terisi.
  const amount = roundToSen(
    booking.totalAmount ?? booking.price + (booking.serviceFee ?? 0),
  );
  const service = await ctx.db.get(booking.serviceId as Id<"barbershopServices">);

  if (method === "WALLET") {
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
        idempotencyKey: idempotencyKey,
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
      paymentMethod: method,
      subtotal: amount,
      discount: 0,
      serviceTotal: amount,
      total: amount,
      paidAmount: amount,
      changeAmount: 0,
      costTotal: 0,
      status: "COMPLETED",
      idempotencyKey: idempotencyKey,
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
      method: method,
      amount,
      status: "SUCCESS",
      createdAt: now,
    });

    if (method === "CASH") {
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
        method === "WALLET"
          ? accounting.serviceWalletJournal(accounting.COA.BARBERSHOP_REVENUE, amount)
          : accounting.serviceCashJournal(accounting.COA.BARBERSHOP_REVENUE, amount),
      user,
    });

    await ctx.db.patch(booking._id, { status: "DONE", saleId, updatedAt: now });
    await writeAudit(ctx, {
      user,
      action: "PAY_BOOKING",
      entityType: "barbershopBooking",
      entityId: booking._id,
      newValue: { code: booking.code, amount, method: method },
    });
    return { saleId, code: booking.code, amount, method };
}

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
    return settleBooking(
      ctx,
      user,
      booking,
      args.method,
      args.idempotencyKey,
      Date.now(),
    );
  },
});

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

/**
 * Satu order jastip beserta barangnya.
 *
 * Dipakai halaman kasir untuk melanjutkan pembayaran order yang baru dibuat
 * di menu layanan, jadi kasir tidak perlu mengetik ulang.
 */
export const getJastip = query({
  args: { orderId: v.id("jastipOrders") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_JASTIP);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new NotFoundError("Order tidak ditemukan");
    const items = await ctx.db
      .query("jastipItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    return { order, items };
  },
});

export const createJastipOrder = mutation({
  args: {
    customerType: v.union(v.literal("STUDENT"), v.literal("WALK_IN")),
    customerStudentId: v.optional(v.id("students")),
    customerName: v.string(),
    // Form jastip sengaja dibuat pendek: tipe pelanggan, nama, jenis
    // pesanan, jumlah, harga. Nama penerima dan tujuan menjadi opsional
    // supaya kasir tidak perlu mengisinya.
    buyerName: v.optional(v.string()),
    destination: v.optional(v.string()),
    orderType: v.optional(v.string()),
    items: v.array(
      v.object({
        name: v.optional(v.string()),
        orderType: v.optional(v.string()),
        quantity: v.number(),
        price: v.number(),
      }),
    ),
    // Bayar langsung di tempat:_order baru langsung dibayar sehingga kasir
    // tidak perlu membuka halaman kasir lagi.
    payNow: v.optional(v.boolean()),
    paymentMethod: v.optional(v.union(v.literal("WALLET"), v.literal("CASH"))),
    idempotencyKey: v.optional(v.string()),
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

    const serviceFee = roundToSen(settings.jastipServiceFee);
    // Yang ditagih = nilai barang + biaya layanan. Ongkir tidak lagi
    // ditagih. Nilai barang ikut ditagih karena kasir mengetiknya di form
    // sebagai harga pesanan.
    const totalAmount = roundToSen(itemsTotal + serviceFee);

    const now = Date.now();
    const count = await ctx.db.query("jastipOrders").collect();
    const code = `JST-${formatDateCode(now)}-${String(count.length + 1).padStart(4, "0")}`;

    const orderId = await ctx.db.insert("jastipOrders", {
      code,
      customerType: args.customerType,
      customerStudentId: args.customerStudentId,
      customerName: requireString(args.customerName, "Nama pengirim", 120),
      buyerName: args.buyerName?.trim() || undefined,
      orderType: args.orderType?.trim() || undefined,
      itemsTotal,
      serviceFee,
      totalAmount,
      paidAmount: 0,
      destination: args.destination?.trim() || undefined,
      status: "PENDING",
      createdAt: now,
      updatedAt: now,
    });

    for (const item of args.items) {
      await ctx.db.insert("jastipItems", {
        orderId,
        name: item.name?.trim() || undefined,
        orderType: item.orderType?.trim() || undefined,
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

    // Bayar di tempat: order baru langsung diselesaikan supaya kasir tidak
    // perlu membuka halaman kasir atau daftar order lagi.
    let payment: { saleId: Id<"sales">; code: string; chargeTotal: number } | null =
      null;
    if (args.payNow) {
      const fresh = await ctx.db.get(orderId);
      if (fresh) {
        payment = await settleJastipOrder(
          ctx,
          user,
          fresh,
          args.paymentMethod ?? "CASH",
          args.idempotencyKey ?? `jastip-create-${code}`,
          now,
        );
      }
    }

    return { orderId, code, totalAmount, serviceFee, payment };
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
/**
 * Satu order laundry beserta barangnya, untuk pembayaran di halaman kasir.
 */
export const getLaundry = query({
  args: { orderId: v.id("laundryOrders") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_LAUNDRY);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new NotFoundError("Order laundry tidak ditemukan");
    const items = await ctx.db
      .query("laundryItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    return { order, items };
  },
});

/** Satu booking barbershop, untuk pembayaran di halaman kasir. */
export const getBooking = query({
  args: { bookingId: v.id("barbershopBookings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SERVICE_BARBERSHOP);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking) throw new NotFoundError("Booking tidak ditemukan");
    const service = await ctx.db.get(booking.serviceId);
    return { booking, service };
  },
});

/**
 * Menyelesaikan pembayaran satu order jastip.
 *
 * Dipisah dari mutation supaya bisa dipakai dua tempat: dari tombol "Bayar"
 * pada daftar order, dan langsung dari form order baru ketika kasir memilih
 * bayar di tempat (`payNow`). Keduanya memakai aturan yang sama.
 *
 * Nominal yang ditagih adalah biaya layanan PLUS biaya pengiriman. Nilai
 * barang tidak ditagih di sini karena barang dibayar langsung oleh
 * pengirim kepada penerima atau toko.
 */
async function settleJastipOrder(
  ctx: any,
  user: Awaited<ReturnType<typeof requireUser>>,
  order: { _id: Id<"jastipOrders"> } & Record<string, any>,
  method: "WALLET" | "CASH",
  idempotencyKey: string,
  now: number,
) {
  // Tagihan jastip = nilai barang + biaya layanan. Ongkir tidak ditagih;
  // order lama yang masih punya deliveryFee ikut mengikutinya supaya
  // nominal yang sudah disepakati tidak berubah sendiri.
  const itemsTotal = roundToSen(order.itemsTotal ?? 0);
  const chargeTotal = roundToSen(itemsTotal + order.serviceFee + (order.deliveryFee ?? 0));
  if (chargeTotal <= 0) throw new BusinessRuleError("Total tidak valid");

  if (method === "WALLET") {
    if (!order.customerStudentId) {
      throw new BusinessRuleError("Santri belum ditentukan untuk pembayaran wallet");
    }
    await mutateWallet(ctx, user, {
      studentId: order.customerStudentId,
      type: "JASTIP",
      amount: chargeTotal,
      note: `Jastip ${order.code}`,
      referenceType: "jastipOrder",
      referenceId: order.code,
      idempotencyKey,
    });
  }

  const label = order.orderType
    ? `Jastip ${order.orderType}`
    : `Jastip ke ${order.destination ?? "-"}`;

  const saleId = await ctx.db.insert("sales", {
    code: `SALE-${order.code}`,
    invoiceNumber: `SALE-${order.code}`,
    studentId: order.customerStudentId,
    studentName: order.customerName,
    cashierId: user.id,
    cashierName: user.name,
    channel: "SERVICE",
    paymentMethod: method,
    subtotal: chargeTotal,
    discount: 0,
    serviceTotal: chargeTotal,
    total: chargeTotal,
    paidAmount: chargeTotal,
    changeAmount: 0,
    costTotal: 0,
    status: "COMPLETED",
    idempotencyKey,
    createdAt: now,
  });

  await ctx.db.insert("saleItems", {
    saleId,
    name: label,
    quantity: 1,
    unit: "order",
    sellingPrice: chargeTotal,
    discount: 0,
    costPrice: 0,
    subtotal: chargeTotal,
    cogs: 0,
    serviceType: "JASTIP",
    serviceRefId: order.code,
    createdAt: now,
  });

  await ctx.db.insert("payments", {
    saleId,
    method,
    amount: chargeTotal,
    status: "SUCCESS",
    createdAt: now,
  });

  if (method === "CASH") {
    await ctx.db.insert("cashTransactions", {
      type: "SALE",
      direction: "IN",
      amount: chargeTotal,
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
      method === "WALLET"
        ? accounting.serviceWalletJournal(accounting.COA.JASTIP_REVENUE, chargeTotal)
        : accounting.serviceCashJournal(accounting.COA.JASTIP_REVENUE, chargeTotal),
    user,
  });

  // Status TIDAK diubah menjadi DELIVERED di sini. Membayar tidak berarti
  // paket sudah sampai; status tetap diatur terpisah dari daftar order.
  await ctx.db.patch(order._id, {
    paidAmount: chargeTotal,
    saleId,
    updatedAt: now,
  });

  await writeAudit(ctx, {
    user,
    action: "PAY_JASTIP",
    entityType: "jastipOrder",
    entityId: order._id,
    newValue: { code: order.code, chargeTotal, method },
  });

  return { saleId, code: order.code, chargeTotal };
}

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
    return settleJastipOrder(
      ctx,
      user,
      order,
      args.method,
      args.idempotencyKey,
      Date.now(),
    );
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
