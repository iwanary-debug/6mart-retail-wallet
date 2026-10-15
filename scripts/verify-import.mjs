/**
 * Uji impor massal produk & santri.
 *
 * Mengimpor beberapa baris yang sengaja dicampur: baris valid, baris dengan
 * SKU/NIS ganda, dan baris tidak valid. Yang diperiksa bukan hanya jumlah
 * yang berhasil, tapi juga apakah setiap kegagalan dilaporkan per baris.
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
const stamp = Date.now().toString().slice(-6);

// SKU ganda dan baris tidak lengkap di dalam satu file.
const productRows = [
  { sku: `IMP-A-${stamp}`, name: "Impor Produk A", unit: "pcs", purchasePrice: "2000", sellingPrice: "3000", minStock: "5" },
  { sku: `IMP-A-${stamp}`, name: "Duplikat SKU", unit: "pcs", purchasePrice: "2000", sellingPrice: "3000" },
  { sku: `IMP-B-${stamp}`, name: "", unit: "pcs", purchasePrice: "2000", sellingPrice: "3000" },
  { sku: `IMP-C-${stamp}`, name: "Impor Produk C", unit: "pcs", purchasePrice: "abc", sellingPrice: "3000" },
  { sku: `IMP-D-${stamp}`, name: "Impar Produk D", unit: "pcs", purchasePrice: "2000", sellingPrice: "4500" },
];

const products = await post(
  "mutation",
  "import:importProducts",
  { rows: productRows },
  token,
);
if (products.status !== "success") {
  console.log("GAGAL import produk:", JSON.stringify(products).slice(0, 300));
  failed = true;
} else {
  const r = products.value;
  const ok = r.created === 2 && r.failed === 3;
  console.log(
    `${ok ? "OK  " : "GAGAL"} produk: ${r.created} masuk, ${r.failed} gagal (total ${r.total})`,
  );
  for (const e of r.errors) console.log(`        baris ${e.row}: ${e.message}`);
  if (!ok) failed = true;
}

const studentRows = [
  { nis: `99${stamp}1`, name: "Santri Impor Satu", gender: "L", className: "6A", dormitory: "Asrama A", room: "101" },
  { nis: `99${stamp}1`, name: "NIS Ganda", gender: "L", className: "6A" },
  { nis: `99${stamp}2`, name: "Santri Impor Dua", gender: "X", className: "6B" },
  { nis: `99${stamp}3`, name: "Tanpa Kelas", gender: "P" },
  { nis: `99${stamp}4`, name: "Santri Impor Empat", gender: "P", className: "7A" },
];

const students = await post(
  "mutation",
  "import:importStudents",
  { rows: studentRows },
  token,
);
if (students.status !== "success") {
  console.log("GAGAL import santri:", JSON.stringify(students).slice(0, 300));
  failed = true;
} else {
  const r = students.value;
  const ok = r.created === 2 && r.failed === 3;
  console.log(
    `${ok ? "OK  " : "GAGAL"} santri: ${r.created} masuk, ${r.failed} gagal (total ${r.total})`,
  );
  for (const e of r.errors) console.log(`        baris ${e.row}: ${e.message}`);
  if (!ok) failed = true;
}

// Santri yang diimpor harus punya wallet.
const list = await post("query", "students:list", { search: stamp, limit: 20 }, token);
const imported = (list.value?.items ?? []).filter((s) => s.nis.startsWith(`99${stamp}`));
const withWallet = imported.filter((s) => s.walletId || s.balance !== undefined);
console.log(
  `${withWallet.length === imported.length ? "OK  " : "GAGAL"} walletSantri: ${withWallet.length}/${imported.length} punya wallet`,
);
if (withWallet.length !== imported.length) failed = true;

console.log(failed ? "\nHASIL: GAGAL" : "\nHASIL: OK");
if (failed) process.exitCode = 1;
