import type { AuthConfig } from "convex/server";

/**
 * DIHASILKAN OLEH scripts/generate-auth-jwt.mjs — JANGAN DIEDIT TANGAN.
 *
 * Konfigurasi verifikasi JWT untuk deployment 6Mart.
 *
 * Token diterbitkan @convex-dev/auth dengan `iss` = CONVEX_SITE_URL dan
 * `aud` = "convex".
 *
 * Dua batasan backend Convex menentukan bentuk file ini:
 *
 * 1. Field `jwks` hanya menerima string URL, bukan objek JSON. Agar tidak
 *    bergantung pada HTTP actions / OIDC discovery, JWKS disisipkan sebagai
 *    `data:` URI (didukung resmi oleh Convex untuk custom JWT).
 * 2. Provider `customJwt` mewajibkan header `kid` pada token. Library
 *    @convex-dev/auth tidak menambahkan `kid`, sehingga `src/convex/auth.ts`
 *    membungkus action `signIn` untuk menandatangani ulang token dengan
 *    `kid` di sini.
 *
 * Jalankan `bun run auth:keygen` bila keypair perlu di-regenerate.
 */
const JWKS_DATA_URI =
  "data:application/json;base64,eyJrZXlzIjpbeyJrdHkiOiJSU0EiLCJuIjoiakV3N2dDV3BwQVNBVHJQN2V4Sm1FMGJFWW9Lc0N2SVJGR0R4YjJ2OWNLXy1MRjZqZjhadlp1LThPWXIzMlRlc0k5c0ktSTRsdllpc19zeURZbjN0b3hZQmNJUTA3b0k5a3BtejRIWGlGVG1JUWJjQ0s0azJpRTFzR0d4RXFCd00wYVdEeEdJbERTXzdZcWlqM21NdGFHSml4MVkzZnNuRWpRR3FoQXh4WkZPWVR3VGJqX3dHR243ZGw3VWxRdkc4b1BSZkpLalY3eUNrWHhaQkh6UmZnUzBIOE8xTVVvUk5RYUY4azhMeEpQTVJtVjl6OUlPaXYtOVMzZzNfRWQzN1ZiSS0ycmZZQnpSVHE3dUVvdWxtWDRVMWZmUEJSbkFvbnhabmxYTkhFUWtVdlRQMkQ4M1BsWGpnRzlfcnNoNWxSdjdCVHAwcFRJZDVDVG1ZNHRuTnV3IiwiZSI6IkFRQUIiLCJhbGciOiJSUzI1NiIsInVzZSI6InNpZyIsImtpZCI6IjZNYXJ0LTAifV19";

const config = {
  providers: [
    {
      type: "customJwt" as const,
      applicationID: "convex",
      issuer: "https://vibrant-puffin-745.convex.site",
      jwks: JWKS_DATA_URI,
      algorithm: "RS256" as const,
    },
  ],
};

export default config satisfies AuthConfig;
