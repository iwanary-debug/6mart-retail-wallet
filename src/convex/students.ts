import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id, Doc } from "./_generated/dataModel";
import {
  assertPermission,
  BusinessRuleError,
  NotFoundError,
  requireUser,
  writeAudit,
  type SessionUser,
} from "./lib/guards";
import { getSettings, requireString } from "./lib/helpers";
import { PERMISSIONS } from "../lib/rbac";
import { buildCode } from "../lib/codes";

const DEFAULT_LIMITS = {
  dailyDebitLimit: 2_000_000,
  dailyTopupLimit: 5_000_000,
  maxBalance: 5_000_000,
  minBalance: 0,
  withdrawalEnabled: true,
};

async function ensureWallet(
  ctx: MutationCtx,
  studentId: Id<"students">,
  now: number,
): Promise<Id<"wallets">> {
  const existing = await ctx.db
    .query("wallets")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .unique();
  if (existing) return existing._id;

  const count = await ctx.db.query("wallets").collect();
  const code = buildCode("WAL", now, count.length + 1);
  return await ctx.db.insert("wallets", {
    studentId,
    code,
    currentBalance: 0,
    status: "ACTIVE",
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * Token acak untuk QR student ID. Memakai Web Crypto global (tersedia di
 * semua runtime Convex) agar tidak bergantung pada Node built-in.
 */
function generateToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------------ QUERIES ----

export const list = query({
  args: {
    search: v.optional(v.string()),
    status: v.optional(v.string()),
    className: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.STUDENT_VIEW);

    let rows = await ctx.db.query("students").collect();
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    if (args.className) rows = rows.filter((r) => r.className === args.className);
    if (args.search) {
      const s = args.search.toLowerCase();
      rows = rows.filter(
        (r) => r.nis.toLowerCase().includes(s) || r.name.toLowerCase().includes(s),
      );
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));

    const limit = Math.min(args.limit ?? 100, 500);
    const page = rows.slice(0, limit);

    const withWallet = await Promise.all(
      page.map(async (student) => {
        const wallet = await ctx.db
          .query("wallets")
          .withIndex("by_student", (q) => q.eq("studentId", student._id))
          .unique();
        const cards = await ctx.db
          .query("studentCards")
          .withIndex("by_student", (q) => q.eq("studentId", student._id))
          .collect();
        const activeCard = cards.find((c) => c.status === "ACTIVE");
        return {
          ...student,
          walletId: wallet?._id ?? null,
          balance: wallet?.currentBalance ?? 0,
          walletStatus: wallet?.status ?? null,
          walletVersion: wallet?.version ?? 0,
          cardId: activeCard?._id ?? null,
          cardCode: activeCard?.code ?? null,
          rfidUid: activeCard?.rfidUid ?? null,
        };
      }),
    );

    return { total: rows.length, items: withWallet };
  },
});

export const get = query({
  args: { id: v.id("students") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.STUDENT_VIEW);
    const student = await ctx.db.get(args.id);
    if (!student) throw new NotFoundError("Santri tidak ditemukan");

    const [wallet, cards, parents, limits, recentLedger] = await Promise.all([
      ctx.db
        .query("wallets")
        .withIndex("by_student", (q) => q.eq("studentId", args.id))
        .unique(),
      ctx.db
        .query("studentCards")
        .withIndex("by_student", (q) => q.eq("studentId", args.id))
        .collect(),
      ctx.db
        .query("parentStudents")
        .withIndex("by_student", (q) => q.eq("studentId", args.id))
        .collect(),
      ctx.db
        .query("walletLimits")
        .withIndex("by_student", (q) => q.eq("studentId", args.id))
        .unique(),
      ctx.db
        .query("walletLedger")
        .withIndex("by_student", (q) => q.eq("studentId", args.id))
        .order("desc")
        .take(15),
    ]);

    const parentRows = await Promise.all(
      parents.map(async (link) => {
        const parent = await ctx.db.get(link.parentId);
        return parent
          ? { ...link, parent: { _id: parent._id, name: parent.name, phone: parent.phone, code: parent.code } }
          : null;
      }),
    );

    return {
      student,
      wallet: wallet ?? null,
      cards: cards.sort((a, b) => b.issuedAt - a.issuedAt),
      parents: parentRows.filter((p) => p !== null),
      limits: limits ?? { ...DEFAULT_LIMITS },
      recentLedger,
    };
  },
});

export const getByNis = query({
  args: { nis: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.STUDENT_VIEW);
    const student = await ctx.db
      .query("students")
      .withIndex("by_nis", (q) => q.eq("nis", args.nis))
      .unique();
    if (!student) throw new NotFoundError(`Santri dengan NIS ${args.nis} tidak ditemukan`);
    return student;
  },
});

/**
 * Identifikasiquentify via RFID UID / QR token / NIS (blueprint §61).
 * Semua identitas BERKASALAH ke student yang sama → wallet yang sama.
 */
export const identify = query({
  args: {
    rfidUid: v.optional(v.string()),
    qrToken: v.optional(v.string()),
    nis: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.STUDENT_VIEW);
    const settings = await getSettings(ctx);

    let card: Doc<"studentCards"> | null = null;
    if (args.rfidUid) {
      if (!settings.rfidEnabled) throw new BusinessRuleError("Fitur RFID sedang dinonaktifkan");
      card = await ctx.db
        .query("studentCards")
        .withIndex("by_rfid", (q) => q.eq("rfidUid", args.rfidUid!.trim()))
        .unique();
    } else if (args.qrToken) {
      if (!settings.qrEnabled) throw new BusinessRuleError("Fitur QR sedang dinonaktifkan");
      card = await ctx.db
        .query("studentCards")
        .withIndex("by_qr", (q) => q.eq("qrToken", args.qrToken!.trim()))
        .unique();
    } else if (args.nis) {
      const student = await ctx.db
        .query("students")
        .withIndex("by_nis", (q) => q.eq("nis", args.nis!.trim()))
        .unique();
      if (!student) return { found: false as const, reason: "Santri tidak ditemukan" };
      const wallet = await ctx.db
        .query("wallets")
        .withIndex("by_student", (q) => q.eq("studentId", student._id))
        .unique();
      return {
        found: true as const,
        method: "NIS" as const,
        student,
        wallet,
        card: null,
        balance: wallet?.currentBalance ?? 0,
      };
    } else {
      throw new BusinessRuleError("Gunakan RFID, QR, atau NIS untuk identifikasi");
    }

    if (!card) return { found: false as const, reason: "Kartu tidak terdaftar" };
    if (card.status !== "ACTIVE") {
      return {
        found: false as const,
        reason: `Kartu berstatus ${card.status}. Hubungi bagian keuangan.`,
      };
    }
    const student = await ctx.db.get(card.studentId);
    if (!student) return { found: false as const, reason: "Data santri tidak ditemukan" };
    if (student.status !== "ACTIVE") {
      return { found: false as const, reason: `Santri berstatus ${student.status}` };
    }
    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .unique();

    return {
      found: true as const,
      method: args.rfidUid ? ("RFID" as const) : ("QR" as const),
      student,
      wallet: wallet ?? null,
      card,
      balance: wallet?.currentBalance ?? 0,
    };
  },
});

/**
 * Identifikasi untuk kasir dalam satu round-trip (RFID/QR/NIS).
 * Mengembalikan dataPLICATION yang dibutuhkan POS: nama, saldo, versi wallet.
 */
export const identifyForPos = mutation({
  args: {
    rfidUid: v.optional(v.string()),
    qrToken: v.optional(v.string()),
    nis: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SALE_CREATE);
    const settings = await getSettings(ctx);

    let student: Doc<"students"> | null = null;
    let method: "RFID" | "QR" | "NIS" = "NIS";
    let card: Doc<"studentCards"> | null = null;

    if (args.rfidUid) {
      if (!settings.rfidEnabled) throw new BusinessRuleError("Fitur RFID sedang dinonaktifkan");
      method = "RFID";
      card = await ctx.db
        .query("studentCards")
        .withIndex("by_rfid", (q) => q.eq("rfidUid", args.rfidUid!.trim()))
        .unique();
      if (!card) throw new BusinessRuleError("UID RFID tidak terdaftar");
      if (card.status !== "ACTIVE") {
        throw new BusinessRuleError(`Kartu berstatus ${card.status}. Hubungi bagian keuangan.`);
      }
      student = await ctx.db.get(card.studentId);
    } else if (args.qrToken) {
      if (!settings.qrEnabled) throw new BusinessRuleError("Fitur QR sedang dinonaktifkan");
      method = "QR";
      card = await ctx.db
        .query("studentCards")
        .withIndex("by_qr", (q) => q.eq("qrToken", args.qrToken!.trim()))
        .unique();
      if (!card) throw new BusinessRuleError("QR tidak terdaftar");
      if (card.status !== "ACTIVE") {
        throw new BusinessRuleError(`Kartu berstatus ${card.status}. Hubungi bagian keuangan.`);
      }
      student = await ctx.db.get(card.studentId);
    } else if (args.nis) {
      method = "NIS";
      student = await ctx.db
        .query("students")
        .withIndex("by_nis", (q) => q.eq("nis", args.nis!.trim()))
        .unique();
    } else {
      throw new BusinessRuleError("Gunakan RFID, QR, atau NIS untuk identifikasi");
    }

    if (!student) throw new NotFoundError("Data santri tidak ditemukan");
    if (student.status !== "ACTIVE") {
      throw new BusinessRuleError(`Santri berstatus ${student.status}`);
    }

    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_student", (q) => q.eq("studentId", student!._id))
      .unique();
    if (!wallet) throw new NotFoundError("Wallet santri belum dibuat");

    return {
      studentId: student._id,
      name: student.name,
      nis: student.nis,
      className: student.className,
      balance: wallet.currentBalance,
      version: wallet.version,
      walletStatus: wallet.status,
      method,
      cardCode: card?.code,
    };
  },
});

export const listClasses = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("students").collect();
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.className, (counts.get(r.className) ?? 0) + 1);
    return Array.from(counts.entries())
      .map(([className, total]) => ({ className, total }))
      .sort((a, b) => a.className.localeCompare(b.className));
  },
});

// --------------------------------------------------------------- MUTATIONS ----

export const create = mutation({
  args: {
    nis: v.string(),
    name: v.string(),
    gender: v.union(v.literal("L"), v.literal("P")),
    className: v.string(),
    dormitory: v.optional(v.string()),
    room: v.optional(v.string()),
    parentId: v.optional(v.id("parents")),
    parentRelation: v.optional(v.string()),
    createWallet: v.optional(v.boolean()),
    createCard: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.STUDENT_MANAGE);
    return await createStudentInternal(ctx, user, args);
  },
});

/**
 * Membuat satu data santri beserta seluruh perangkat pendampingnya.
 *
 * Dipisah dari mutation supaya impor CSV dan input manual memakai aturan yang
 * persis sama untuk NIS ganda, wallet, kartu, dan orang tua.
 */
export async function createStudentInternal(
  ctx: any,
  user: SessionUser,
  args: {
    nis: string;
    name: string;
    gender: "L" | "P";
    className: string;
    dormitory?: string;
    room?: string;
    parentId?: Id<"parents">;
    parentRelation?: string;
    createWallet?: boolean;
    createCard?: boolean;
  },
) {
  const nis = requireString(args.nis, "NIS", 30);
  const name = requireString(args.name, "Nama", 120);
  const className = requireString(args.className, "Kelas", 40);

  const dup = await ctx.db
    .query("students")
    .withIndex("by_nis", (q: any) => q.eq("nis", nis))
    .unique();
  if (dup) throw new BusinessRuleError(`NIS ${nis} sudah terdaftar`);

  const now = Date.now();
  const studentId = await ctx.db.insert("students", {
    nis,
    name,
    gender: args.gender,
    className,
    dormitory: args.dormitory?.trim() || undefined,
    room: args.room?.trim() || undefined,
    status: "ACTIVE",
    createdAt: now,
    updatedAt: now,
  });

  // Wallet otomatis dibuat dengan saldo 0 — saldo HANYA bisa berubah via ledger.
  const walletId = args.createWallet === false ? null : await ensureWallet(ctx, studentId, now);
  if (walletId) {
    await ctx.db.insert("walletLimits", {
      studentId,
      ...DEFAULT_LIMITS,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (args.parentId) {
    await ctx.db.insert("parentStudents", {
      parentId: args.parentId,
      studentId,
      relation: args.parentRelation ?? "WALI",
      isPrimary: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  let cardId: Id<"studentCards"> | null = null;
  if (args.createCard !== false) {
    cardId = await createCardInternal(ctx, user, studentId, now);
  }

  await writeAudit(ctx, {
    user,
    action: "CREATE_STUDENT",
    entityType: "student",
    entityId: studentId,
    newValue: { nis, name, className },
  });

  return { studentId, walletId, cardId };
}

export const update = mutation({
  args: {
    id: v.id("students"),
    name: v.optional(v.string()),
    gender: v.optional(v.union(v.literal("L"), v.literal("P"))),
    className: v.optional(v.string()),
    dormitory: v.optional(v.string()),
    room: v.optional(v.string()),
    status: v.optional(v.union(v.literal("ACTIVE"), v.literal("INACTIVE"), v.literal("GRADUATED"))),
    externalRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.STUDENT_MANAGE);
    const student = await ctx.db.get(args.id);
    if (!student) throw new NotFoundError("Santri tidak ditemukan");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = requireString(args.name, "Nama", 120);
    if (args.gender !== undefined) patch.gender = args.gender;
    if (args.className !== undefined) patch.className = requireString(args.className, "Kelas", 40);
    if (args.dormitory !== undefined) patch.dormitory = args.dormitory;
    if (args.room !== undefined) patch.room = args.room;
    if (args.status !== undefined) patch.status = args.status;
    if (args.externalRef !== undefined) patch.externalRef = args.externalRef;

    await ctx.db.patch(args.id, patch);
    await writeAudit(ctx, {
      user,
      action: "UPDATE_STUDENT",
      entityType: "student",
      entityId: args.id,
      oldValue: { name: student.name, className: student.className, status: student.status },
      newValue: patch,
    });
    return { ok: true };
  },
});

/** Soft delete: status INACTIVE. Riwayat transaksi TIDAK pernah dihapus. */
export const deactivate = mutation({
  args: { id: v.id("students") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.STUDENT_MANAGE);
    const student = await ctx.db.get(args.id);
    if (!student) throw new NotFoundError("Santri tidak ditemukan");
    await ctx.db.patch(args.id, { status: "INACTIVE", updatedAt: Date.now() });
    await writeAudit(ctx, {
      user,
      action: "DEACTIVATE_STUDENT",
      entityType: "student",
      entityId: args.id,
      oldValue: { status: student.status },
      newValue: { status: "INACTIVE" },
    });
    return { ok: true };
  },
});

export const setLimits = mutation({
  args: {
    studentId: v.id("students"),
    dailyDebitLimit: v.number(),
    dailyTopupLimit: v.number(),
    maxBalance: v.optional(v.number()),
    minBalance: v.number(),
    withdrawalEnabled: v.boolean(),
    requiresApprovalAbove: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_ADJUST);
    const now = Date.now();
    const existing = await ctx.db
      .query("walletLimits")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("walletLimits", { ...args, createdAt: now, updatedAt: now });
    }
    await writeAudit(ctx, {
      user,
      action: "UPDATE_WALLET_LIMITS",
      entityType: "walletLimits",
      entityId: args.studentId,
      newValue: args,
    });
    return { ok: true };
  },
});

// ------------------------------------------------------------------- RFID ----

async function createCardInternal(
  ctx: MutationCtx,
  _user: SessionUser,
  studentId: Id<"students">,
  now: number,
): Promise<Id<"studentCards">> {
  const count = await ctx.db.query("studentCards").collect();
  const code = buildCode("RFD", now, count.length + 1);
  return await ctx.db.insert("studentCards", {
    code,
    studentId,
    rfidUid: undefined,
    qrToken: generateToken(),
    status: "ACTIVE",
    issuedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

export const registerCard = mutation({
  args: {
    studentId: v.id("students"),
    rfidUid: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.CARD_MANAGE);
    const now = Date.now();

    const student = await ctx.db.get(args.studentId);
    if (!student) throw new NotFoundError("Santri tidak ditemukan");

    if (args.rfidUid) {
      const uid = args.rfidUid.trim();
      const dup = await ctx.db
        .query("studentCards")
        .withIndex("by_rfid", (q) => q.eq("rfidUid", uid))
        .unique();
      if (dup) {
        throw new BusinessRuleError(
          `UID RFID ${uid} sudah terdaftar pada kartu ${dup.code}`,
        );
      }
    }

    const cardId = await createCardInternal(ctx, user, args.studentId, now);

    if (args.rfidUid) {
      await ctx.db.patch(cardId, {
        rfidUid: args.rfidUid.trim(),
        note: args.note,
        updatedAt: now,
      });
    }

    await writeAudit(ctx, {
      user,
      action: "REGISTER_RFID_CARD",
      entityType: "studentCard",
      entityId: cardId,
      newValue: { studentId: args.studentId, rfidUid: args.rfidUid },
    });

    return { cardId };
  },
});

export const linkRfid = mutation({
  args: { cardId: v.id("studentCards"), rfidUid: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.CARD_MANAGE);
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new NotFoundError("Kartu tidak ditemukan");
    if (card.status !== "ACTIVE") {
      throw new BusinessRuleError(`Kartu berstatus ${card.status}, tidak dapat diubah`);
    }
    const uid = args.rfidUid.trim();
    if (!uid) throw new BusinessRuleError("UID RFID tidak boleh kosong");

    const dup = await ctx.db
      .query("studentCards")
      .withIndex("by_rfid", (q) => q.eq("rfidUid", uid))
      .unique();
    if (dup && dup._id !== args.cardId) {
      throw new BusinessRuleError(`UID RFID ${uid} sudah dipakai kartu ${dup.code}`);
    }

    await ctx.db.patch(args.cardId, { rfidUid: uid, updatedAt: Date.now() });
    await writeAudit(ctx, {
      user,
      action: "LINK_RFID",
      entityType: "studentCard",
      entityId: args.cardId,
      oldValue: { rfidUid: card.rfidUid },
      newValue: { rfidUid: uid },
    });
    return { ok: true };
  },
});

export const blockCard = mutation({
  args: { cardId: v.id("studentCards"), reason: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.CARD_MANAGE);
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new NotFoundError("Kartu tidak ditemukan");
    const now = Date.now();
    await ctx.db.patch(args.cardId, {
      status: "BLOCKED",
      blockedAt: now,
      note: requireString(args.reason, "Alasan", 200),
      updatedAt: now,
    });
    await writeAudit(ctx, {
      user,
      action: "BLOCK_CARD",
      entityType: "studentCard",
      entityId: args.cardId,
      newValue: { status: "BLOCKED", reason: args.reason },
    });
    return { ok: true };
  },
});

/**
 * Ganti kartu hilang: blokir kartu lama → buat kartu baru → tautkan ke
 * student yang sama. Saldo wallet TIDAK BERUBAH (saldo melekat pada student).
 */
export const replaceCard = mutation({
  args: {
    oldCardId: v.id("studentCards"),
    reason: v.string(),
    rfidUid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.CARD_MANAGE);
    const oldCard = await ctx.db.get(args.oldCardId);
    if (!oldCard) throw new NotFoundError("Kartu lama tidak ditemukan");
    if (oldCard.status === "BLOCKED") {
      throw new BusinessRuleError("Kartu lama sudah diblokir");
    }
    const now = Date.now();

    const newCardId = await createCardInternal(ctx, user, oldCard.studentId, now);

    await ctx.db.patch(args.oldCardId, {
      status: "REPLACED",
      blockedAt: now,
      note: requireString(args.reason, "Alasan", 200),
      replacedByCardId: newCardId,
      replacedByCardCode: (await ctx.db.get(newCardId))?.code,
      updatedAt: now,
    });

    if (args.rfidUid) {
      const uid = args.rfidUid.trim();
      const dup = await ctx.db
        .query("studentCards")
        .withIndex("by_rfid", (q) => q.eq("rfidUid", uid))
        .unique();
      if (dup) throw new BusinessRuleError(`UID RFID ${uid} sudah dipakai kartu ${dup.code}`);
      await ctx.db.patch(newCardId, { rfidUid: uid, updatedAt: now });
    }

    await writeAudit(ctx, {
      user,
      action: "REPLACE_CARD",
      entityType: "studentCard",
      entityId: args.oldCardId,
      newValue: { newCardId, reason: args.reason, balanceUnchanged: true },
    });

    return { newCardId };
  },
});

export const regenerateQr = mutation({
  args: { cardId: v.id("studentCards") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.CARD_MANAGE);
    const card = await ctx.db.get(args.cardId);
    if (!card) throw new NotFoundError("Kartu tidak ditemukan");
    const token = generateToken();
    await ctx.db.patch(args.cardId, { qrToken: token, updatedAt: Date.now() });
    await writeAudit(ctx, {
      user,
      action: "REGENERATE_QR",
      entityType: "studentCard",
      entityId: args.cardId,
    });
    return { qrToken: token };
  },
});

export const listCards = query({
  args: { status: v.optional(v.string()), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.CARD_MANAGE);
    let rows = await ctx.db.query("studentCards").collect();
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    const enriched = await Promise.all(
      rows.map(async (card) => {
        const student = await ctx.db.get(card.studentId);
        return { ...card, studentName: student?.name ?? "-", nis: student?.nis ?? "-" };
      }),
    );
    if (args.search) {
      const s = args.search.toLowerCase();
      return enriched.filter(
        (c) =>
          c.code.toLowerCase().includes(s) ||
          c.studentName.toLowerCase().includes(s) ||
          (c.rfidUid ?? "").toLowerCase().includes(s),
      );
    }
    return enriched;
  },
});

export const resolveStudentRef = mutation({
  args: { nis: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.STUDENT_VIEW);
    const student = await ctx.db
      .query("students")
      .withIndex("by_nis", (q) => q.eq("nis", args.nis))
      .unique();
    if (!student) throw new NotFoundError("Santri tidak ditemukan");
    return { id: student._id };
  },
});
