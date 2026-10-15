/**
 * Stub `@/convex/_generated/api` untuk check render terautentikasi.
 *
 * Reference fungsi Convex adalah proxy buram: `_exportName`-nya bukan string
 * dan `String(reference)` melempar. Jadi agar stub `useQuery` bisa tahu query
 * mana yang dipanggil, `api` diganti dengan proxy yang menyimpan nama lengkap
 * tiap fungsi di kunci `__qname`, mis. `api.users.profile` →
 * `{ __qname: "users.profile" }`.
 *
 * Setiap tingkat harus berupa proxy, bukan objek biasa; kalau tidak,
 * `api.users.profile` akan `undefined` hanya karena satu tingkat terlalu
 * dalam.
 */

function build(prefix: string): unknown {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        if (prop === "then") return undefined; // jangan dianggap Promise
        if (prop === "__qname") return prefix;
        return build(prefix ? `${prefix}.${prop}` : prop);
      },
      has() {
        return true;
      },
    },
  );
}

export const api = build("");
