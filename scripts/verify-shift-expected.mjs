/**
 * Uji Expected kas saat menutup shift.
 *
 * Kasus yang dilaporkan: modal awal Rp100.000, penjualan tunai Rp57.000,
 * tetapi "Harus ada" tampil Rp100.000. Seharusnya Rp157.000.
 *
 * Skrip ini mereproduksi angkanya persis, lalu membaca `shiftDetail` yang
 * dipakai modal tutup shift.
 */

const URL_BASE = "https://vibrant-puffin-745.convex.cloud";
const EMAIL = process.env.SMOKE_EMAIL ?? "cashier@6mart.test";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "6mart2026";

const OPENING = 100_000;
const CASH_SALES = 57_000;
let CASH_SALES_ACTUAL = 0;

async function post(kind, path, args, token) {
  const res = await fetch(`${URL_BASE}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  return res.json();
}

const signIn = await post("action", "auth:signIn", {
  provider: "password",
  params: { flow: "signIn", email: EMAIL, password: PASSWORD },
});
const token = signIn.value.tokens.token;
console.log("masuk sebagai", EMAIL);

// Bersihkan shift yang masih terbuka dari percobaan sebelumnya.
const current = await post("query", "sales:currentShift", {}, token);
if (current.value?._id) {
  const detail = await post(
    "query",
    "sales:shiftDetail",
    { shiftId: current.value._id },
    token,
  );
  const expected = detail.value?.expectedCash ?? 0;
  await post(
    "mutation",
    "sales:closeShift",
    { shiftId: current.value._id, actualCash: expected },
    token,
  );
  console.log("tutup shift lama, expected:", expected);
}

const open = await post("mutation", "sales:openShift", { openingCash: OPENING }, token);
if (open.status !== "success") {
  console.log("GAGAL buka shift:", JSON.stringify(open).slice(0, 300));
  process.exit(1);
}
const shiftId = open.value.shiftId ?? open.value._id;
console.log("buka shift modal awal:", OPENING.toLocaleString("id-ID"));

// Jual barang dengan uang tunai sampai totalnya CASH_SALES.
const products = await post("query", "products:listProducts", { limit: 50 }, token);
const items = products.value?.items ?? [];
if (!items.length) {
  console.log("GAGAL: tidak ada produk");
  process.exit(1);
}

// Susun keranjang tunai. Nominal belum tentu pas 57.000 karena harga produk,
// jadi yang diuji adalah invarian: expected = modal awal + penjualan tunai.
let remaining = CASH_SALES;
const cart = [];
for (const p of items) {
  if (remaining <= 0) break;
  const price = p.sellingPrice;
  // Harus ada stok; produk habis dipakai oleh percobaan sebelumnya.
  if (!price || price > remaining) continue;
  if ((p.stock ?? 0) < 1) continue;
  cart.push({ productId: p._id, quantity: 1 });
  remaining -= price;
}
if (!cart.length) {
  console.log("GAGAL: tidak ada produk yang bisa dibeli secara tunai");
  process.exit(1);
}
const cartTotal = cart.reduce((s, _, i) => s + items.find((p) => p._id === cart[i].productId).sellingPrice, 0);

const sale = await post(
  "mutation",
  "sales:checkout",
  {
    items: cart,
    cashAmount: cartTotal,
    cashTendered: cartTotal,
    idempotencyKey: `verify-shift-${Date.now()}`,
  },
  token,
);
if (sale.status === "success") {
  CASH_SALES_ACTUAL = sale.value.total;
}
if (sale.status !== "success") {
  console.log("GAGAL checkout:", JSON.stringify(sale).slice(0, 300));
  process.exit(1);
}
console.log("penjualan tunai:", CASH_SALES_ACTUAL.toLocaleString("id-ID"));

// Angka yang dilihat kasir di modal tutup shift.
const after = await post("query", "sales:shiftDetail", { shiftId }, token);
if (after.status !== "success") {
  console.log("GAGAL shiftDetail:", JSON.stringify(after).slice(0, 300));
  process.exit(1);
}
const d = after.value ?? {};
const shown = d.expectedCash;
const expected = OPENING + d.cashSales;

console.log("");
console.log("  modal awal      :", (d.shift?.openingCash ?? 0).toLocaleString("id-ID"));
console.log("  penjualan tunai :", (d.cashSales ?? 0).toLocaleString("id-ID"));
console.log("  HARUS ADA       :", (shown ?? 0).toLocaleString("id-ID"));
console.log("  seharusnya      :", expected.toLocaleString("id-ID"));

const pass = shown === expected && shown === OPENING + CASH_SALES_ACTUAL && shown > OPENING;
console.log(pass ? "\nOK — sesuai" : "\nGAGAL — expected cash salah");
if (!pass) process.exitCode = 1;
