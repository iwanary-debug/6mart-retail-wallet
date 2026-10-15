/**
 * Check render terautentikasi.
 *
 * Merender halaman asli (AuthProvider, RequireAuth, router, dan komponen
 * halaman) sementara `convex/react` dan `@convex-dev/auth/react` diganti stub.
 * Stub `useQuery` meniru mekanisme subscription Convex, sehingga halaman yang
 * menyusun args query dari nilai yang berubah tiap render akan mengalami
 * "Too many re-renders" persis seperti di browser sungguhan.
 *
 * Perulangan yang berulang 25 kali oleh React adalah batasnya; di sini kita
 * hanya memeriksa apakah halaman berhasil ter-render tanpa loop.
 */

import { Window } from "happy-dom";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { ConvexProvider } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import App from "@/App";
import { stats, setQueryValue } from "./stubs/convex-react";
import { permissionsForRole, ROLES, type RoleKey } from "@/lib/rbac";

const win = new Window({ url: "http://localhost/" });

function defineGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}

defineGlobal("window", win);
defineGlobal("document", win.document);
defineGlobal("localStorage", win.localStorage);
defineGlobal("navigator", win.navigator);
defineGlobal("HTMLElement", win.HTMLElement);
// Beberapa komponen menghitung tipe dari element, jadi konstruktor yang
// dipakai form wajib ada juga.
defineGlobal("HTMLFormElement", win.HTMLFormElement);
defineGlobal("HTMLInputElement", win.HTMLInputElement);
defineGlobal("HTMLButtonElement", win.HTMLButtonElement);
defineGlobal("Element", win.Element);
defineGlobal("Node", win.Node);
defineGlobal("MutationObserver", win.MutationObserver);
defineGlobal("getComputedStyle", win.getComputedStyle.bind(win));
defineGlobal("requestAnimationFrame", (cb: (t: number) => void) =>
  setTimeout(() => cb(0), 0) as unknown as number);
defineGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

/**
 * Query yang harus mengembalikan sesuatu supaya halaman benar-benar merender
 * isi, bukan spinner. Kunci adalah `_exportName` dari fungsi Convex.
 */
/**
 * Peran yang dipakai saat render. Kasir tidak punya izin mengelola produk
 * maupun santri, jadi halaman Master Data hanya bisa diperiksa dengan peran
 * yang memang berhak.
 */
const OVERRIDE_ROLE = process.env.SMOKE_ROLE as RoleKey | undefined;
let ROLE: RoleKey = OVERRIDE_ROLE ?? ROLES.CASHIER;

/**
 * Profile tiruan untuk satu peran. Dibuat ulang tiap pergantian peran
 * supaya memuat ulang halaman benar-benar melihat izin yang berbeda.
 */
function profileFor(role: RoleKey) {
  return {
    _id: "u1",
    name: "Uji Render",
    email: "render@6mart.test",
    roleKey: role,
    roleLabel: role,
    permissions: permissionsForRole(role),
    isActive: true,
  };
}

const RESULTS: Record<string, unknown> = {
  // `users:profile` — path-nya harus sama persis dengan yang dipakai stub
  // `api`, termasuk prefiks modulnya.
  "users.profile": profileFor(ROLE),
  "products.listProducts": { items: [], total: 0 },
  "products.listCategories": [],
  "products.listSuppliers": [],
  "students.list": { items: [], total: 0 },
  "students.listClasses": [],
  // Order jastip yang menunggu pembayaran di halaman kasir.
  "services.getLaundry": {
    order: {
      _id: "l1",
      code: "LDR-20260928-0001",
      customerName: "Uji Laundry",
      serviceType: "Cuci Satuan",
      pricePerKg: 7000,
      weightKg: 2,
      serviceFee: 1000,
      totalAmount: 15000,
      status: "PENDING",
    },
    items: [],
  },
  "services.getBooking": {
    booking: {
      _id: "b1",
      code: "BRS-20260928-0001",
      customerName: "Uji Barbershop",
      price: 10000,
      serviceFee: 1000,
      totalAmount: 11000,
      status: "WAITING",
    },
    service: { name: "Potong Rambut" },
  },
  "ppob.getTransaction": {
    transaction: {
      _id: "t1",
      code: "PPB-20260928-0001",
      productName: "Pulsa 10.000",
      price: 11000,
      status: "AWAITING_PAYMENT",
    },
  },
  "services.getJastip": {
    order: {
      _id: "j1",
      code: "JST-20260928-0001",
      customerName: "Uji Bayar Di Tempat",
      orderType: "Mie Gacoan",
      itemsTotal: 100_000,
      serviceFee: 3_000,
      status: "PENDING",
    },
    items: [{ _id: "ji1", orderType: "Mie Gacoan", quantity: 2, price: 50_000 }],
  },
};

for (const [name, value] of Object.entries(RESULTS)) setQueryValue(name, value);

const PATHS = [
  "/app",
  "/app/pos",
  "/app/pos?jastip=demo-order",
  "/app/pos?laundry=demo-order",
  "/app/pos?booking=demo-booking",
  "/app/pos?ppob=demo-tx",
  "/app/penjualan",
  "/app/wallet",
  "/app/laporan",
  "/app/keuangan",
  "/app/layanan",
  "/app/ppob",
  "/app/produk",
  "/app/santri",
];

/**
 * Batas pemasangan ulang subscription per call site sebelum dianggap loop.
 * Args yang stabil hanya memasang ulang sekali; args yang dihitung dari
 * `Date.now()` akan terus bertambah sampai batas ini.
 */
const MAX_RESUBSCRIBE = 5;

/**
 * Angka yang wajib muncul di DOM tiap rute. Format Rp memakai pemisah ribuan
 * titik, jadi Rp103.000 ditulis "Rp103.000".
 *
 * Panjang DOM saja tidak cukup sebagai bukti: kalkylasi jastip pernah salah
 * dan panelnya tetap ter-render dengan panjang yang tidak berubah.
 */
const EXPECTED_TEXT: Record<string, string[]> = {
};

/**
 * Panel pembayaran layanan hanya terbuka untuk peran yang punya izin
 * layanan. Ditentukan dari izin yang sebenarnya, bukan daftar peran
 * manual, supaya tidak pernah melenceng lagi kalau matriks izin berubah.
 */
let CAN_PAY_SERVICE = permissionsForRole(ROLE).some((p) =>
  p.startsWith("service."),
);

const SERVICE_EXPECTED_TEXT: Record<string, string[]> = {
  "/app/pos?jastip=demo-order": [
    "Subtotal",
    "100.000",
    "Jasa layanan",
    "3.000",
    "Total",
    "103.000",
  ],
  "/app/pos?laundry=demo-order": ["14.000", "Jasa layanan", "1.000", "15.000"],
  "/app/pos?booking=demo-booking": ["10.000", "Jasa layanan", "1.000", "11.000"],
};

/**
 * Teks yang hanya boleh muncul untuk peran tertentu.
 *
 * Tombol tambah dan import disembunyikan bila peran tidak punya izin
 * mengelola, jadi assertion-nya harus ikut menyesuaikan — kalau tidak,
 * kasir akan dianggap gagal padahal perilakunya benar.
 */
const ROLE_GATED_TEXT: Record<string, { role: RoleKey; texts: string[] }[]> = {
  "/app/produk": [
    { role: ROLES.MANAGER, texts: ["Tambah Produk", "Import CSV", "Tambah Stok"] },
    { role: ROLES.SUPER_ADMIN, texts: ["Tambah Produk", "Import CSV", "Tambah Stok"] },
    { role: ROLES.OWNER, texts: ["Tambah Produk", "Import CSV", "Tambah Stok"] },
    { role: ROLES.INVENTORY, texts: ["Tambah Produk", "Import CSV"] },
  ],
  "/app/santri": [
    { role: ROLES.MANAGER, texts: ["Tambah Santri", "Import CSV"] },
    { role: ROLES.SUPER_ADMIN, texts: ["Tambah Santri", "Import CSV"] },
    { role: ROLES.OWNER, texts: ["Tambah Santri", "Import CSV"] },
  ],
};

function expectedTextFor(path: string): string[] {
  const service = CAN_PAY_SERVICE
    ? SERVICE_EXPECTED_TEXT[path] ?? []
    : [];
  const gated = ROLE_GATED_TEXT[path] ?? [];
  const wanted = gated.filter((g) => g.role === ROLE).flatMap((g) => g.texts);
  return [...service, ...wanted];
}

const container = win.document.createElement("div");
win.document.body.appendChild(container);
const root = createRoot(container);

/**
 * Semua peran diperiksa dalam satu kali jalan. Dulu hanya satu peran yang
 * dirender, sehingga perubahan matriks izin untuk peran lain bisa lolos
 * tanpa pernah diperiksa — tombol yang hilang di halaman akun lain tidak
 * akan pernah ketahuan.
 */
const ROLES_TO_CHECK: RoleKey[] = OVERRIDE_ROLE
  ? [OVERRIDE_ROLE]
  : [
      ROLES.CASHIER,
      ROLES.OWNER,
      ROLES.MANAGER,
      ROLES.SUPERVISOR,
      ROLES.INVENTORY,
      ROLES.FINANCE,
      ROLES.SUPER_ADMIN,
    ];

async function run() {
  const report: string[] = [];
  let failed = false;

 for (const role of ROLES_TO_CHECK) {
  ROLE = role;
  // Harus lewat setQueryValue, bukan hanya mengubah RESULTS: stub menyimpan
  // nilainya di Map sendiri yang diisi sekali di awal modul.
  setQueryValue("users.profile", profileFor(role));
  CAN_PAY_SERVICE = permissionsForRole(role).some((p) =>
    p.startsWith("service."),
  );
  report.push(`\n== ${role} ==`);

  for (const path of PATHS) {
    const before = stats.resubscribes;
    stats.byQuery.clear();
    const host = win.document.createElement("div");
    win.document.body.appendChild(host);

    try {
      createRoot(host).render(
        <StrictMode>
          <ConvexProvider client={undefined as never}>
            <ConvexAuthProvider client={undefined as never}>
              <MemoryRouter initialEntries={[path]}>
                <ErrorBoundary>
                  <AuthProvider>
                    <App />
                  </AuthProvider>
                </ErrorBoundary>
              </MemoryRouter>
            </ConvexAuthProvider>
          </ConvexProvider>
        </StrictMode>,
      );

      // Beri React kesempatan menyelesaikan render bertingkat, termasuk
      // putaran subscription yang dijadwalkan lewat setTimeout.
      await new Promise((r) => setTimeout(r, 400));

      const html = host.innerHTML;
      // Teks ini berasal dari ErrorBoundary di src/components/common.
      const boundary = html.includes("Halaman gagal ditampilkan");
      const sub = stats.resubscribes - before;
      // Args query yang berubah tiap render membuat Convex memasang ulang
      // subscription tanpa henti. Satu call site yang berputar lebih dari
      // beberapa kali adalahcirinya; args yang stabil tidak pernah hit.
      const churning = [...stats.byQuery.entries()].filter(
        ([, count]) => count > MAX_RESUBSCRIBE,
      );
      const looped = html.includes("Too many re-renders") || churning.length > 0;
      const ok = html.length > 0 && !looped && !boundary;
      if (!ok) failed = true;
      report.push(
        `${ok ? "OK  " : "GAGAL"} ${path.padEnd(20)} len=${String(html.length).padStart(6)} resubscribe=${sub}${boundary ? " ERROR-BOUNDARY" : ""}`,
      );
      if (!ok) {
        for (const [name, count] of churning) {
          report.push(
            `      ↳ args tidak stabil: ${name} memasang ulang subscription ${count}x`,
          );
        }
        report.push(`      ↳ ${html.slice(0, 200).replace(/\s+/g, " ")}`);
      }
      const expectedTexts = expectedTextFor(path);
      const text = host.textContent ?? "";
      const missing = expectedTexts.filter((t) => !text.includes(t));
      if (missing.length > 0) {
        failed = true;
        report[report.length - 1] = report[report.length - 1].replace("OK  ", "GAGAL");
        report.push(`      \u2514 angka hilang: ${missing.join(", ")}`);
      }
      if (boundary) {
        const msg = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(html)?.[1] ?? "?";
        report.push(`      \u2514 error: ${msg.slice(0, 200)}`);
      }

      if (process.env.AUTHED_DEBUG) {
        report.push(`      HTML ${html.slice(0, 400).replace(/\s+/g, " ")}`);
      }
    } catch (err) {
      failed = true;
      report.push(`GAGAL ${path.padEnd(20)} melempar: ${String(err).slice(0, 200)}`);
    }
  }

 }

  console.log(report.join("\n"));
  console.log(failed ? "HASIL: GAGAL" : "HASIL: OK");
  process.exitCode = failed ? 1 : 0;
  process.exit(failed ? 1 : 0);
}

void run();
