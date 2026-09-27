import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  assertPermission,
  AuthError,
  BusinessRuleError,
  requireUser,
  writeAudit,
  actorName,
} from "./lib/guards";
import { requireString } from "./lib/helpers";
import {
  isRoleKey,
  PERMISSIONS,
  permissionsForRole,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  ROLES,
  type RoleKey,
} from "../lib/rbac";

export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.USER_MANAGE);
    let rows = await ctx.db.query("users").collect();
    if (args.search) {
      const s = args.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          (r.name ?? "").toLowerCase().includes(s) ||
          (r.email ?? "").toLowerCase().includes(s) ||
          (r.roleKey ?? "").toLowerCase().includes(s),
      );
    }
    return rows
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
      .map((r) => ({
        ...r,
        roleLabel: ROLE_LABELS[r.roleKey as RoleKey] ?? r.roleKey,
      }));
  },
});

export const listRoles = query({
  args: {},
  handler: async () => {
    return (Object.keys(ROLES) as RoleKey[]).map((key) => ({
      key,
      name: ROLE_LABELS[key],
      permissions: ROLE_PERMISSIONS[key],
    }));
  },
});

export const listPermissions = query({
  args: {},
  handler: async () => {
    return Array.from(new Set(Object.values(PERMISSIONS)))
      .sort()
      .map((key) => ({ key, module: key.split(".")[0] }));
  },
});

export const get = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const row = await ctx.db.get(args.id);
    if (!row) throw new BusinessRuleError("User tidak ditemukan");
    if (me.id !== args.id) assertPermission(me, PERMISSIONS.USER_MANAGE);
    return { ...row, roleLabel: ROLE_LABELS[row.roleKey as RoleKey] ?? row.roleKey };
  },
});

export const profile = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const row = await ctx.db.get(me.id);
    if (!row) throw new AuthError("Profil tidak ditemukan");
    return {
      ...row,
      roleLabel: ROLE_LABELS[me.roleKey] ?? me.roleKey,
      permissions: me.permissions,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    roleKey: v.string(),
    phone: v.optional(v.string()),
    password: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    assertPermission(me, PERMISSIONS.USER_MANAGE);

    const name = requireString(args.name, "Nama", 120);
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BusinessRuleError("Format email tidak valid");
    }
    if (!isRoleKey(args.roleKey)) {
      throw new BusinessRuleError("Role tidak dikenal");
    }
    if (args.roleKey === ROLES.SUPER_ADMIN && me.roleKey !== ROLES.SUPER_ADMIN) {
      throw new BusinessRuleError("Hanya Super Admin yang dapat membuat akun Super Admin");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new BusinessRuleError("Email sudah terdaftar");

    const now = Date.now();
    const id = await ctx.db.insert("users", {
      name,
      email,
      roleKey: args.roleKey,
      phone: args.phone?.trim() || undefined,
      isActive: true,
      createdAt: now,
    });

    await writeAudit(ctx, {
      user: me,
      action: "CREATE_USER",
      entityType: "user",
      entityId: id,
      newValue: { name, email, roleKey: args.roleKey },
    });

    return { id };
  },
});

export const update = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    roleKey: v.optional(v.string()),
    phone: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    assertPermission(me, PERMISSIONS.USER_MANAGE);

    const target = await ctx.db.get(args.id);
    if (!target) throw new BusinessRuleError("User tidak ditemukan");

    if (target.roleKey === ROLES.SUPER_ADMIN && args.roleKey && args.roleKey !== ROLES.SUPER_ADMIN) {
      throw new BusinessRuleError("Tidak dapat menurunkan role akun Super Admin terakhir");
    }
    if (args.id === me.id && args.isActive === false) {
      throw new BusinessRuleError("Anda tidak dapat menonaktifkan akun sendiri");
    }
    if (args.roleKey && !isRoleKey(args.roleKey)) {
      throw new BusinessRuleError("Role tidak dikenal");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = requireString(args.name, "Nama", 120);
    if (args.roleKey !== undefined) patch.roleKey = args.roleKey;
    if (args.phone !== undefined) patch.phone = args.phone;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.id, patch);
    await writeAudit(ctx, {
      user: me,
      action: "UPDATE_USER",
      entityType: "user",
      entityId: args.id,
      oldValue: { name: target.name, roleKey: target.roleKey, isActive: target.isActive },
      newValue: patch,
    });
    return { ok: true };
  },
});

/**
 * Membuat akun autentikasi (password) untuk user yang sudah ada.
 * Ini memakai alur signUp resmi Convex Auth sehingga password
 * di-hash (Scrypt) di server — tidak pernah disimpan plaintext.
 * Mutation internal: hanya bisa dipanggil dari server/action.
 */
export const ensureAuthAccount = internalAction({
  args: {
    email: v.string(),
    name: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(
      internal.users.byEmail,
      { email: args.email },
    );
    if (!user) {
      throw new BusinessRuleError(`User ${args.email} tidak ada. Jalankan seed terlebih dahulu.`);
    }
    if (user.subject) {
      // Sudah punya akun auth — tidak perlu dibuat ulang.
      return { ok: true, created: false };
    }

    // Memakai alur signUp resmi Convex Auth sehingga password di-hash
    // (Scrypt) di server dan tidak pernah disimpan plaintext.
    const { signInViaProvider } = await import("@convex-dev/auth/server");
    const { Password } = await import("@convex-dev/auth/providers/Password");
    const result = await signInViaProvider(ctx as never, Password as never, {
      flow: "signUp",
      email: args.email,
      password: args.password,
      name: args.name,
    } as never);

    const subject = result?.userId;
    if (subject) {
      await ctx.runMutation(internal.users.setSubject, { id: user._id, subject });
      return { ok: true, created: true };
    }
    return { ok: false, created: false, reason: "Akun gagal dibuat" };
  },
});

export const byEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", args.email))
      .unique();
  },
});

export const setSubject = internalMutation({
  args: { id: v.id("users"), subject: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { subject: args.subject, updatedAt: Date.now() });
    return { ok: true };
  },
});

export const permissionMatrix = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return (Object.keys(ROLES) as RoleKey[]).map((role) => ({
      role,
      label: ROLE_LABELS[role],
      permissions: permissionsForRole(role),
    }));
  },
});

export const describeActor = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    return { name: actorName(me), role: me.roleKey };
  },
});
