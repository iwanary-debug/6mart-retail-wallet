/**
 * Menyiapkan keypair JWT untuk Convex Auth (lingkungan DEVELOPMENT).
 *
 * Convex Auth membutuhkan dua environment variable di deployment:
 *   - JWT_PRIVATE_KEY : private key PKCS#8 (RSA / RS256)
 *   - JWKS             : public JWK dalam format JSON
 *
 * Untuk production, keypair harus dibuat dan disimpan di secret manager lalu
 * di-inject lewat `freebuff-deploy env set` — jangan commit key ke repo.
 *
 * Pemakaian:  bun run auth:keygen
 */

import { spawnSync } from "node:child_process";
import { generateKeyPair, exportPKCS8, exportJWK } from "jose";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

const ENV_LOCAL = ".env.local";
const TEMP_ENV = ".convex-auth.env";
const AUTH_CONFIG = "src/convex/auth.config.ts";

/**
 * Issuer = CONVEX_SITE_URL deployment aktif. Nilai ini juga ditulis ke
 * .env.local sebagai VITE_CONVEX_SITE_URL supaya token yang diterbitkan dan
 * yang diverifikasi memakai issuer yang sama.
 */
const ISSUER =
  process.env.VITE_CONVEX_SITE_URL?.trim() ||
  "https://vibrant-puffin-745.convex.site";

// Convex Auth mengimpor private key sebagai `rsaEncryption`, jadi harus RSA.
const { privateKey, publicKey } = await generateKeyPair("RS256", {
  modulusLength: 2048,
  extractable: true,
});

const privatePem = await exportPKCS8(privateKey);
const publicJwk = await exportJWK(publicKey);
publicJwk.alg = "RS256";
publicJwk.use = "sig";
// Header token dari @convex-dev/auth tidak memuat `kid`, jadi JWKS juga tidak
// diberi kid agar backend dapat memilih kunci tanpa ambigu.
delete publicJwk.kid;
const jwks = JSON.stringify({ keys: [publicJwk] });

// 1. Tulis ke .env.local agar proses preview (Vite/Convex CLI) ikut memuatnya.
let existing = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8") : "";
existing = existing
  .split("\n")
  .filter(
    (line) =>
      !line.startsWith("JWT_PRIVATE_KEY=") &&
      !line.startsWith("JWKS=") &&
      !line.startsWith("VITE_CONVEX_SITE_URL="),
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
    `VITE_CONVEX_SITE_URL=${JSON.stringify(ISSUER)}\n`,
  "utf8",
);

// 2. Daftarkan ke deployment Convex. Nilai multi-line tidak bisa dikirim sebagai
//    argumen CLI (PEM diawali "-" sehingga dibaca sebagai opsi), jadi lewat file.
writeFileSync(
  TEMP_ENV,
  `JWT_PRIVATE_KEY="${privatePem.replace(/\n/g, "\\n")}"\nJWKS="${jwks}"\nVITE_CONVEX_SITE_URL="${ISSUER}"\n`,
  "utf8",
);
const result = spawnSync("bunx", ["convex", "env", "set", "--from-file", TEMP_ENV, "--force"], {
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
});
rmSync(TEMP_ENV, { force: true });

// 3. Tulis auth.config.ts dengan public key di-inline, sehingga backend dapat
//    memverifikasi token tanpa OIDC discovery.
writeFileSync(
  AUTH_CONFIG,
  `import type { AuthConfig } from "convex/server";

/**
 * DIHASILKAN OLEH scripts/generate-auth-jwt.mjs — JANGAN DIEDIT TANGAN.
 *
 * Konfigurasi verifikasi JWT untuk deployment 6Mart.
 *
 * Token diterbitkan @convex-dev/auth dengan \`iss\` = CONVEX_SITE_URL dan
 * \`aud\` = "convex". Public key ditulis inline agar backend tidak perlu
 * melakukan OIDC discovery.
 *
 * Jalankan \`bun run auth:keygen\` bila keypair perlu di-regenerate.
 */
const JWKS = ${JSON.stringify(JSON.parse(jwks), null, 2)};

const config = {
  providers: [
    {
      domain: ${JSON.stringify(ISSUER)},
      applicationID: "convex",
    },
  ],
};

export default config satisfies AuthConfig;
`,
  "utf8",
);
console.log(`auth.config.ts ditulis ke ${AUTH_CONFIG}`);

if (result.status === 0) {
  console.log("Keypair Convex Auth dibuat dan terdaftar di deployment.");
} else {
  const safe = `${result.stderr || ""}${result.stdout || ""}`
    .split(privatePem)
    .join("<PRIVATE_KEY>")
    .split(jwks)
    .join("<JWKS>")
    .slice(0, 500);
  console.log(`Keypair ditulis ke .env.local, tetapi gagal didaftarkan: ${safe.trim()}`);
  process.exitCode = 1;
}
