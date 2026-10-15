/**
 * Menyiapkan keypair JWT untuk Convex Auth.
 *
 * Convex Auth membutuhkan tiga environment variable di deployment:
 *   - JWT_PRIVATE_KEY     : private key PKCS#8 (RSA / RS256) — dipakai
 *                           @convex-dev/auth untuk menandatangani token.
 *   - JWKS                : public JWK (JSON) — dipakai library untuk endpoint
 *                           /.well-known/jwks.json.
 *   - AUTH_JWKS_DATA_URI  : public JWK yang sama sebagai `data:` URI, dengan
 *                           `kid` "6Mart-0". Inilah kunci yang dipakai
 *                           `src/convex/auth.config.ts` untuk MEMVERIFIKASI
 *                           token (lihat komentar di file itu).
 *
 * Issuer TIDAK ikut ditulis ke mana pun: `auth.config.ts` membacanya dari
 * `CONVEX_SITE_URL` yang disediakan Convex di setiap deployment, sehingga file
 * konfigurasi tidak perlu di-generate ulang per lingkungan.
 *
 * Pemakaian:
 *   bun run auth:keygen           → deployment development (dan .env.local)
 *   bun run auth:keygen -- --prod → deployment production (tanpa menyentuh
 *                                   .env.local; keypair produksi tidak
 *                                   ditinggalkan di sandbox)
 *
 * Jalankan `node scripts/verify-auth.mjs` setelahnya untuk memastikan login
 * masih berhasil.
 */

import { spawnSync } from "node:child_process";
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

const ENV_LOCAL = ".env.local";
const TEMP_ENV = ".convex-auth.env";
const IS_PROD = process.argv.includes("--prod");

/** Harus sama dengan JWT_KID di src/convex/auth.ts. */
const JWT_KID = "6Mart-0";

// Convex Auth mengimpor private key sebagai `rsaEncryption`, jadi harus RSA.
const { privateKey, publicKey } = await generateKeyPair("RS256", {
  modulusLength: 2048,
  extractable: true,
});

const privatePem = await exportPKCS8(privateKey);
const publicJwk = await exportJWK(publicKey);
publicJwk.alg = "RS256";
publicJwk.use = "sig";

// Untuk endpoint /.well-known, jangan sertakan kid: header token dari
// @convex-dev/auth tidak memuat kid, jadi kunci tanpa kid tidak ambigu.
const jwks = JSON.stringify({ keys: [publicJwk] });

// Untuk verifikasi di auth.config.ts, kid WAJIB ada karena token ditandatangani
// ulang oleh `signIn` (src/convex/auth.ts) dengan kid ini.
const jwkWithKid = { ...publicJwk, kid: JWT_KID };
const jwksDataUri =
  "data:application/json;base64," +
  Buffer.from(JSON.stringify({ keys: [jwkWithKid] }), "utf8").toString("base64");

// 1. Nilai multi-line tidak bisa dikirim sebagai argumen CLI (PEM diawali "-"
//    sehingga dibaca sebagai opsi), jadi dikirim lewat file sementara.
writeFileSync(
  TEMP_ENV,
  `JWT_PRIVATE_KEY="${privatePem.replace(/\n/g, "\\n")}"\n` +
    `JWKS="${jwks}"\n` +
    `AUTH_JWKS_DATA_URI="${jwksDataUri}"\n`,
  "utf8",
);

const args = ["convex", "env", "set", "--from-file", TEMP_ENV, "--force"];
if (IS_PROD) args.push("--prod");

const result = spawnSync("bunx", args, {
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
});
rmSync(TEMP_ENV, { force: true });

const output = `${result.stdout || ""}${result.stderr || ""}`
  .split(privatePem)
  .join("<PRIVATE_KEY>")
  .split(jwks)
  .join("<JWKS>")
  .split(jwksDataUri)
  .join("<JWKS_DATA_URI>")
  .trim();

if (result.status !== 0) {
  console.log(`GAGAL mendaftarkan keypair ke deployment${IS_PROD ? " production" : ""}:`);
  console.log(output.slice(0, 600));
  process.exitCode = 1;
} else {
  console.log(
    `Keypair Convex Auth dibuat dan terdaftar di deployment ${
      IS_PROD ? "PRODUCTION" : "development"
    }.`,
  );
}

// 2. Hanya lingkungan development yang nilainya disimpan di .env.local. Keypair
//    production sengaja TIDAK ditulis ke disk sandbox.
if (!IS_PROD && result.status === 0) {
  let existing = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8") : "";
  existing = existing
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("JWT_PRIVATE_KEY=") &&
        !line.startsWith("JWKS=") &&
        !line.startsWith("AUTH_JWKS_DATA_URI="),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n*$/, "\n");

  writeFileSync(
    ENV_LOCAL,
    existing +
      "\n# --- Convex Auth (dihasilkan oleh scripts/generate-auth-jwt.mjs) ---\n" +
      `JWT_PRIVATE_KEY=${JSON.stringify(privatePem)}\n` +
      `JWKS=${JSON.stringify(jwks)}\n` +
      `AUTH_JWKS_DATA_URI=${JSON.stringify(jwksDataUri)}\n`,
    "utf8",
  );
  console.log(`${ENV_LOCAL} diperbarui.`);
}

console.log(
  IS_PROD
    ? "Selanjutnya: deploy fungsi ke production (`bunx convex deploy`) lalu uji login di produksi."
    : "Selanjutnya: `node scripts/verify-auth.mjs` untuk memastikan login masih berhasil.",
);
