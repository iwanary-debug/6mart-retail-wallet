import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  assertPermission,
  BusinessRuleError,
  requireUser,
  writeAudit,
} from "./lib/guards";
import { DEFAULT_SETTINGS, getSettings, settingsMeta, upsertSetting } from "./lib/helpers";
import { PERMISSIONS } from "../lib/rbac";
import * as accounting from "../lib/accounting";

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return await getSettings(ctx);
  },
});

export const getMeta = query({
  args: {},
  handler: async () => {
    const meta = settingsMeta();
    return Object.entries(meta).map(([key, value]) => ({
      key,
      group: value.group,
      label: value.label,
      type: value.type,
      defaultValue: DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS],
    }));
  },
});

export const update = mutation({
  args: {
    settings: v.array(
      v.object({
        key: v.string(),
        value: v.union(v.string(), v.number(), v.boolean()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.SETTINGS_MANAGE);

    const valid = new Set(Object.keys(DEFAULT_SETTINGS));
    for (const item of args.settings) {
      if (!valid.has(item.key)) {
        throw new BusinessRuleError(`Pengaturan "${item.key}" tidak dikenal`);
      }
      const meta = settingsMeta()[item.key as keyof typeof DEFAULT_SETTINGS];
      if (meta.type === "NUMBER" && typeof item.value !== "number") {
        throw new BusinessRuleError(`Pengaturan "${item.key}" harus berupa angka`);
      }
      if (meta.type === "BOOLEAN" && typeof item.value !== "boolean") {
        throw new BusinessRuleError(`Pengaturan "${item.key}" harus true/false`);
      }
    }

    for (const item of args.settings) {
      await upsertSetting(
        ctx,
        item.key as keyof typeof DEFAULT_SETTINGS,
        item.value as string | number | boolean,
      );
    }

    await writeAudit(ctx, {
      user,
      action: "UPDATE_SETTINGS",
      entityType: "settings",
      newValue: args.settings,
    });
    return { ok: true, settings: await getSettings(ctx) };
  },
});

// ------------------------------------------------------------- NOTIFIKASI ----

export const listNotifications = query({
  args: { limit: v.optional(v.number()), unreadOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    let rows = await ctx.db.query("notifications").collect();
    rows = rows.filter(
      (r) =>
        r.recipientType === "SYSTEM" ||
        (r.recipientType === "USER" && r.recipientId === user.id) ||
        (r.recipientType === "STUDENT" && r.recipientId === undefined),
    );
    if (args.unreadOnly) rows = rows.filter((r) => !r.isRead);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return {
      total: rows.length,
      unread: rows.filter((r) => !r.isRead).length,
      items: rows.slice(0, Math.min(args.limit ?? 30, 100)),
    };
  },
});

export const markRead = mutation({
  args: { id: v.optional(v.id("notifications")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (args.id) {
      await ctx.db.patch(args.id, { isRead: true });
      return { ok: true };
    }
    const rows = await ctx.db.query("notifications").collect();
    for (const r of rows) {
      if (!r.isRead && (r.recipientType === "SYSTEM" || r.recipientId === user.id)) {
        await ctx.db.patch(r._id, { isRead: true });
      }
    }
    return { ok: true };
  },
});

// ------------------------------------------------------------------ COA ----

/** Inisialisasi COA standar 6Mart bila belum ada. */
export const seedChartOfAccounts = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.FINANCE_JOURNAL);
    const existing = await ctx.db.query("chartOfAccounts").collect();
    if (existing.length > 0) return { ok: true, skipped: true, count: existing.length };
    const now = Date.now();
    for (const account of accounting.CHART_OF_ACCOUNTS) {
      await ctx.db.insert("chartOfAccounts", {
        ...account,
        isActive: true,
        createdAt: now,
      });
    }
    return { ok: true, skipped: false, count: accounting.CHART_OF_ACCOUNTS.length };
  },
});

export const listPermissionsReference = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return {
      accounts: accounting.CHART_OF_ACCOUNTS.map((a) => ({
        code: a.code,
        name: a.name,
        type: a.type,
        normalBalance: a.normalBalance,
      })),
      permissions: Object.values(PERMISSIONS),
    };
  },
});

// ---------------------------------------------------------------- PARENTS ----

export const listParents = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PARENT_MANAGE);
    let rows = await ctx.db.query("parents").collect();
    if (args.search) {
      const s = args.search.toLowerCase();
      rows = rows.filter(
        (r) => r.name.toLowerCase().includes(s) || r.phone.includes(s) || r.code.toLowerCase().includes(s),
      );
    }
    const links = await ctx.db.query("parentStudents").collect();
    return rows
      .map((p) => {
        const children = links
          .filter((l) => l.parentId === p._id)
          .map((l) => l.studentId);
        return { ...p, childCount: children.length, children };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const createParent = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PARENT_MANAGE);
    const now = Date.now();
    const count = await ctx.db.query("parents").collect();
    const code = `PRN-${String(count.length + 1).padStart(4, "0")}`;
    const id = await ctx.db.insert("parents", {
      code,
      name: args.name.trim(),
      phone: args.phone.trim(),
      email: args.email,
      address: args.address,
      status: "ACTIVE",
      createdAt: now,
    });
    await writeAudit(ctx, {
      user,
      action: "CREATE_PARENT",
      entityType: "parent",
      entityId: id,
      newValue: { code, name: args.name },
    });
    return { id, code };
  },
});

export const linkParentStudent = mutation({
  args: {
    parentId: v.id("parents"),
    studentId: v.id("students"),
    relation: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.PARENT_MANAGE);
    const existing = await ctx.db
      .query("parentStudents")
      .withIndex("by_parent", (q) => q.eq("parentId", args.parentId))
      .collect();
    if (existing.some((e) => e.studentId === args.studentId)) {
      throw new BusinessRuleError("Wali sudah terhubung dengan santri ini");
    }
    const now = Date.now();
    const id = await ctx.db.insert("parentStudents", {
      parentId: args.parentId,
      studentId: args.studentId,
      relation: args.relation ?? "WALI",
      isPrimary: existing.length === 0,
      createdAt: now,
      updatedAt: now,
    });
    return { id };
  },
});
