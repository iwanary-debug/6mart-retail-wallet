/**
 * Verifikasi top up, tarik, dan penyesuaian dari halaman Santri.
 *
 * Dikirim tanpa `type` — persis seperti yang dilakukan MoneyDialog — karena
 * itu yang dulu ditolak validator sebelum handler sempat berjalan.
 */
const URL_BASE = "https://vibrant-puffin-745.convex.cloud";
const EMAIL = process.env.SMOKE_EMAIL ?? "manager@6mart.test";
const PASSWORD = process.env.SMOKE_PASSWORD ?? "6mart2026";

let pass = true;
const report = (label, ok, detail = "") => {
  if (!ok) pass = false;
  console.log(`${ok ? "OK  " : "GAGAL"} ${label.padEnd(30)} ${detail}`);
};

async function call(kind, path, args, token) {
  const r = await fetch(`${URL_BASE}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  return r.json();
}

const login = await call("action", "auth:signIn", {
  provider: "password",
  params: { flow: "signIn", email: EMAIL, password: PASSWORD },
});
const token = login?.value?.tokens?.token;
if (!token) {
  console.error("GAGAL login:", JSON.stringify(login).slice(0, 300));
  process.exit(1);
}
console.log("masuk sebagai", EMAIL, "\n");

// Santri uji.
const list = await call("query", "students:list", { limit: 1 }, token);
const studentId = list?.value?.items?.[0]?._id;
if (!studentId) {
  console.error("GAGAL: tidak ada santri untuk diuji");
  process.exit(1);
}

const key = () => `VT-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// --------------------------------------------------------------- top up ----
const top = await call("mutation", "wallets:topUp", {
  studentId,
  amount: 100_000,
  method: "MANUAL",
  idempotencyKey: key(),
}, token);
report(
  "top up",
  top.status !== "error",
  top.status === "error" ? top.errorMessage.slice(0, 160) : `saldo ${top.value?.balanceBefore}→${top.value?.balanceAfter}`,
);
report(
  "top up tidak duplikat",
  top.status !== "error" && top.value?.replayed !== true,
  top.status !== "error" ? `replayed=${top.value?.replayed}` : "-",
);

// ---------------------------------------------------------------- tarik ----
const wd = await call("mutation", "wallets:withdraw", {
  studentId,
  amount: 30_000,
  idempotencyKey: key(),
}, token);
report(
  "tarik",
  wd.status !== "error",
  wd.status === "error" ? wd.errorMessage.slice(0, 160) : `saldo ${wd.value?.balanceBefore}→${wd.value?.balanceAfter}`,
);

// ----------------------------------------------------------- penyesuaian ----
const adj = await call("mutation", "wallets:adjust", {
  studentId,
  amount: 5_000,
  reason: " Koreksi selisih kas",
  idempotencyKey: key(),
}, token);
report(
  "penyesuaian +",
  adj.status !== "error",
  adj.status === "error" ? adj.errorMessage.slice(0, 160) : `saldo=${adj.value?.balanceAfter}`,
);

const adjNeg = await call("mutation", "wallets:adjust", {
  studentId,
  amount: -2_000,
  reason: "Kurang bayar",
  idempotencyKey: key(),
}, token);
report(
  "penyesuaian -",
  adjNeg.status !== "error",
  adjNeg.status === "error" ? adjNeg.errorMessage.slice(0, 160) : `saldo=${adjNeg.value?.balanceAfter}`,
);

// Saldo akhir harus benar: +100.000 -30.000 +5.000 -2.000 = +73.000
const startBalance = top?.value?.balanceBefore ?? 0;
const expected = startBalance + 100_000 - 30_000 + 5_000 - 2_000;
const endBalance = adjNeg?.value?.balanceAfter;
report(
  "saldo akhir konsisten",
  endBalance === expected,
  `harus=${expected} dapat=${endBalance}`,
);

// Klien boleh mengirim `type`WG, tapi server harus mengunci sendiri. Hasil
// mutasi tidak memuat `type`, jadi buktinya diambil dari ledger transaksi.
const spoofKey = key();
const spoof = await call("mutation", "wallets:topUp", {
  studentId,
  amount: 1_000,
  type: "WITHDRAWAL",
  idempotencyKey: spoofKey,
}, token);
const ledger = await call(
  "query",
  "wallets:listLedger",
  { studentId, limit: 5 },
  token,
);
const spoofRow = (ledger?.value?.items ?? []).find(
  (t) => t.idempotencyKey === spoofKey,
);
report(
  "type dikunci server",
  spoof.status !== "error" && spoofRow?.type === "TOPUP",
  spoof.status === "error"
    ? spoof.errorMessage.slice(0, 120)
    : `ledger.type=${spoofRow?.type} (klien kirim WITHDRAWAL)`,
);

// Batalkan top up 1.000 itu.
if (spoofRow) {
  await call("mutation", "wallets:adjust", {
    studentId,
    amount: -1_000,
    reason: "Batalkan uji type dikunci server",
    skipLimits: true,
    idempotencyKey: key(),
  }, token);
}

// Kembalikan saldo seperti semula.
await call("mutation", "wallets:adjust", {
  studentId,
  amount: -(endBalance - startBalance),
  reason: "Kembalikan saldo setelah verifikasi",
  skipLimits: true,
  idempotencyKey: key(),
}, token);

console.log(`\nHASIL: ${pass ? "OK" : "GAGAL"}`);
process.exit(pass ? 0 : 1);
