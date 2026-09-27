# 6Mart — Aturan Bisnis

Dokumen ini merangkum aturan bisnis yang **benar-benar ditegakkan oleh kode**
di repository ini. Setiap poin menunjuk ke berkas implementasi supaya mudah
ditelusuri dan diuji.

Sumber kebenaran tetap `docs/MASTER-BLUEPRINT.md`. Dokumen ini adalah
turunan teknisnya, bukan pengganti.

---

## 1. Peran dan Hak Akses (RBAC)

Definisi peran dan izin: `src/lib/rbac.ts`. Penegakan di server:
`assertPermission()` pada `src/convex/lib/guards.ts`.

| Peran | Label | Cakupan |
|---|---|---|
| `super_admin` | Super Admin | akses penuh, kelola pengguna |
| `manager` | Manager 6Mart | operasional + keuangan |
| `supervisor` | Supervisor | operasional, tanpa jurnal |
| `cashier` | Kasir | POS, students, wallet |
| `finance` | Finance | akuntansi, jurnal, laporan |
| `inventory` | Staff Inventory | stok, pembelian, supplier |
| `owner` | Owner / Management | baca laporan, tanpa mutate |
| `parent` | Orang Tua | data anak sendiri |
| `student` | Santri | dompet sendiri |

Aturan yang berlaku:

- Setiap peran punya daftar izin eksplisit. Tidak ada izin default "semua".
- Penegakan terjadi di **server** pada setiap query/mutation. Menyembunyikan
  tombol di UI bukan mekanisme keamanan.
- Peran `owner` hanya membaca. Sengaja tidak diberi izin mutasi apa pun.
- Rbac diuji unit di `tests/rbac.test.ts`.

---

## 2. Uang 6Mart vs Uang Santri

Ini pemisahan paling penting di sistem (blueprint §31).

- Saldo wallet siswa dicatat sebagai **LIABILITY** akun `2000`, bukan pendapatan
  dan bukan aset milik 6Mart.
- Laba hanya diakui saat pendapatan diakui (saat penjualan Terjual), bukan
  saat uang masuk ke kas.
- Top up  Increase wallet = Kas masuk, tetapi **bukan pendapatan**.
  Jurnalnya:`Dr 1000 Kas / Cr 2000 Kewajiban Wallet`. Laba unaffected.
- Tidak ada akun "revenue" yang boleh naik karena transfer masuk ke dompet
  siswa. Ini diperiksa di `src/lib/accounting.ts`.

---

## 3. Transaksi Uang

- Semua nominal uang adalah **integer rupiah penuh** (tanpa sen), dibulatkan
  lewat `assertRupiah()` / `roundToSen()` di `src/lib/money.ts`.
- Nominal yang masuk ke jurnal wajib berupa bilangan bulat. Nilai pecahan
  ditolak, bukan dibulatkan diam-diam.
- Diskon hanya boleh dalam rentang 0..100 persen.

---

## 4. Penjualan (POS)

Implementasi: `src/convex/sales.ts`, helper di `src/lib/costing.ts`.

- Kasir **wajib membuka shift** sebelum transaksi pertama. Percobaan
  checkout tanpa shift ditolak dengan pesan Bahasa Indonesia yang jelas.
- Stok tidak boleh minus. Checkout melebihi stok gagal.
- Setiap penjualan memotong stok dan mencatat HPP memakai **moving average**
  pada saat barang keluar (blueprint §23).
- Penjualan menghasilkan jurnal 4 baris: Kas/Pendapatan + HPP/Barang.
- `idempotencyKey` wajib pada `checkout`. Panggilan ulang dengan key sama
  mengembalikan hasil sebelumnya dengan `replayed: true` dan **tidak**
  membuat penjualan kedua.
- Pembatalan (`voidSale`) tidak menghapus data, melainkan membalik jurnal.

---

## 5. Shift Kasir

- Hanya satu shift `OPEN` per kasir. Membuka kedua kali ditolak.
- `closeShift` menghitung `expectedCash` dari modal awal + penjualan tunai
  + mutasi kas, lalu membandingkan dengan `actualCash` hasil hitung fisik.
- Selisih disimpan pada shift sebagai `difference` (boleh negatif = kurang).
  Selisih **tidak** dibalik otomatis; supervisor yang memutuskan.

---

## 6. Dompet Siswa

Implementasi: `src/convex/lib/walletEngine.ts`, aturan di
`src/lib/wallet.ts`.

- Saldo **tidak pernah** diedit langsung. Semua perubahan lewat ledger.
- Saldo tidak boleh negatif (belum ada overdraft di V1.0).
- Setiap entri ledger menyimpan `balanceBefore` dan `balanceAfter`, sehingga
  saldo bisa diaudit ulang tanpa menghitung ulang seluruh riwayat.
- Setiap mutasi dompet juga menulis jurnal akuntansi (liability bergerak).
- `idempotencyKey` mencegah satu transaksi ter-debit dua kali.

---

## 7. Inventori

Implementasi: `src/convex/lib/inventoryEngine.ts`, `src/lib/costing.ts`.

- Metode biaya: **moving average**, bukan FIFO atau LIFO.
- Barang keluar dihitung pada `averageCost` saat itu. Average cost tidak
  berubah karena barang keluar — hanya karena barang masuk atau koreksi.
- Kuantitas barang timbang dibulatkan ke 3 desimal (`roundQuantity`), karena
  laundromat dan jastip memakai satuan pecahan.
- Produk memakai HPP rata-rata bergerak. Nilai persediaan =
  `qty x averageCost`.
- Stok negatif ditolak di setiap jalur (penjualan, adjustment, retur).

---

## 8. Laundry, Barbershop, Jastip, PPOB

- Semua layanan memakai siklus status, bukan kolom boolean.
- Pembayaran servicio memotong dompet siswa dan menghasilkan jurnal pada
  akun pendapatan masing-masing (`4010` laundry, `4020` barbershop,
  `4030` jastip, `4040` PPOB).
- PPOB gagal tidak memotong saldo. Pemotokan hanya setelah upstream
  mengonfirmasi sukses (webhook / polling status).

---

## 9. Top Up

- Bisa via tunerai (kasir) atau virtual account.
- VA menghasilkan kode yang bisa dipindai QR, lalu menunggu webhook.
- Webhook pembayaran **idempoten**: event dengan `eventId` sama diproses satu
  kali. Diterapkan di `mountWalletWebhook()` pada `src/convex/payments.ts`.
- Webhook selalu diverifikasi lewat `HMAC`, bukan hanya lewat kemunculan URL.

---

## 10. Error

Semua error memakai pesan Bahasa Indonesia yang bisa ditampilkan langsung ke
kasir, didefinisikan di `src/convex/lib/guards.ts`:

| Kelas | Jenis | Contoh |
|---|---|---|
| `AuthError` | 401 | "Anda harus masuk terlebih dahulu" |
| `ForbiddenError` | 403 | "Anda tidak memiliki izin ..." |
| `ValidationError` | 422 | field tidak valid |
| `NotFoundError` | 404 | "Santri tidak ditemukan" |
| `BusinessRuleError` | 422 | "Buka shift kasir terlebih dahulu" |

Frontend tidak pernah menampilkan pesan teknis bahasa Inggris ke pengguna.

---

## 11. Audit

- Setiap mutasi sensitif menulis ke `auditLogs`: aktor, aksi, entitas,
  nilai sebelum/sesudah, waktu.
- Actor diambil dari JWT, bukan dari argumen request, sehingga tidak bisa
  dipalsukan klien.
- Log audit **append-only**. Tidak ada endpoint untuk menghapus atau mengubah.

---

## 12. Batas Harian Dompet

- `dailyTopupLimit` dan `dailyDebitLimit` diatur di `settings`.
- Melampaui batas menghasilkan `BusinessRuleError`, bukan sekadar peringatan
  di UI. Penjaga ada di server.
