/**
 * Uji bayar di tempat untuk layanan.
 *
 * Order laundry, booking barbershop, dan order jastip dibuat dengan
 * `payNow: true`. Setelah itu diperiksa apakah penjualan benar-benar
 * terbentuk, dan apakah trial balance masih seimbang.
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

const signIn = await post("action", "auth:signIn", {
  provider: "password",
  params: { flow: "signIn", email: EMAIL, password: PASSWORD },
});
const token = signIn.value.tokens.token;
console.log("masuk sebagai", EMAIL);

let failed = false;

function report(label, ok, detail) {
  console.log(`${ok ? "OK  " : "GAGAL"} ${label.padEnd(26)} ${detail ?? ""}`);
  if (!ok) failed = true;
}

// ---------------------------------------------------------------- laundry ----
const laundry = await post(
  "mutation",
  "services:createLaundryOrder",
  {
    customerType: "WALK_IN",
    customerName: "Uji Bayar Di Tempat",
    serviceType: "Cuci Satuan",
    pricePerKg: 7000,
    weightKg: 2,
    payNow: true,
    paymentMethod: "CASH",
    idempotencyKey: `verify-laundry-${Date.now()}`,
  },
  token,
);
if (laundry.status !== "success") {
  report("laundry", false, JSON.stringify(laundry).slice(0, 200));
} else {
  const p = laundry.value.payment;
  report(
    "laundry bayar di tempat",
    p !== null && p?.total > 0,
    p ? `sale=${p.saleId.slice(0, 8)} total=${p.total}` : "tidak ada pembayaran",
  );
}

// ------------------------------------------------------------- barbershop ----
const svc = await post("query", "services:listBarbershopServices", {}, token);
const services = svc.value?.items ?? svc.value ?? [];
const firstService = Array.isArray(services) ? services[0] : null;
if (!firstService) {
  report("booking", false, "tidak ada layanan barbershop");
} else {
  const booking = await post(
    "mutation",
    "services:createBooking",
    {
      serviceId: firstService._id,
      customerType: "WALK_IN",
      customerName: "Uji Bayar Di Tempat",
      barberName: "Pak Uji",
      payNow: true,
      paymentMethod: "CASH",
      idempotencyKey: `verify-booking-${Date.now()}`,
    },
    token,
  );
  if (booking.status !== "success") {
    report("booking", false, JSON.stringify(booking).slice(0, 200));
  } else {
    const p = booking.value.payment;
    report(
      "booking bayar di tempat",
      p !== null && p?.amount > 0,
      p ? `sale=${p.saleId.slice(0, 8)} amount=${p.amount}` : "tidak ada pembayaran",
    );
  }
}

// ----------------------------------------------------------------- jastip ----
// Alurnya dua langkah: order dibuat dulu di menu layanan TANPA bayar, lalu
// kasir menyelesaikannya lewat `services:payJastip` (dipanggil dari POS).
const jastip = await post(
  "mutation",
  "services:createJastipOrder",
  {
    customerType: "WALK_IN",
    customerName: "Uji Bayar Di Kasir",
    orderType: "Mie Gacoan",
    items: [{ orderType: "Mie Gacoan", quantity: 2, price: 50_000 }],
  },
  token,
);
if (jastip.status !== "success") {
  report("jastip order dibuat", false, JSON.stringify(jastip).slice(0, 200));
} else {
  const orderId = jastip.value.orderId;
  // Ongkir dihapus; total jastip = nilai pesanan + jasa layanan.
  const { serviceFee } = jastip.value;
  const expected = 100_000 + serviceFee;
  report(
    "jastip order dibuat",
    jastip.value.payment === null,
    `code=${jastip.value.code} belum dibayar`,
  );

  // Order harus terbaca lewat query yang dipakai halaman kasir.
  const loaded = await post("query", "services:getJastip", { orderId }, token);
  if (loaded.status !== "success") {
    report("jastip terbaca di kasir", false, JSON.stringify(loaded).slice(0, 200));
  } else {
    const o = loaded.value.order;
    report(
      "jastip terbaca di kasir",
      o.code === jastip.value.code && o.itemsTotal === 100_000,
      `subtotal=${o.itemsTotal} jasa=${o.serviceFee} total=${o.totalAmount}`,
    );
  }

  const pay = await post(
    "mutation",
    "services:payJastip",
    {
      orderId,
      method: "CASH",
      idempotencyKey: `jastip-pos-${orderId}`,
    },
    token,
  );
  if (pay.status !== "success") {
    report("jastip bayar di kasir", false, JSON.stringify(pay).slice(0, 200));
  } else {
    report(
      "jastip bayar di kasir",
      pay.value.chargeTotal === expected,
      `chargeTotal=${pay.value.chargeTotal} (100.000 + jasa ${serviceFee})`,
    );
  }

  // Order yang sama tidak boleh bisa dibayar dua kali.
  const twice = await post(
    "mutation",
    "services:payJastip",
    { orderId, method: "CASH", idempotencyKey: `jastip-pos-${orderId}-ulang` },
    token,
  );
  report(
    "tolak bayar dua kali",
    twice.status === "error",
    twice.status === "error" ? "ditolak" : "GAGAL — diterima lagi",
  );
}

// --------------------------------------------------- trial balance check ----
// Kasir tidak punya izin finance.view, jadi dicek dengan akun yang punya.
const financeToken = (await post("action", "auth:signIn", {
  provider: "password",
  params: { flow: "signIn", email: "manager@6mart.test", password: PASSWORD },
})).value.tokens.token;
const tb = await post("query", "finance:trialBalance", {}, financeToken);
const bal = tb.value ?? {};
// Coba beberapa nama field supaya skrip tidak rapuh bila bentuk Balans
// berubah; yang penting debit dan kredit sama.
const debit = bal.totalDebit ?? bal.totalDebit ?? 0;
const credit = bal.totalCredit ?? bal.totalCredit ?? 0;
const same = debit === credit && debit > 0;
report(
  "trial balance",
  same,
  `debit=${debit} kredit=${credit} field=${Object.keys(bal).join(",")}`,
);

console.log(failed ? "\nHASIL: GAGAL" : "\nHASIL: OK");
if (failed) process.exitCode = 1;
