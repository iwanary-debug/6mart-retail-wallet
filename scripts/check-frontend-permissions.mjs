/**
 * Memetakan izin: peran mana yang gagal memanggil query mana.
 *
 * Halaman UI dipagari oleh `RequireAuth` dengan SATU izin, tetapi di
 * dalamnya bisa ada query yang butuh izin lebih besar. Kalau query itu tetap
 * dipanggil, backend melempar ForbiddenError dan seluruh halaman gagal.
 *
 * Skrip ini memanggil setiap query publik untuk setiap akun demo, sehingga
 * pasangan (peran, query) yang bermasalah terlihat tanpa menebak.
 *
 * Pemakaian:  node scripts/check-frontend-permissions.mjs
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

/** Query dengan argumen kosong atau argumen generik yang selalu sah. */
const QUERIES = [
  ["dashboard:operational", {}],
  ["dashboard:financial", {}],
  ["dashboard:checkAlerts", {}],
  ["products:listProducts", { limit: 1 }],
  ["products:listCategories", {}],
  ["products:listSuppliers", {}],
  ["products:lowStock", {}],
  ["inventory:stockOverview", {}],
  ["inventory:stockValuation", {}],
  ["inventory:listMovements", { limit: 1 }],
  ["inventory:listPurchases", { limit: 1 }],
  ["students:list", { limit: 1 }],
  ["students:listClasses", {}],
  ["wallets:listWallets", { limit: 1 }],
  ["sales:listSales", { limit: 1 }],
  ["sales:currentShift", {}],
  ["sales:listShifts", { limit: 1 }],
  ["finance:trialBalance", {}],
  ["finance:profitAndLoss", {}],
  ["finance:chartOfAccounts", {}],
  ["finance:generalLedger", {}],
  ["finance:cashSummary", {}],
  ["finance:listJournals", { limit: 1 }],
  ["finance:listExpenses", { limit: 1 }],
  ["finance:dailyFinancial", {}],
  ["reports:salesReport", {}],
  ["reports:inventoryReport", {}],
  ["reports:walletReport", {}],
  ["reports:cashierReport", {}],
  ["reports:financialReport", {}],
  ["services:servicesSummary", {}],
  ["services:listLaundry", { limit: 1 }],
  ["services:listBookings", { limit: 1 }],
  ["services:listJastip", { limit: 1 }],
  ["services:listBarbershopServices", {}],
  ["ppob:listProducts", {}],
  ["ppob:listTransactions", { limit: 1 }],
  ["ppob:providerInfo", {}],
  ["payments:listTopups", {}],
  ["payments:listWithdrawals", {}],
  ["settings:getAll", {}],
  ["settings:getMeta", {}],
  ["settings:listNotifications", { limit: 1 }],
  ["settings:listParents", {}],
  ["settings:listPermissionsReference", {}],
  ["audit:list", { limit: 1 }],
  ["audit:summary", { days: 30 }],
  ["users:list", {}],
  ["users:listRoles", {}],
  ["users:permissionMatrix", {}],
  ["users:listPermissions", {}],
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

async function signIn(email) {
  const result = await rpc("action", "auth:signIn", {
    provider: "password",
    params: { flow: "signIn", email, password: PASSWORD },
  });
  if (result.status !== "success") {
    throw new Error(`signIn ${email} gagal: ${JSON.stringify(result).slice(0, 120)}`);
  }
  return result.value.tokens.token;
}

/** Bedakan penolakan RBAC dari kegagalan lain. */
function isForbidden(message) {
  return /ForbiddenError|Akses ditolak|tidak memiliki izin/i.test(message ?? "");
}

const report = [];

for (const email of ACCOUNTS) {
  const token = await signIn(email);
  const denied = [];
  for (const [path, args] of QUERIES) {
    const result = await rpc("query", path, args, token);
    if (result.status === "success") continue;
    if (isForbidden(result.errorMessage)) denied.push(path);
    else denied.push(`${path} (${(result.errorMessage ?? "").slice(0, 50)})`);
  }
  report.push({ email, denied });
}

let anyDenied = false;
for (const { email, denied } of report) {
  console.log(`\n${email}`);
  if (denied.length === 0) {
    console.log("  semua query boleh");
    continue;
  }
  anyDenied = true;
  for (const path of denied) console.log(`  DITOLAK  ${path}`);
}

console.log(
  anyDenied
    ? "\nQuery di atas melempar ForbiddenError. Halaman yang memanggilnya"
      + " harus memakai `skip` bila peran tidak punya izin."
    : "\nTidak ada query yang ditolak.",
);
