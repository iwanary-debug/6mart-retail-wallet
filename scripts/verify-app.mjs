/**
 * Verifikasi menyeluruh aplikasi 6Mart terhadap sebuah deployment Convex.
 *
 * Untuk setiap akun demo: sign in, lalu jalankan satu query representatif dari
 * tiap modul backend. Tujuannya memastikan JWT terverifikasi, RBAC diterima,
 * dan data demo terbaca — bukan hanya `users:profile`.
 *
 * Pemakaian:
 *   CONVEX_URL=<url> node scripts/verify-app.mjs
 */

const CONVEX_URL =
  process.env.CONVEX_URL ?? "https://vibrant-puffin-745.convex.cloud";
const PASSWORD = process.env.DEMO_PASSWORD ?? "6mart2026";

const ACCOUNTS = [
  "admin@6mart.test",
  "manager@6mart.test",
  "cashier@6mart.test",
  "finance@6mart.test",
  "inventory@6mart.test",
  "supervisor@6mart.test",
  "owner@6mart.test",
];

/** Satu query nyata per modul, dengan argumen minimal yang valid. */
const PROBES = [
  ["dashboard", "dashboard:operational", {}],
  ["dashboard", "dashboard:financial", {}],
  ["products", "products:listProducts", { limit: 3 }],
  ["inventory", "inventory:stockOverview", {}],
  ["students", "students:list", {}],
  ["wallets", "wallets:listWallets", {}],
  ["sales", "sales:listSales", { limit: 3 }],
  ["finance", "finance:trialBalance", {}],
  ["finance", "finance:profitAndLoss", {}],
  ["reports", "reports:salesReport", {}],
  ["services", "services:servicesSummary", {}],
  ["ppob", "ppob:listProducts", {}],
  ["payments", "payments:listTopups", {}],
  ["settings", "settings:getAll", {}],
  ["audit", "audit:summary", {}],
  ["users", "users:listRoles", {}],
];

async function rpc(endpoint, path, args, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${CONVEX_URL}/api/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ path, args, format: "json" }),
  });
  return response.json();
}

/** Ringkas nilai query menjadi string pendek untuk ditampilkan. */
function summarize(value) {
  if (Array.isArray(value)) return `${value.length} item`;
  if (value && typeof value === "object") {
    for (const key of ["items", "rows", "lines", "data"]) {
      if (Array.isArray(value[key])) return `${value[key].length} ${key}`;
    }
    return Object.keys(value).slice(0, 4).join(",") || "ok";
  }
  return String(value);
}

let failures = 0;

for (const email of ACCOUNTS) {
  const signIn = await rpc("action", "auth:signIn", {
    provider: "password",
    params: { flow: "signIn", email, password: PASSWORD },
  });
  if (signIn.status !== "success") {
    console.log(`GAGAL  ${email} signIn: ${JSON.stringify(signIn).slice(0, 160)}`);
    failures++;
    continue;
  }

  const token = signIn.value.tokens.token;
  const profile = await rpc("query", "users:profile", {}, token);
  if (profile.status !== "success") {
    console.log(`GAGAL  ${email} profile: ${JSON.stringify(profile).slice(0, 160)}`);
    failures++;
    continue;
  }

  const results = [];
  for (const [label, path, args] of PROBES) {
    const response = await rpc("query", path, args, token);
    if (response.status === "success") {
      results.push(`${label}:${summarize(response.value)}`);
    } else if (/ditolak|forbidden|tidak diizinkan|permission/i.test(response.errorMessage ?? "")) {
      results.push(`${label}:rbac`); // penolakan sesuai peran, itu benar
    } else {
      results.push(`${label}:GAGAL(${(response.errorMessage ?? "").slice(0, 60)})`);
      failures++;
    }
  }

  console.log(
    `OK    ${email.padEnd(24)} ${profile.value.roleKey.padEnd(12)} ${results.join(" ")}`,
  );
}

console.log(failures === 0 ? "\nSemua probe lulus." : `\n${failures} probe gagal.`);
process.exitCode = failures === 0 ? 0 : 1;
