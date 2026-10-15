import type { AuthConfig } from "convex/server";

/**
 * Konfigurasi verifikasi JWT Convex Auth untuk 6Mart.
 *
 * Token diterbitkan @convex-dev/auth dengan `iss` = CONVEX_SITE_URL deployment
 * dan `aud` = "convex".
 *
 * Kedua nilai dibaca dari environment deployment sehingga SATU file ini
 * berlaku untuk development DAN production:
 *
 *   - `CONVEX_SITE_URL`    disediakan OTOMATIS oleh Convex di setiap
 *                          deployment (dev maupun prod). Ini issuer yang harus
 *                          diverifikasi, jadi TIDAK BOLEH di-hardcode:
 *                          kalau ditulis manual, login di produksi gagal
 *                          karena token ditandatangani untuk issuer lain.
 *   - `AUTH_JWKS_DATA_URI` public key milik deployment (data: URI hasil
 *                          `bun run auth:keygen`, atau `-- --prod` untuk
 *                          production).
 *
 * Catatan: Convex MENOLAK push bila env var yang dirujuk di file ini belum
 * di-set di deployment, jadi nilainya selalu ada saat runtime — bukan bug bila
 * `convex dev` gagal dengan pesan "used in auth config file but its value was
 * not set", melainkan pengingat untuk menjalankan `bun run auth:keygen`.
 * Helper di bawah menjaga jaminan itu tetap berlaku saat file ini dibaca ulang.
 *
 * Dua batasan backend Convex menentukan bentuk file ini:
 *
 * 1. Field `jwks` hanya menerima string URL, bukan objek JSON. Agar tidak
 *    bergantung pada HTTP actions / OIDC discovery, JWKS disisipkan sebagai
 *    `data:` URI (didukung resmi oleh Convex untuk custom JWT).
 * 2. Provider `customJwt` mewajibkan header `kid` pada token. Library
 *    @convex-dev/auth tidak menambahkan `kid`, sehingga `src/convex/auth.ts`
 *    membungkus action `signIn` untuk menandatangani ulang token dengan
 *    `kid` yang sama dengan JWK di `AUTH_JWKS_DATA_URI`.
 */
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Environment variable ${name} belum di-set di deployment ini. ` +
        'Jalankan "bun run auth:keygen" (tambahkan "-- --prod" untuk production).',
    );
  }
  return value;
}

const config = {
  providers: [
    {
      type: "customJwt" as const,
      applicationID: "convex",
      issuer: requiredEnv("CONVEX_SITE_URL"),
      jwks: requiredEnv("AUTH_JWKS_DATA_URI"),
      algorithm: "RS256" as const,
    },
  ],
};

export default config satisfies AuthConfig;
