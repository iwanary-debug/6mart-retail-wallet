# 6Mart — Rules of Accounting

Dokumen ini menjelaskan bagaimana 6Mart mencatat transaksi keuangan, dan
mengapa setiap aturan itu ada. Implementasi utamanya: `src/lib/accounting.ts`.

Sumber kebenaran tetap `docs/MASTER-BLUEPRINT.md` (§28–§31, §62).

---

## 1. Prinsip Dasar

Tiga aturan yang tidak boleh dilanggar:

1. **Double entry tanpa pengecualian.** Setiap jurnal memiliki jumlah debit
   sama dengan jumlah kredit. Tidak ada jurnal "satu sisi".
2. **Setiap transaksi financially significant menghasilkan jurnal otomatis.**
   Kasir tidak pernah membuat jurnal manual.
3. **Uang 6Mart dan uang Santri tidak boleh tercampur.** Dompet siswa adalah
   kewajiban, bukan pendapatan.

---

## 2. Chart of Accounts

### Aset

```text
1000 Kas
1010 Bank
1100 Persediaan
```

### Kewajiban

```text
2000 Kewajiban Wallet Santri
2100 Hutang Supplier
```

### Ekuitas

```text
3000 Modal Owner
```

### Pendapatan

```text
4000 Penjualan Retail
4010 Pendapatan Laundry
4020 Pendapatan Barbershop
4030 Pendapatan Jastip
4040 Pendapatan PPOB
```

### HPP

```text
5000 HPP Retail
5010 HPP Laundry
5020 HPP Jastip
```

### Beban Operasional

```text
6000 Beban Gaji
6010 Beban Listrik
6020 Beban Internet
6030 Beban Sewa
6040 Beban Perlengkapan
6050 Beban Pemeliharaan
6060 Beban Lain-lain
```

COA disimpan di tabel `chartOfAccounts` dan diisi lewat
`settings:seedChartOfAccounts`. Jurnal tidak pernah menulis nomor akun yang
tidak ada di COA.

---

## 3. Normal Saldo

| Tipe akun | Sisi normal | Contoh |
|---|---|---|
| ASSET | Debit | Kas, Bank, Persediaan |
| LIABILITY | Kredit | Kewajiban Wallet, Hutang Supplier |
| EQUITY | Kredit | Modal Owner |
| REVENUE | Kredit | Penjualan |
| EXPENSE | Debit | HPP, Beban |

Ini penting untuk `trialBalance`: sistem menjumlahkan per sisi, lalu
menghitung selisih bersih per akun.

---

## 4. Jurnal Standar

### Top up tunai

```text
Dr 1000 Kas                50.000
    Cr 2000 Kewajiban Wallet       50.000
```

Kas naik, kewajiban naik. **Tidak ada pendapatan.** Laba tidak berubah.

### Top up via virtual account

```text
Dr 1010 Bank               50.000
    Cr 2000 Kewajiban Wallet       50.000
```

Sama secara ekonomi, hanya akun kas yang berbeda.

### Penjualan tunai dengan HPP

```text
Dr 1000 Kas                10.000
Dr 5000 HPP Retail          6.000
    Cr 4000 Penjualan Retail       10.000
    Cr 1100 Persediaan              6.000
```

Kasir tidak perlu memilih akun apa pun. Jurnal dibentuk otomatis oleh
`checkout()`.

### Penjualan dibayar dompet siswa

```text
Dr 2000 Kewajiban Wallet   10.000
Dr 5000 HPP Retail          6.000
    Cr 4000 Penjualan Retail       10.000
    Cr 1100 Persediaan              6.000
```

Di sini kewajiban wallet **berkurang** (debit), bukan bertambah. Semua uang
bertukar posisi di dalam 6Mart; tidak ada kas masuk dari luar.

### Pembelian dari supplier (tunai)

```text
Dr 1100 Persediaan         50.000
    Cr 1000 Kas                    50.000
```

### Pembelian dari supplier (kredit)

```text
Dr 1100 Persediaan         50.000
    Cr 2100 Hutang Supplier        50.000
```

### Beban operasional

```text
Dr 6010 Beban Listrik      25.000
    Cr 1000 Kas                    25.000
```

### Pencairan dompet (withdrawal)

```text
Dr 2000 Kewajiban Wallet   20.000
    Cr 1000 Kas                    20.000
```

Kewajiban turun karena 6Mart mengembalikan uang milik Santri. Bukan
pendapatan, bukan beban.

### Refund penjualan

Membalik jurnal penjualan asli. Stok kembali dengan HPP saat penjualan itu
terjadi, bukan HPP hari ini.

---

## 5. Metode HPP

- **Moving average**, bukan FIFO atau LIFO. Diterapkan di `src/lib/costing.ts`.
- HPP dihitung saat barang **keluar**, memakai `averageCost` pada saat itu.
- Average cost **tidak berubah** karena barang keluar. Ia hanya berubah
  karena barang masuk atau koreksi adjustment.
- Pembulatan kuantitas ke 3 desimal untuk barang timbang.

Contoh: beli 10 kg @ Rp 1.000, lalu 10 kg @ Rp 1.400.
Average = (10.000 + 14.000) / 20 = **Rp 1.200/kg**.
Jual 5 kg → HPP = 5 × 1.200 = **Rp 6.000**. Sisa 15 kg tetap @ Rp 1.200.

---

## 6. Laporan

### Trial Balance

Dirakit di `trialBalance()`. Per akun, selisih `debit - credit` dihitung
lalu dinormalisasi ke satu sisi:

```text
net > 0  -> tampil di kolom debit
net < 0  -> tampil di kolom credit (nilai positif)
```

`isBalanced` bernilai benar hanya bila total debit = total kredit. Ini
diperiksa setiap kali laporan dibuat, bukan hanya saat membuat jurnal.

> Catatan implementasi: versi pertama pernah membalik sisi untuk akun
> kredit-normal sehingga trial balance selalu tidak seimbang. Perbaikan ada
> di `src/lib/accounting.ts` dan diuji di `tests/accounting.test.ts`.

### Profit & Loss

```text
Pendapatan          (akun 4xxx)
- HPP               (akun 5xxx)
-----------------------------------
Laba Kotor
- Beban Operasional  (akun 6xxx)
-----------------------------------
Laba Bersih / Rugi
```

Money dihitung dari jurnal, bukan dari tabel penjualan, sehingga penjualan
yang sudah void tidak ikut terhitung.

### Laporan lain

`generalLedger`, `dailyFinancial`, `cashSummary`, `salesReport`,
`inventoryReport`, `walletReport`, `cashierReport`. Semuanya diturunkan dari
jurnal atau ledger, tidak ada angka yang diketik manual.

---

## 7. Aturan Integritas

- Jurnal **tidak dapat** dihapus. Koreksi dilakukan dengan jurnal pembalik.
- `journalEntries` menyimpan `reversalOf` untuk menautkan pembatalan.
- Jurnal manual (beban, koreksi) hanya bisa dibuat peran `finance`,
  `manager`, atau `super_admin`.
- Semua nominal wajib bilangan bulat rupiah penuh lewat `assertRupiah()`.

---

## 8. Pemeriksaan Otomatis

Sistem menolak, bukan hanya memperingatkan:

- Jurnal dengan total debit ≠ total kredit.
- Nominal bukan bilangan bulat.
- Nomor akun tidak ada di COA.
- Saldo persediaan menjadi negatif.
- Top up melebihi `dailyTopupLimit`.
- Debit dompet melebihi `dailyDebitLimit`.
