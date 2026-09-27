# 6Mart — Aturan Student Wallet

Dokumen ini menjelaskan dompet digital santri: bagaimana saldo disimpan,
bagaimana uang bergerak, dan mengapa saldo tidak boleh diedit langsung.

Sumber kebenaran tetap `docs/MASTER-BLUEPRINT.md` (§12–§20, §39, §40).
Implementasi: `src/convex/lib/walletEngine.ts`, `src/lib/wallet.ts`.

---

## 1. Enam Aturan Utama

| # | Aturan | Dijaga di |
|---|---|---|
| 1 | Saldo tidak boleh diedit langsung | tidak ada mutation `setBalance` |
| 2 | Semua perubahan saldo lewat ledger | `mutateWallet()` satu-satunya pintu |
| 3 | Saldo tidak boleh negatif | validasi sebelum tulis |
| 4 | Transaksi wallet harus atomic | satu transaksi Convex |
| 5 | Satu transaksi tidak boleh ter-debit dua kali | `idempotencyKey` |
| 6 | Transaksi sukses tidak boleh diproses ulang | `idempotencyKeys` |

---

## 2. Struktur Data

### `wallets`

```text
studentId     → Santri pemilik dompet
balance       → saldo saat ini (integer rupiah)
status        → ACTIVE | BLOCKED | LOST
dailyLimit    → batas debet per hari (opsional)
monthlyLimit  → batas bulanan (opsional)
```

Satu Santri punya tepat satu dompet. Dompet tidak dihapus; statusnya yang
diubah agar riwayat tetap utuh.

### `walletLedger`

Setiap perubahan saldo menghasilkan satu baris:

```text
studentId
walletId
type        → TOPUP | PURCHASE | WITHDRAWAL | REFUND
            | ADJUSTMENT | LAUNDRY | BARBERSHOP | JASTIP | PPOB
direction   → CREDIT (saldo naik) | DEBIT (saldo turun)
amount      → nilai mutasi, selalu positif
balanceBefore
balanceAfter
referenceType / referenceId  → menunjuk sumber (sale, topup, booking)
note
createdBy   → siapa yang memicu
createdAt
```

`balanceBefore` dan `balanceAfter` disimpan di setiap baris. Ini membuat
saldo bisa **diperiksa ulang** tanpa menghitung seluruh riwayat, dan
membuat ketidaksesuaian langsung terlihat di baris yang menyebabkannya.

### `walletTopups`

Top up punya dokumen sendiri karena punya status lifecycle
(`PENDING` → `PAID` / `EXPIRED` / `FAILED`) dan sumber dana (tunai, VA,
transfer). Ledger hanya mencatat saat top up benar-benar **`PAID`**.

---

## 3. Alur Uang

### Top up tunai (oleh kasir)

1. Kasir membuat dokumen top up dengan status `PENDING`.
2. Uang diterima, top up di-set `PAID`.
3. `mutateWallet()` menulis ledger `CREDIT`.
4. Jurnal: `Dr 1000 Kas / Cr 2000 Kewajiban Wallet`.

### Top up virtual account

1. 6Mart meminta VA ke payment provider.
2. QR/kode ditampilkan ke wali.
3. Provider mengirim webhook.
4. Webhook diverifikasi HMAC, lalu top up di-set `PAID`.
5. Jalur ledger dan jurnal sama seperti top up tunai, kas digantikan bank.

### Pembelian di kasir

1. Kasir mengidentifikasi Santri (RFID / QR / NIS).
2. Sistem mengecek saldo cukup.
3. `mutateWallet()` menulis ledger `DEBIT` dengan `referenceId` = sale.
4. Jurnal penjualan terbentuk penuh (lihat `ACCOUNTING-RULES.md` §4).

### Pencairan (ditarik oleh wali)

1. Verifikasi identitas, catat alasan.
2. `mutateWallet()` menulis ledger `DEBIT` dengan type `WITHDRAWAL`.
3. Jurnal: `Dr 2000 Kewajiban Wallet / Cr 1000 Kas`.

### Pembayaran jasa

Laundry, barbershop, jastip, dan PPOB semuanya memotong dompet dengan
`type` masing-masing, sehingga laporan per jenis layanan bisa disusun dari
ledger tanpa kolom terpisah.

---

## 4. Keamanan Saldo

### Saldo negatif ditolak

`mutateWallet()` menolak mutasi yang membuat `balanceAfter < 0` dengan
pesan Bahasa Indonesia. Overdraft belum ada di V1.0; bila suatu saat
diaktifkan, itu fitur baru dengan aturan dan batasnya sendiri — bukan
pelonggaran diam-diam.

### Batas harian

`dailyTopupLimit` dan `dailyDebitLimit` dihitung dari ledger hari yang sama,
bukan dari penghitung terpisah. Pemeriksaan ada di server, sehingga tidak
bisa dilewati dengan memanipulasi UI.

### Idempotensi

Tabel `idempotencyKeys` menyimpan:

```text
key        → "wallet.topup:abc-123"
scope      → nama operasi
requestHash→ hash isi request
resultId   → dokumen hasil
```

Kalau key yang sama datang lagi dengan hash yang sama, sistem mengembalikan
hasil lama (`replayed: true`) tanpa menulis apa pun. Kalau hash berbeda,
permintaan ditolak — ini mencegah key yang tidak sengaja dipakai ulang
untuk operasi lain.

---

## 5. Kardinalitas dan Konsistensi

- Satu Santri = satu dompet. Dijamin saat pembuatan dompet.
- Satu ledger = satu perubahan saldo. Tidak ada kasus "beberapa baris untuk
  satu mutasi" kecuali mutasinya memang majemuk (mis. satu pembayaran VA
  yang mencakup beberapa item), dan itu tetap satu entri.
- Tidak ada `delete` pada `walletLedger` maupun `walletTopups`. Koreksi
  dilakukan dengan baris `ADJUSTMENT` yang menunjuk baris asli.

---

## 6. What the Ledger Guarantees

Untuk setiap baris ledger, tiga hal selalu benar:

```text
balanceAfter  ==  balanceBefore ± amount
balanceBefore ==  balanceAfter baris sebelumnya untuk student yang sama
sum(direction × amount) == balance terakhir dompet
```

Kalau salah satu tidak terpenuhi, berarti ada bug, dan bisa ditemukan
dengan membaca ledger saja tanpa perlu menghitung ulang transaksi.

---

## 7. Pelaporan

Semua laporan dompet diturunkan dari ledger:

- `listWallets` — daftar dompet + saldo + filter (search, rentang saldo, status).
- `listLedger` — riwayat mutasi per Santri.
- `dailyUsage` — pemakaian per hari untuk grafik.
- `walletReport` — rekapitulasi seluruh periode.

Tidak ada angka saldo yang disimpan di luar tabel `wallets`, dan tidak ada
laporan yang menghitung ulang dari tabel penjualan.
