import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  permissionsForRole,
  ROLE_LABELS,
  ROLES,
  type RoleKey,
} from "../../lib/rbac";

export interface SessionUser {
  id: Id<"users">;
  name: string;
  email: string;
  roleKey: RoleKey;
  permissions: string[];
  subject: string;
}

export class AuthError extends Error {
  public readonly dataKind = "AuthError";
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  public readonly dataKind = "ForbiddenError";
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends Error {
  public readonly dataKind = "ValidationError";
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  public readonly dataKind = "NotFoundError";
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class BusinessRuleError extends Error {
  public readonly dataKind = "BusinessRuleError";
  constructor(message: string) {
    super(message);
    this.name = "BusinessRuleError";
  }
}

/**
 * Resolve user 6Mart dari session Convex Auth.
 * Menolak unauthenticated dengan pesan Bahasa Indonesia.
 */
export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<SessionUser> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new AuthError("Anda harus masuk terlebih dahulu");
  }

  const subject = identity.subject;

  // Jalur utama: `subject` dari Convex Auth berbentuk
  // `<idDokumenUsers>|<idSesi>`, jadi dokumen staff langsung bisa diambil.
  const [userDocId] = subject.split("|");
  let user: Doc<"users"> | null = null;
  if (userDocId) {
    try {
      user = await ctx.db.get(userDocId as Id<"users">);
    } catch {
      user = null;
    }
  }

  // Cadangan untuk dokumen lama yang menyimpan `subject` eksplisit.
  if (!user) {
    user = await ctx.db
      .query("users")
      .withIndex("by_subject", (q) => q.eq("subject", subject))
      .unique();
  }

  // Cadangan terakhir: akun hasil seeding lama yang ditautkan lewat email.
  if (!user && identity.email) {
    user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", identity.email!))
      .unique();
  }

  if (!user) {
    throw new AuthError(
      "Akun Anda belum terdaftar di sistem 6Mart. Hubungi Super Admin.",
    );
  }
  if (!user.roleKey) {
    throw new AuthError(
      "Akun Anda belum memiliki peran di sistem 6Mart. Hubungi Super Admin.",
    );
  }
  if (user.isActive === false) {
    throw new AuthError("Akun Anda dinonaktifkan. Hubungi Super Admin.");
  }

  return toSessionUser(user, subject);
}

export function toSessionUser(user: Doc<"users">, subject: string): SessionUser {
  const roleKey = (user.roleKey ?? ROLES.STUDENT) as RoleKey;
  return {
    id: user._id,
    name: user.name ?? user.email ?? "Pengguna",
    email: user.email ?? "",
    roleKey,
    permissions: user.permissions ?? permissionsForRole(roleKey),
    subject,
  };
}

/** Resolve user tanpa throw (untuk query publik). */
export async function optionalUser(ctx: QueryCtx | MutationCtx) {
  try {
    return await requireUser(ctx);
  } catch {
    return null;
  }
}

export function assertPermission(user: SessionUser, permission: string): void {
  if (!user.permissions.includes(permission)) {
    throw new ForbiddenError(
      `Akses ditolak. Role ${roleLabel(user.roleKey)} tidak memiliki izin "${permission}".`,
    );
  }
}

export function can(user: SessionUser, permission: string): boolean {
  return user.permissions.includes(permission);
}

export function roleLabel(roleKey: string): string {
  return ROLE_LABELS[roleKey as RoleKey] ?? roleKey;
}

export function actorName(user: SessionUser): string {
  return `${user.name} (${roleLabel(user.roleKey)})`;
}

export function actorIdOf(user: SessionUser): string {
  return user.id;
}

/** Helper arg validator untuk permission string. */
export const permissionArg = v.string();

/**
 * Catat audit log. TIDAK boleh melempar error — audit tidak boleh
 * menggagalkan transaksi bisnis. Error dicatat best-effort.
 */
export async function writeAudit(
  ctx: MutationCtx,
  input: {
    user: SessionUser;
    action: string;
    entityType: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ipAddress?: string;
    note?: string;
  },
): Promise<void> {
  try {
    await ctx.db.insert("auditLogs", {
      userId: input.user.id,
      userName: input.user.name,
      userRole: input.user.roleKey,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      oldValue: input.oldValue === undefined ? undefined : safeJson(input.oldValue),
      newValue: input.newValue === undefined ? undefined : safeJson(input.newValue),
      ipAddress: input.ipAddress,
      note: input.note,
      createdAt: Date.now(),
    });
  } catch {
    // Audit best-effort — jangan menggagalkan transaksi bisnis.
  }
}

function safeJson(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    return json && json.length > 4000 ? `${json.slice(0, 4000)}…` : json;
  } catch {
    return String(value);
  }
}

/** Kirim notifikasi in-app. */
export async function notify(
  ctx: MutationCtx,
  input: {
    recipientType: "USER" | "STUDENT" | "PARENT" | "SYSTEM";
    recipientId?: string;
    title: string;
    message: string;
    severity: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
  },
): Promise<void> {
  try {
    await ctx.db.insert("notifications", {
      channel: "IN_APP",
      recipientType: input.recipientType,
      recipientId: input.recipientId,
      title: input.title,
      message: input.message,
      severity: input.severity,
      isRead: false,
      createdAt: Date.now(),
    });
  } catch {
    // best-effort
  }
}

/** Catat metrik performa (blueprint §52). */
export async function recordMetric(
  ctx: MutationCtx,
  operation: string,
  durationMs: number,
  success: boolean,
  cashierId?: Id<"users">,
  detail?: string,
): Promise<void> {
  try {
    await ctx.db.insert("performanceMetrics", {
      operation,
      durationMs: Math.round(durationMs),
      success,
      cashierId,
      detail,
      createdAt: Date.now(),
    });
  } catch {
    // best-effort
  }
}
