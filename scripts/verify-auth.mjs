/**
 * Verifikasi alur autentikasi end-to-end terhadap deployment Convex.
 *
 * Menguji: signIn -> token -> query terautentikasi (users:profile).
 * Tidak menyimpan kredensial di mana pun.
 *
 * Pemakaian:  node scripts/verify-auth.mjs [email]
 */

const CONVEX_URL = process.env.CONVEX_URL ?? "http://127.0.0.1:3210";
const email = process.argv[2] ?? "cashier@6mart.test";
const password = process.env.DEMO_PASSWORD ?? "6mart2026";

async function call(endpoint, path, args, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${CONVEX_URL}/api/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ path, args, format: "json" }),
  });
  return response.json();
}

const signIn = await call("action", "auth:signIn", {
  provider: "password",
  params: { flow: "signIn", email, password },
});
if (signIn.status !== "success") {
  console.log(`GAGAL signIn: ${JSON.stringify(signIn).slice(0, 300)}`);
  process.exit(1);
}
console.log(`OK   signIn ${email}`);

const token = signIn.value.tokens.token;
const profile = await call("query", "users:profile", {}, token);
if (profile.status !== "success") {
  console.log(`GAGAL users:profile: ${JSON.stringify(profile).slice(0, 400)}`);
  process.exit(1);
}
const p = profile.value;
console.log(`OK   profile: ${p.name} <${p.email}> role=${p.roleKey} (${p.roleLabel})`);
console.log(`     izin: ${p.permissions.length} permission`);

const denied = await call("query", "users:list", {}, token);
console.log(
  denied.status === "success"
    ? "INFO users:list diizinkan untuk peran ini"
    : "OK   users:list ditolak sesuai RBAC",
);
