import type { HttpRouter } from "convex/server";
import { v } from "convex/values";
import {
  httpAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  assertPermission,
  BusinessRuleError,
  requireUser,
  writeAudit,
} from "./lib/guards";
import { formatDateCode } from "../lib/codes";
import { beginIdempotent, completeIdempotent } from "./lib/helpers";
import { mutateWallet } from "./lib/walletEngine";
import { getPaymentProvider } from "./providers";
import { PERMISSIONS } from "../lib/rbac";

/**
 * Virtual Account & payment provider (V1.1, blueprint §45).
 *
 * Arsitektur sudah siap untuk provider nyata:
 *   Parent → Bank/Provider → Virtual Account → Webhook → 6Mart → Wallet
 *
 * Saat ini memakai SANDBOX provider sehingga seluruh alur dapat diuji.
 */

export const createVirtualAccount = mutation({
  args: {
    studentId: v.id("students"),
    amount: v.number(),
    expiresMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_TOPUP);
    if (args.amount <= 0) throw new BusinessRuleError("Nominal harus lebih dari 0");

    const wallet = await ctx.db
      .query("wallets")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .unique();
    if (!wallet) throw new BusinessRuleError("Wallet tidak ditemukan");
    const student = await ctx.db.get(args.studentId);
    if (!student) throw new BusinessRuleError("Santri tidak ditemukan");

    const provider = getPaymentProvider();
    const expiresAt = Date.now() + (args.expiresMinutes ?? 60) * 60_000;
    const va = await provider.createVirtualAccount({
      walletId: wallet._id,
      studentId: args.studentId,
      studentName: student.name,
      amount: args.amount,
      expiresAt,
    });
    if (!va.ok || !va.data) {
      throw new BusinessRuleError(`Gagal membuat virtual account: ${va.error ?? "unknown"}`);
    }

    const now = Date.now();
    const count = await ctx.db.query("walletTopups").collect();
    const code = `TOP-${formatDateCode(now)}-${String(count.length + 1).padStart(6, "0")}`;

    const topupId = await ctx.db.insert("walletTopups", {
      code,
      studentId: args.studentId,
      walletId: wallet._id,
      amount: args.amount,
      method: "VIRTUAL_ACCOUNT",
      status: "PENDING",
      provider: provider.name,
      providerReference: va.reference,
      virtualAccountNumber: va.data.accountNumber,
      createdAt: now,
      updatedAt: now,
    });

    await writeAudit(ctx, {
      user,
      action: "CREATE_VIRTUAL_ACCOUNT",
      entityType: "walletTopup",
      entityId: topupId,
      newValue: { code, accountNumber: va.data.accountNumber, amount: args.amount },
    });

    return {
      topupId,
      code,
      accountNumber: va.data.accountNumber,
      bankCode: va.data.bankCode,
      amount: args.amount,
      expiresAt: va.data.expiresAt,
      provider: provider.name,
      environment: provider.environment,
      isSandbox: provider.environment === "SANDBOX",
    };
  },
});

// Catatan: router HTTP (termasuk route webhook di bawah) dideklarasikan di
// `auth.ts` sebagai satu-satunya `export default`. Convex hanya mengizinkan
// satu HTTP router per folder functions, sehingga modul ini tidak boleh
// mengekspor router sendiri.

export const listTopups = query({
  args: { status: v.optional(v.string()), studentId: v.optional(v.id("students")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_VIEW);
    let rows = await ctx.db.query("walletTopups").collect();
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    if (args.studentId) rows = rows.filter((r) => r.studentId === args.studentId);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.slice(0, 200);
  },
});

export const listWithdrawals = query({
  args: { status: v.optional(v.string()), studentId: v.optional(v.id("students")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_VIEW);
    let rows = await ctx.db.query("walletWithdrawals").collect();
    if (args.status) rows = rows.filter((r) => r.status === args.status);
    if (args.studentId) rows = rows.filter((r) => r.studentId === args.studentId);
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return rows.slice(0, 200);
  },
});

/**
 * Simulasi pembayaran VA berhasil (untuk demo/testing).
 * Membuktikan idempotency: webhook yang sama dua kali hanya menambah saldo sekali.
 */
export const simulateVaPayment = mutation({
  args: { topupCode: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    assertPermission(user, PERMISSIONS.WALLET_TOPUP);

    const topup = await ctx.db
      .query("walletTopups")
      .withIndex("by_code", (q) => q.eq("code", args.topupCode))
      .unique();
    if (!topup) throw new BusinessRuleError("Top up tidak ditemukan");
    if (topup.status === "SUCCESS") {
      throw new BusinessRuleError("Top up ini sudah berhasil");
    }

    const hit = await beginIdempotent(
      ctx,
      "wallet.va.callback",
      `${topup.provider ?? "sandbox"}:${topup.code}`,
      String(topup.amount),
      user.id,
    );
    if (hit.status === "REPLAY") return { ...(hit.result as any), replayed: true };

    const result = await mutateWallet(ctx, user, {
      studentId: topup.studentId,
      type: "TOPUP",
      amount: topup.amount,
      note: `Pembayaran virtual account ${topup.code}`,
      referenceType: "walletTopup",
      referenceId: topup.code,
      method: "VIRTUAL_ACCOUNT",
      provider: topup.provider,
      providerReference: topup.virtualAccountNumber,
      idempotencyKey: `${topup.code}-va`,
    });

    await ctx.db.patch(topup._id, {
      status: "SUCCESS",
      paidAt: Date.now(),
      journalEntryId: result.journalEntryId,
      updatedAt: Date.now(),
    });

    const payload = { topupId: topup._id, balanceAfter: result.balanceAfter };
    await completeIdempotent(ctx, "wallet.va.callback", `${topup.provider ?? "sandbox"}:${topup.code}`, payload);
    return { ...payload, replayed: false };
  },
});

/**
 * Worker webhook (internal). Dipanggil oleh HTTP action di bawah.
 * Idempotent berdasarkan `provider + eventId` dan `topup.code`.
 */
export const processWebhookEvent = internalMutation({
  args: {
    provider: v.string(),
    eventId: v.string(),
    eventType: v.string(),
    payload: v.string(),
    status: v.string(),
    accountNumber: v.optional(v.string()),
    amount: v.optional(v.number()),
    paidAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_provider_event", (q) =>
        q.eq("provider", args.provider).eq("eventId", args.eventId),
      )
      .unique();

    if (existing && existing.status === "PROCESSED") {
      return { ok: true, duplicate: true, credited: false };
    }

    const eventDocId =
      existing?._id ??
      (await ctx.db.insert("webhookEvents", {
        provider: args.provider,
        eventId: args.eventId,
        eventType: args.eventType,
        payload: args.payload.slice(0, 4000),
        status: "RECEIVED",
        createdAt: Date.now(),
      }));

    try {
      let credited = false;
      if (args.status === "PAID" && args.accountNumber && args.amount) {
        const topup = await ctx.db
          .query("walletTopups")
          .filter(
            (q) =>
              q.eq(q.field("virtualAccountNumber"), args.accountNumber!) &&
              q.eq(q.field("amount"), args.amount!),
          )
          .first();

        if (topup && topup.status === "PENDING") {
          const idemKey = `${topup.provider ?? "sandbox"}:${topup.code}`;
          const hit = await beginIdempotent(
            ctx,
            "wallet.va.callback",
            idemKey,
            String(topup.amount),
          );
          if (hit.status === "NEW") {
            const systemUser = await firstSystemUser(ctx);
            if (systemUser) {
              const result = await mutateWallet(ctx, systemUser, {
                studentId: topup.studentId,
                type: "TOPUP",
                amount: topup.amount,
                note: `Pembayaran VA ${topup.code}`,
                referenceType: "walletTopup",
                referenceId: topup.code,
                method: "VIRTUAL_ACCOUNT",
                provider: topup.provider,
                providerReference: topup.virtualAccountNumber,
                idempotencyKey: `${topup.code}-va`,
              });
              await ctx.db.patch(topup._id, {
                status: "SUCCESS",
                paidAt: args.paidAt ?? Date.now(),
                journalEntryId: result.journalEntryId,
                updatedAt: Date.now(),
              });
              await completeIdempotent(ctx, "wallet.va.callback", idemKey, {
                topupId: topup._id,
                balanceAfter: result.balanceAfter,
              });
              credited = true;
            }
          }
        }
      }
      await ctx.db.patch(eventDocId, { status: "PROCESSED", processedAt: Date.now() });
      return { ok: true, duplicate: false, credited };
    } catch (error) {
      await ctx.db.patch(eventDocId, {
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});

/**
 * Webhook HTTP dari provider (sandbox maupun production).
 * Handler-nya di-mount pada router tunggal di `auth.ts` (lihat
 * `mountWalletWebhook`) agar tetap hanya ada satu `httpRouter` di folder
 * functions, seperti yang diwajibkan Convex.
 */
export async function mountWalletWebhook(router: HttpRouter) {
  router.route({
    path: "/api/v1/wallets/webhook",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const provider = getPaymentProvider();
      const body = await request.text();
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      const json = (data: unknown, status: number) =>
        new Response(JSON.stringify(data), {
          status,
          headers: { "Content-Type": "application/json" },
        });

      const valid = await provider.verifyWebhook(headers, body);
      if (!valid) return json({ error: "invalid signature" }, 401);

      const event = await provider.parseWebhook(headers, body);
      if (!event.eventId) return json({ error: "missing eventId" }, 400);

      try {
        const result = await ctx.runMutation(internal.payments.processWebhookEvent, {
          provider: event.provider,
          eventId: event.eventId,
          eventType: event.eventType,
          payload: event.raw,
          status: event.status,
          accountNumber: event.accountNumber,
          amount: event.amount,
          paidAt: event.paidAt,
        });
        return json({ ...result }, 200);
      } catch {
        return json({ error: "processing failed" }, 500);
      }
    }),
  });
}

async function firstSystemUser(ctx: any) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_role", (q: any) => q.eq("roleKey", "super_admin"))
    .first();
  if (!user) return null;
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    roleKey: "super_admin" as const,
    permissions: Object.values(PERMISSIONS) as string[],
    subject: user.subject ?? "system",
  };
}
