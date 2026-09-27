import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { actionGeneric, httpRouter } from "convex/server";
import { v } from "convex/values";
import { SignJWT, importPKCS8 } from "jose";
import { api } from "./_generated/api";
import { mountWalletWebhook } from "./payments";

/**
 * 6Mart memakai authentication berbasis password yang di-hash dengan Scrypt
 * (@convex-dev/auth Password provider). Ini BUKAN fake auth:
 * password di-hash di server, session httpOnly/JWT, RBAC ditegakkan di server.
 *
 * Auto sign-up dari sisi publik tidak diaktifkan — akun staff hanya dibuat
 * oleh Super Admin melalui modul Users / seeding, sehingga data staff terkendali.
 */
const authModule = convexAuth({
  providers: [
    Password({
      validatePasswordRequirements: (password: string) => {
        if (password.length < 8) {
          throw new Error("Password minimal 8 karakter");
        }
        if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
          throw new Error("Password harus memuat huruf dan angka");
        }
      },
    }),
  ],
  session: {
    totalDurationMs: 1000 * 60 * 60 * 12, // 12 jam
    inactiveDurationMs: 1000 * 60 * 60 * 2, // 2 jam idle
  },
});

export const { auth, signOut, store, isAuthenticated } = authModule;

/**
 * Action sign-in asli dari Convex Auth, diekspor agar bisa dipanggil lewat
 * `ctx.runAction` oleh wrapper di bawah. Dipanggil langsung dari klien akan
 * menghasilkan token tanpa `kid` yang ditolak backend, jadi UI selalu memakai
 * wrapper `signIn`.
 */
export const signInBase = authModule.signIn;

/**
 * `kid` yang harus cocok dengan JWK di `auth.config.ts`.
 *
 * Backend Convex menolak token custom JWT yang header-nya tidak memuat `kid`,
 * sedangkan @convex-dev/auth menandatangani token hanya dengan `{ alg }`.
 * Karena itu action `signIn` dibungkus: token dari library diteruskan ke
 * klien apa adanya, sementara salinan yang sama ditandatangani ulang dengan
 * private key deployment dan header `{ alg, kid }`.
 */
const JWT_KID = "6Mart-0";

/** Header + payload token apa adanya, apa pun aslinya. */
function decodeSegment(segment: string): Record<string, unknown> {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const json = atob(padded);
  const bytes = Uint8Array.from(json, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

/** Menandatangani ulang `token` dengan header `kid` yang diwajibkan Convex. */
async function withKeyId(token: string): Promise<string> {
  const parts = token.split(".");
  if (parts.length !== 3) return token;

  const claims = decodeSegment(parts[1]);
  const issuedAt = typeof claims.iat === "number" ? claims.iat : Math.floor(Date.now() / 1000);
  const expiresAt =
    typeof claims.exp === "number" ? claims.exp : issuedAt + 60 * 60;

  const privateKeyPem = process.env.JWT_PRIVATE_KEY;
  if (!privateKeyPem) return token;

  // PEM di environment bisa tersimpan dengan literal "\n" (hasil import CLI).
  const privateKey = await importPKCS8(
    privateKeyPem.replace(/\\n/g, "\n"),
    "RS256",
  );

  const builder = new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: JWT_KID, typ: "JWT" })
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt);

  if (typeof claims.iss === "string") builder.setIssuer(claims.iss);
  if (typeof claims.aud === "string") builder.setAudience(claims.aud);

  return builder.sign(privateKey);
}

/**
 * Action yang dipanggil klien untuk sign in sekaligus refresh session.
 *
 * Semua jalur refresh token (`refreshToken` tanpa `provider`) juga melewati
 * action ini, jadi token hasil refresh ikut mendapat `kid`.
 */
export const signIn = actionGeneric({
  args: {
    provider: v.optional(v.string()),
    params: v.optional(v.any()),
    verifier: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    calledBy: v.optional(v.string()),
  },
  // Tipe ditulis eksplisit: `api.auth` memuat `signIn` ini sendiri, sehingga
  // tanpa anotasi TypeScript mendeteksi siklus dan membuat tipe jadi `any`.
  handler: async (
    ctx,
    args,
  ): Promise<{
    redirect?: string;
    verifier?: string;
    started?: boolean;
    tokens?: { token: string; refreshToken: string } | null;
  }> => {
    const result = await ctx.runAction(api.auth.signInBase, args);
    const tokens = result.tokens;
    if (!tokens?.token) return result;
    return { ...result, tokens: { ...tokens, token: await withKeyId(tokens.token) } };
  },
});

// SATU-SATUNYA HTTP router di folder `src/convex`. Convex hanya mengizinkan
// satu `export default` httpRouter, sehingga semua route HTTP (auth + webhook
// pembayaran) didaftarkan di sini.
const http = httpRouter();
authModule.auth.addHttpRoutes(http);
mountWalletWebhook(http);

export default http;
