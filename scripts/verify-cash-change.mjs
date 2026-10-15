/**
 * Uji kembalian tunai terhadap deployment sungguhan.
 *
 * Menutup shift, membuka shift kasir, lalu melakukan penjualan tunai dengan
 * uang yang sengaja lebih besar dari tagihan. Kembalian harus muncul, dan
 * penjualan tunai shift harus tetap sebesar nominal yang masuk laci — bukan
 * sebesar uang yang diserahkan pelanggan.
 */

const URL_BASE = "https://vibrant-puffin-745.convex.cloud";
const EMAIL = process.env.SMOKE_EMAIL ?? "cashier@6mart.test";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "6mart2026";

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

/**openShift/closeShift/checkout adalah mutation, bukan action. */
function mutate(path, args, token) {
  return post("mutation", path, args, token);
}

const signIn = await post("action", "auth:signIn", {
  provider: "password",
  params: { flow: "signIn", email: EMAIL, password: PASSWORD },
});
const token = signIn.value.tokens.token;
console.log("masuk sebagai", EMAIL);

// Tutup shift lama supaya shift baru bisa dibuka.
const current = await post("query", "sales:currentShift", {}, token);
const openShift = current.value;
if (openShift && openShift._id) {
  const close = await mutate(
    "sales:closeShift",
    { shiftId: openShift._id, actualCash: openShift.expectedCash ?? 0 },
    token,
  );
  console.log("tutup shift lama:", close.status);
}

const open = await mutate("sales:openShift", { openingCash: 100_000 }, token);
if (open.status !== "success") {
  console.log("GAGAL buka shift:", JSON.stringify(open).slice(0, 300));
  process.exit(1);
}
console.log("buka shift:", open.value.code ?? open.value._id);
const shiftId = open.value._id;

// Pilih produk pertama yang tersedia.
const products = await post(
  "query",
  "products:listProducts",
  { limit: 5 },
  token,
);
const list = products.value?.items ?? [];
const product = list[0];
if (!product) {
  console.log("GAGAL: tidak ada produk untuk diuji");
  process.exit(1);
}
const total = product.sellingPrice ?? product.price;
if (typeof total !== "number") {
  console.log("GAGAL: harga produk tidak ditemukan", Object.keys(product));
  process.exit(1);
}
const tendered = total + 20_000;

console.log(`produk=${product.name} total=${total} uang diterima=${tendered}`);

const sale = await mutate("sales:checkout", {
  items: [{ productId: product._id, quantity: 1 }],
  cashAmount: total,
  cashTendered: tendered,
  idempotencyKey: `verify-change-${Date.now()}`,
}, token);

if (sale.status !== "success") {
  console.log("GAGAL checkout:", JSON.stringify(sale).slice(0, 400));
  process.exit(1);
}

const v = sale.value;
console.log("kode transaksi :", v.code);
console.log("total          :", v.total);
console.log("dibayar        :", v.paidAmount);
console.log("uang diterima  :", v.cashTendered);
console.log("KEMBALIAN      :", v.changeAmount);

const expected = tendered - total;
const changeOk = v.changeAmount === expected;
console.log(changeOk ? "OK — kembalian sesuai" : `GAGAL — diharapkan ${expected}`);

// Uang di laci harus sebesar tagihan yang dibayar tunai, BUKAN sebesar uang
// yang diserahkan pelanggan. Kalau keliru, tutup shift selalu reporting
// selisih sebesar sebesar kembalian.
const detail = await post(
  "query",
  "sales:shiftDetail",
  { shiftId },
  token,
);
// Uang di laci harus sebesar tagihan yang dibayar tunai, BUKAN sebesar uang
// yang diserahkan pelanggan. Kalau keliru, tutup shift selalu reporting
// selisih sebesar kembalian.
const live = await post("query", "sales:currentShift", {}, token);
const drawer = live.value?.cashSales ?? 0;
const cashOk = drawer === total;
console.log(
  `penjualan tunai di laci ${cashOk ? "sesuai" : "SALAH"}:` +
    ` ${drawer} (harusnya ${total}, bukan ${tendered})`,
);

if (!changeOk || !cashOk) process.exitCode = 1;
