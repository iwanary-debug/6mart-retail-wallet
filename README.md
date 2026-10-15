# 6Mart — Retail & Student Wallet

Sistem POS, Inventory, Student Wallet, Layanan, PPOB, dan Financial Management
untuk **6Mart PIAT 6 Bondowoso**. Antarmuka sepenuhnya Bahasa Indonesia.

Dokumen kebutuhan ada di [`docs/MASTER-BLUEPRINT.md`](docs/MASTER-BLUEPRINT.md).
Dokumen turunan:

- [`docs/BUSINESS-RULES.md`](docs/BUSINESS-RULES.md) — aturan bisnis yang ditegakkan
- [`docs/ACCOUNTING-RULES.md`](docs/ACCOUNTING-RULES.md) — jurnal, COA, HPP
- [`docs/WALLET-RULES.md`](docs/WALLET-RULES.md) — dompet dan ledger
- [`docs/DATABASE-DESIGN.md`](docs/DATABASE-DESIGN.md) — skema dan index
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — status dan langkah berikutnya

---

## Teknologi

| Bagian | Teknologi |
|---|---|
| Frontend | React 18, TypeScript, Vite 6, Tailwind, shadcn-style UI |
| Backend | Convex (query, mutation, action, HTTP action) |
| Auth | `@convex-dev/auth` dengan provider Password (Scrypt) |
| Database | Convex, skema di `src/convex/schema.ts` |
| Build | Bun |

---

## Menjalankan

```bash
bun install
bun run dev
```

`bun run dev` hanya menjalankan Vite. Backend sudah ada di Convex Cloud, jadi
tidak ada proses database lokal yang perlu dijalankan.

Untuk mendorong perubahan backend:

```bash
bunx convex dev --once
```

Perintah lain:

```bash
bun run typecheck     # tsc -b --noEmit
bun test              # 128 unit test
bun run auth:keygen   # buat ulang keypair JWT (jarang diperlukan)
```

---

## Akun Demo

Semua akun memakai kata sandi **`6mart2026`**.

| Email | Peran |
|---|---|
| `admin@6mart.test` | Super Admin |
| `manager@6mart.test` | Manager 6Mart |
| `supervisor@6mart.test` | Supervisor |
| `cashier@6mart.test` | Kasir |
| `finance@6mart.test` | Finance |
| `inventory@6mart.test` | Staff Inventory |
| `owner@6mart.test` | Owner / Management |

Setiap peran melihat menu dan tombol yang berbeda karena RBAC ditegakkan di
server, bukan hanya disembunyikan di UI.

---

## Konfigurasi

Ada DUA tempat nilai environment, dan keduanya tidak boleh tertukar:

**1. Environment deployment Convex** (diatur lewat `convex env set`, bukan file):

| Variabel | Isi |
|---|---|
| `JWT_PRIVATE_KEY` | private key PKCS#8 RSA untuk menandatangani JWT (RAHASIA) |
| `JWKS` | public key JSON, dilayani di `/.well-known/jwks.json` |
| `AUTH_JWKS_DATA_URI` | public key + `kid` sebagai `data:` URI; ini yang dipakai `auth.config.ts` untuk MEMVERIFIKASI token |
| `CONVEX_SITE_URL` | disediakan otomatis oleh Convex: issuer JWT |

`bun run auth:keygen` mengisi ketiga nilai pertama sekaligus. Karena
`auth.config.ts` membaca issuer dari `CONVEX_SITE_URL`, file itu **tidak perlu
diubah** saat pindah dari development ke production.

**2. Environment build frontend** (di `.env.local`, atau di dashboard hosting):

| Variabel | Isi |
|---|---|
| `VITE_CONVEX_URL` | URL deployment Convex, dibekukan saat build |

> `.env.local` hanya untuk development dan di-gitignore. Hosting produksi
> (Cloudflare Pages / Freebuff) wajib diberi `VITE_CONVEX_URL` sendiri, kalau
> tidak aplikasi akan gagal dengan `No address provided to ConvexReactClient`.

> `JWT_PRIVATE_KEY` adalah rahasia. Jangan pernah di-commit atau ditempel ke chat.

---

## Deploy ke produksi

```bash
# 1. Keypair auth KHUSUS production (tidak ditulis ke disk sandbox)
bun run auth:keygen -- --prod

# 2. Push fungsi, skema, dan indeks ke deployment production
bunx convex deploy

# 3. Seed database production — hanya bisa saat database masih kosong
bunx convex run --prod seed:bootstrap
bunx convex run --prod seed:createDemoAccounts

# 4. Satukan dokumen staff dengan dokumen akun Convex Auth — WAJIB.
#    Tanpa langkah ini sign in berhasil tetapi langsung ditolak dengan
#    "Akun Anda belum memiliki peran di sistem 6Mart" karena peran ada di
#    dokumen staff, bukan di dokumen akun auth.
bunx convex run --prod seed:linkAuthAccounts

# 5. Verifikasi login terhadap production (tiap peran)
CONVEX_URL=https://<deployment-prod>.convex.cloud node scripts/verify-auth.mjs
```

Langkah 3 membuat akun demo (password `6mart2026`) beserta transaksi contoh.
**Ganti password akun demo sebelum dipakai sungguhan.**

> **Pesan error di production.** Convex menyembunyikan detail error server di deployment production: klien menerima `Server Error` + Request ID, termasuk
untuk penolakan RBAC dan pesan validasi. Akibatnya `scripts/verify-app.mjs`
melaporkan penolakan yang sah sebagai `GAGAL` saat dijalankan ke production.
Pengaturan ini bawaan per-deployment dan bisa diubah di dashboard Convex
deployment → Settings → **Server errors**; cara permanen di sisi kode adalah
melempar error aplikasi sebagai `ConvexError`.

Di hosting (Cloudflare Pages → Settings → Build): build command `bun run build`,
output directory `dist`, dan env var `VITE_CONVEX_URL` seperti pada langkah 5.
`public/_redirects` dan `public/_headers` sudah ikut ter-build agar SPA tidak 404
saat refresh.

---

## Struktur

```text
src/
  convex/            backend: query, mutation, action
    lib/             engine: guards, wallet, inventory, helpers
  lib/               domain murni: money, wallet, costing, accounting, rbac
  pages/             satu berkas per halaman
  components/        layout, auth, UI primitives
tests/               unit test
scripts/             orkestrator dev, keygen, verifikasi
docs/                blueprint dan dokumentasi turunan
```

Pemisahan penting: `src/lib/` berisi **domain murni** tanpa dependensi
Convex atau React. Misalnya `trialBalance()` dan HPP moving average
diuji langsung sebagai fungsi biasa, tanpa database.

---

## Verifikasi

Untuk memastikan deployment sehat:

```bash
node scripts/verify-app.mjs
```

Skrip ini masuk sebagai tiap akun demo, lalu menjalankan satu query nyata dari
setiap modul backend. Peran yang tidak berhak akan ditolak — itu hasil yang
diharapkan, bukan kegagalan.
