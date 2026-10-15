/**
 * Uji biaya layanan dan alur bayar PPOB di kasir.
 *
 * Biaya datar yang diminta: laundry 1.000, barbershop 1.000, jastip 3.000,
 * dan jastip tidak lagi menagih ongkir.
 */

const URL_BASE = "https://vibrant-puffin-745.convex.cloud";
const EMAIL = process.env.SMOKE_EMAIL ?? "manager@6mart.test";
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
  console.log(`${ok ? "OK  " : "GAGAL"} ${label.padEnd(30)} ${detail ?? ""}`);
  if (!ok) failed = true;
}

function expectFee(label, actual, want) {
  report(label, actual === want, `${actual} (diminta ${want})`);
}

// ------------------------------------------------------------ biaya layanan ----
const settings = await post("query", "settings:getAll", {}, token);
const s = settings.value ?? {};
expectFee("biaya laundry", s.laundryServiceFee, 1000);
expectFee("biaya barbershop", s.barbershopServiceFee, 1000);
expectFee("biaya jastip", s.jastipServiceFee, 3000);
report(
  "ongkir jastip dihapus",
  s.jastipDeliveryFee === undefined,
  s.jastipDeliveryFee === undefined ? "tidak ada lagi" : `masih ${s.jastipDeliveryFee}`,
);

// ------------------------------------------------- PPOB: bayar di kasir ----
// Produk PPOB bisa kosong di database; disinkronkan dari provider dulu.
let list = (await post("query", "ppob:listProducts", {}, token)).value ?? [];
if (!Array.isArray(list) || list.length === 0) {
  await post("action", "ppob:syncProducts", {}, token);
  list = (await post("query", "ppob:listProducts", {}, token)).value ?? [];
}
const product = Array.isArray(list) ? list[0] : null;
if (!product) {
  report("PPOB produk", false, "tidak ada produk PPOB");
} else {
  const created = await post(
    "mutation",
    "ppob:createTransaction",
    {
      productId: product._id,
      customerIdentifier: "08123456789",
      paymentMethod: "CASH",
      deferPayment: true,
      idempotencyKey: `verify-ppob-${Date.now()}`,
    },
    token,
  );
  if (created.status !== "success") {
    report("PPOB ditunda", false, JSON.stringify(created).slice(0, 220));
  } else {
    report(
      "PPOB ditunda di kasir",
      created.value.status === "AWAITING_PAYMENT",
      `code=${created.value.code} status=${created.value.status}`,
    );

    const loaded = await post(
      "query",
      "ppob:getTransaction",
      { transactionId: created.value.transactionId },
      token,
    );
    report(
      "PPOB terbaca di kasir",
      loaded.status === "success" && loaded.value.transaction.price === product.price,
      `harga=${loaded.value?.transaction?.price}`,
    );

    const paid = await post(
      "mutation",
      "ppob:payTransaction",
      {
        transactionId: created.value.transactionId,
        method: "CASH",
        idempotencyKey: `verify-ppob-pay-${created.value.transactionId}`,
      },
      token,
    );
    if (paid.status !== "success") {
      report("PPOB dibayar di kasir", false, JSON.stringify(paid).slice(0, 220));
    } else {
      report(
        "PPOB dibayar di kasir",
        paid.value.amount === product.price,
        `code=${paid.value.code} jumlah=${paid.value.amount}`,
      );
    }

    const twice = await post(
      "mutation",
      "ppob:payTransaction",
      {
        transactionId: created.value.transactionId,
        method: "CASH",
        idempotencyKey: `verify-ppob-pay2-${created.value.transactionId}`,
      },
      token,
    );
    report(
      "tolak bayar PPOB dua kali",
      twice.status === "error",
      twice.status === "error" ? "ditolak" : "GAGAL — diterima lagi",
    );
  }
}

// ------------------------------------------------------------- trial balance ----
const tb = await post("query", "finance:trialBalance", {}, token);
const bal = tb.value ?? {};
report(
  "trial balance",
  bal.totalDebit === bal.totalCredit && bal.totalDebit > 0,
  `debit=${bal.totalDebit} kredit=${bal.totalCredit}`,
);

console.log(failed ? "\nHASIL: GAGAL" : "\nHASIL: OK");
if (failed) process.exitCode = 1;
