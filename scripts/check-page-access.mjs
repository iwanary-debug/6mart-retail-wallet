/**
 * Menguji apakah setiap halaman tetap bisa dibuka oleh setiap peran.
 *
 * `RequireAuth` hanya memagari halaman dengan SATU izin, sedangkan di dalam
 * halaman bisa ada query yang butuh izin lebih besar. Kalau query itu tetap
 * dipanggil, backend melempar ForbiddenError dan seluruh halaman gagal.
 *
 * Skrip ini meniru apa yang dilakukan browser: untuk tiap peran, buka setiap
 * halaman yang memang boleh diakses, lalu panggil query yang dipakai halaman
 * itu. Query yang ditolak berarti halaman rusak untuk peran tersebut.
 *
 * Pemakaian:  node scripts/check-page-access.mjs
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

/** Halaman -> izin pembuka (null = terbuka untuk semua pengguna masuk). */
const PAGE_GUARDS = {
  "/app": null,
  "/app/pos": "sale.create",
  "/app/penjualan": "sale.view",
  "/app/produk": "product.view",
  "/app/inventori": "inventory.view",
  "/app/santri": "student.view",
  "/app/wallet": "wallet.view",
  "/app/keuangan": "finance.view",
  "/app/laporan": "report.view",
  "/app/layanan": "service.laundry",
  "/app/ppob": "service.ppob",
  "/app/audit": "audit.view",
};

/**
 * Query yang benar-benar dipanggil tiap halaman saat dibuka.
 *
 * `required` menyatakan izin yang dipakai frontend untuk meng-skip query
 * tersebut. Query dengan `required` tidak akan dipanggil bila peran tidak
 * punya izin itu, jadi di sini tidak ikut diuji.
 */
const PAGE_QUERIES = {
  "/app": [
    ["dashboard:operational", {}],
    ["dashboard:financial", {}, "dashboard.financial"],
  ],
  "/app/pos": [
    ["sales:currentShift", {}],
    ["settings:getAll", {}],
    ["products:listProducts", { limit: 5 }],
  ],
  "/app/penjualan": [
    ["sales:listSales", { limit: 5 }],
    ["reports:salesReport", { period: "month" }, "report.view"],
  ],
  "/app/produk": [
    ["products:listProducts", { limit: 5 }],
    ["products:listCategories", {}],
    ["products:listSuppliers", {}],
  ],
  "/app/inventori": [
    ["inventory:stockOverview", {}],
    ["inventory:stockValuation", {}],
    ["inventory:listMovements", { limit: 5 }],
    ["inventory:listPurchases", { limit: 5 }],
  ],
  "/app/santri": [
    ["students:list", { limit: 5 }],
    ["students:listClasses", {}],
  ],
  "/app/wallet": [
    ["wallets:listWallets", { limit: 5 }],
    ["payments:listTopups", {}],
    ["reports:walletReport", {}],
  ],
  "/app/keuangan": [
    ["finance:profitAndLoss", {}],
    ["finance:trialBalance", {}],
    ["finance:chartOfAccounts", {}],
  ],
  "/app/laporan": [
    ["reports:salesReport", { period: "month" }],
    ["reports:inventoryReport", {}, "inventory.view"],
    ["reports:walletReport", {}, "wallet.view"],
    ["reports:cashierReport", {}],
  ],
  "/app/layanan": [
    ["services:servicesSummary", {}],
    ["services:listLaundry", { limit: 5 }],
    ["services:listBookings", { limit: 5 }, "service.barbershop"],
    ["services:listJastip", { limit: 5 }, "service.jastip"],
    ["students:list", { status: "ACTIVE", limit: 5 }, "student.view"],
  ],
  "/app/ppob": [
    ["ppob:listProducts", {}],
    ["ppob:listTransactions", { limit: 5 }],
    ["students:list", { status: "ACTIVE", limit: 5 }, "student.view"],
  ],
  "/app/audit": [
    ["audit:list", { limit: 5 }],
    ["audit:summary", { days: 30 }],
  ],
};

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

function isForbidden(message) {
  return /ForbiddenError|Akses ditolak|tidak memiliki izin/i.test(message ?? "");
}

let broken = 0;

for (const email of ACCOUNTS) {
  const signIn = await rpc("action", "auth:signIn", {
    provider: "password",
    params: { flow: "signIn", email, password: PASSWORD },
  });
  if (signIn.status !== "success") {
    console.log(`\n${email}\n  GAGAL signIn`);
    broken++;
    continue;
  }
  const token = signIn.value.tokens.token;
  const profile = await rpc("query", "users:profile", {}, token);
  const permissions = profile.value.permissions;

  console.log(`\n${email}`);
  let roleBroken = 0;

  for (const [page, queries] of Object.entries(PAGE_QUERIES)) {
    const guard = PAGE_GUARDS[page];
    if (guard && !permissions.includes(guard)) continue; // tak bisa dibuka

    const denied = [];
    for (const [path, args, required] of queries) {
      // Query yang di-skip frontend tidak pernah sampai ke backend.
      if (required && !permissions.includes(required)) continue;
      const result = await rpc("query", path, args, token);
      if (result.status === "success") continue;
      if (isForbidden(result.errorMessage)) denied.push(path);
    }
    if (denied.length > 0) {
      roleBroken++;
      broken++;
      console.log(`  RUSAK  ${page} — ditolak: ${denied.join(", ")}`);
    }
  }

  if (roleBroken === 0) console.log("  semua halaman yang bisa dibuka OK");
}

console.log(
  broken === 0
    ? "\nSemua peran bisa membuka semua halamannya."
    : `\n${broken} kombinasi peran/halaman rusak. Query di atas harus di-skip `
      + "bila peran tidak punya izin, atau halamannya digateway lebih ketat.",
);
process.exitCode = broken === 0 ? 0 : 1;
