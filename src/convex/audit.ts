import { v } from "convex/values";
import { query } from "./_generated/server";
import { assertPermission, requireUser } from "./lib/guards";
import { startOfDay } from "./lib/helpers";
import { PERMISSIONS } from "../lib/rbac";

const DAY = 86_400_000;

export const list = query({
  args: {
    action: v.optional(v.string()),
    entityType: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.AUDIT_VIEW);
    let rows = await ctx.db.query("auditLogs").collect();
    if (args.action) rows = rows.filter((r) => r.action === args.action);
    if (args.entityType) rows = rows.filter((r) => r.entityType === args.entityType);
    if (args.userId) rows = rows.filter((r) => r.userId === args.userId);
    if (args.from !== undefined) rows = rows.filter((r) => r.createdAt >= args.from!);
    if (args.to !== undefined) rows = rows.filter((r) => r.createdAt <= args.to!);
    if (args.search) {
      const s = args.search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.action.toLowerCase().includes(s) ||
          r.userName.toLowerCase().includes(s) ||
          (r.entityId ?? "").toLowerCase().includes(s) ||
          (r.note ?? "").toLowerCase().includes(s),
      );
    }
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return { total: rows.length, items: rows.slice(0, Math.min(args.limit ?? 100, 500)) };
  },
});

export const summary = query({
  args: { days: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.AUDIT_VIEW);
    const days = Math.min(args.days ?? 7, 90);
    const since = startOfDay(Date.now()) - (days - 1) * DAY;
    const rows = (await ctx.db.query("auditLogs").collect()).filter(
      (r) => r.createdAt >= since,
    );

    const byAction: Record<string, number> = {};
    const byUser: Record<string, number> = {};
    for (const r of rows) {
      byAction[r.action] = (byAction[r.action] ?? 0) + 1;
      byUser[r.userName] = (byUser[r.userName] ?? 0) + 1;
    }

    return {
      total: rows.length,
      byAction: Object.entries(byAction)
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count),
      byUser: Object.entries(byUser)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      actions: Array.from(new Set(rows.map((r) => r.action))).sort(),
      entityTypes: Array.from(new Set(rows.map((r) => r.entityType))).sort(),
    };
  },
});

export const exportCsv = query({
  args: { from: v.optional(v.number()), to: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.AUDIT_VIEW);
    const from = args.from ?? startOfDay(Date.now()) - 30 * DAY;
    const to = args.to ?? Date.now();
    const escape = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = (await ctx.db.query("auditLogs").collect())
      .filter((r) => r.createdAt >= from && r.createdAt <= to)
      .sort((a, b) => b.createdAt - a.createdAt);
    const header = ["Waktu", "User", "Role", "Aksi", "Entitas", "ID Entitas", "Nilai Lama", "Nilai Baru", "Catatan"];
    const body = rows.map((r) => [
      new Date(r.createdAt).toISOString(),
      r.userName,
      r.userRole ?? "",
      r.action,
      r.entityType,
      r.entityId ?? "",
      r.oldValue ?? "",
      r.newValue ?? "",
      r.note ?? "",
    ]);
    return [header, ...body].map((r) => r.map(escape).join(",")).join("\n");
  },
});
