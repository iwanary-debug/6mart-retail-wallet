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

Nilai environment disimpan di `.env.local` (dikelola lewat Settings, jangan
diedit manual di repo):

| Variabel | Isi |
|---|---|
| `VITE_CONVEX_URL` | URL deployment Convex |
| `VITE_CONVEX_SITE_URL` | site URL, jadi issuer JWT |
| `JWT_PRIVATE_KEY` | private key PKCS#8 RSA untuk menandatangani JWT |
| `JWKS` | public key dalam format JSON |

> `JWT_PRIVATE_KEY` adalah rahasia. Jangan pernah di-commit.

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
