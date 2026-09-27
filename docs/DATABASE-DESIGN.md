# 6Mart — Desain Database

Dokumen ini menjelaskan skema database 6Mart: tabel apa saja yang ada,
bagaimana hubungannya, dan index apa yang mendukung query.

Sumber kebenaran tetap `docs/MASTER-BLUEPRINT.md` (§35, §36).
Skema didefinisikan di `src/convex/schema.ts`.

---

## 1. Penyimpanan

Database adalah **Convex** (deployment `vibrant-puffin-745`). Semua akses
melalui query/mutation Convex, tidak ada SQL mentah di aplikasi.

Blueprint menyebut target utama Cloudflare D1/SQL, dan mengizinkan
abstraction layer bila Freebuff memakai provider lain. Convex sudah
menyediakan lapisan itu: skema didefinisikan sekali di `schema.ts`, dan
seluruh aplikasi hanya mengenal `ctx.db`. Pindah ke D1 berarti menulis ulang
`schema.ts` plus adapter, bukan men-touch logika bisnis.

**localStorage tidak pernah menjadi database.** Satu-satunya yang disimpan
di browser adalah token sesi dan preferensi tampilan.

---

## 2. Konvensi Penamaan

Blueprint §36 menulis nama tabel dengan underscore (`parent_students`).
Implementasi memakai **camelCase** (`parentStudents`) karena itu konvensi
wajib Convex. Maknanya identik; hanya gaya penamaan yang berbeda.

Field waktu memakai **milidetik sejak epoch** (`Date.now()`), bukan objek
Date, karena Convex hanya menyimpan JSONValue.

---

## 3. Kelompok Tabel

### Identitas dan akses

```text
users
roles
permissions
```

`users` adalah tabel **gabung**: field bawaan Convex Auth
(`email`, `image`, `emailVerificationTime`, ...) ditambah field staff 6Mart
(`roleKey`, `roleLabel`, `permissions`, `isActive`, `subject`,
`lastLoginAt`, `failedLoginCount`, `lockedUntil`).

Tabel auth lain (`authAccounts`, `authSessions`, `authRefreshTokens`,
`authVerifiers`, `authVerificationCodes`, `authRateLimits`) berasal dari
`authTables` milik `@convex-dev/auth` dan di-spread ke skema.

> Penting: `createdAt` dan `updatedAt` opsional **khusus di `users`**.
> Convex Auth membuat dokumen pengguna tanpa timestamp, jadi mewajibkan
> keduanya akan menggagalkan setiap pendaftaran.

Index `users`: `email`, `phone`, `by_subject`, `by_role`.

### Santri dan keluarga

```text
students
parents
parentStudents
studentCards
```

`students` memakai `nis` sebagai nomor induk, unik secara praktis. `students`
juga punya `externalRef` untuk id dari PIAT 6 Super App, sehingga data tidak
perlu diduplikasi.

`studentCards` menyimpan kartu RFID/QR. Satu Santri dapat punya lebih dari
satu riwayat kartu karena penggantian kartu harus dapat diaudit
(`replaceCard` tidak menghapus kartu lama).

### Dompet

```text
wallets
walletLedger
walletLimits
walletTopups
```

Detail aturan ada di `WALLET-RULES.md`.

### Produk dan inventori

```text
categories
products
suppliers
inventory
inventoryMovements
purchases
purchaseItems
```

`products` menyimpan `purchasePrice` (harga beli terakhir) dan
`averageCost` (HPP bergerak) sebagai field terpisah, karena keduanya
berbeda makna. `inventoryMovements` adalah append-only: setiap perubahan
stok tercatat dengan tipe (`RECEIVE`, `ISSUE`, `ADJUSTMENT`) dan
referensi ke dokumen sumbernya.

### Penjualan

```text
sales
saleItems
payments
refunds
```

`saleItems` menyimpan `price` dan `costSnapshot` saat transaksi terjadi.
`costSnapshot` sengaja disimpan agar laporan historis tidak berubah ketika
HPP produk berubah di kemudian hari.

### Kasir

```text
cashierShifts
cashTransactions
```

### Akuntansi

```text
chartOfAccounts
journalEntries
journalLines
expenses
```

`journalEntries` + `journalLines` adalah cabecera/line item. Satu entri
wajib punya total debit sama dengan total kredit.

### Layanan

```text
laundryOrders
laundryItems
barbershopServices
barbershopBookings
jastipOrders
jastipItems
ppobProducts
ppobTransactions
```

### Integrasi dan sistem

```text
virtualAccounts
integrationLogs
idempotencyKeys
performanceMetrics
notifications
auditLogs
settings
```

---

## 4. Index

Index dideklarasikan pada setiap `defineTable`. Contoh:

```text
students:   by_nis, by_name, by_status
products:   by_sku, by_category, by_status
sales:      by_date, by_cashier, by_student, by_status
walletLedger: by_wallet, by_student, by_date
journalEntries: by_date, by_source
journalLines:  by_entry, by_account
```

Query **wajib** memakai `withIndex` untuk pencarian. `collect()` +
filtering in-memory hanya boleh pada tabel yang dijamin kecil (mis.
`chartOfAccounts`, `settings`).

> Satu index pada `users` pernah bentrok: `users.email` dan
> `users.by_email` punya field identik, yang membuat deployment gagal.
> Sekarang hanya ada satu index, dan semua pemanggilnya sudah diselaraskan.

---

## 5. Hubungan

```text
parents   ──< parentStudents >── students
students  ──< studentCards
students  ──1 wallets ──< walletLedger
students  ──< sales ──< saleItems >── products
students  ──< walletTopups ──< virtualAccounts
users     ──< cashierShifts ──< cashTransactions
users     ──< sales (cashierId)
products  ──< inventoryMovements
suppliers ──< purchases ──< purchaseItems
journalEntries ──< journalLines >── chartOfAccounts
students  ──< laundryOrders | barbershopBookings | jastipOrders
```

---

## 6. Aturan Integritas Data

- Foreign key ditegakkan lewat `v.id("students")` dan konsekuensi database.
- Tidak ada `delete` pada tabel historis (`sales`, `walletLedger`,
  `journalLines`, `auditLogs`, `inventoryMovements`). Perubahan selalu
  selalu muncul sebagai baris baru atau perubahan status.
- `students`, `products`, dan `users` boleh dinonaktifkan lewat status,
  bukan dihapus, agar riwayat tetap bisa dibaca.
- Nilai uang selalu integer. Kolom uang tidak pernah menyimpan string.

---

## 7. Seed / Data Demo

`src/convex/seed.ts`:

- `bootstrap` — sekali saja, menolak jalan bila database sudah berisi
  peran, sehingga tidak menjadi celah keamanan.
- `seed` — idempoten, butuh Super Admin atau Manager.
- `linkAuthAccounts` — menggabungkan dokumen auth dengan dokumen staff.
- `status` — ringkasan jumlah baris, dipakai sebagai pemeriksaan cepat.

Data demo di deployment cloud saat ini: 7 pengguna, 12 Santri, 23 produk,
6+ penjualan, 24 jurnal, 13 entri ledger, 7 kategori, 3 supplier,
3 expenses, 8 top up, 4 layanan barbershop.
