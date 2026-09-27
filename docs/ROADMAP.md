# 6Mart — Roadmap

Status per 27 September 2026. Rujukan kebutuhan: `docs/MASTER-BLUEPRINT.md`.

---

## V1.0 — Core POS + Wallet + Accounting · SELESAI

### Backend

Semua modul terpasang di Convex Cloud (`vibrant-puffin-745`):

| Modul | Berkas | Fungsi |
|---|---|---|
| Auth | `auth.ts`, `auth.config.ts` | password + Scrypt, JWT RS256, RBAC |
| Users | `users.ts` | profil, peran, hak akses |
| Students | `students.ts` | data Santri, kartu RFID/QR, NIS |
| Wallets | `wallets.ts`, `lib/walletEngine.ts` | top up, tarik, saldo, ledger |
| Products | `products.ts` | produk, kategori, supplier |
| Inventory | `inventory.ts`, `lib/inventoryEngine.ts` | stok, pembelian, HPP moving average |
| Sales | `sales.ts` | POS, shift kasir, refund, void |
| Finance | `finance.ts`, `lib/accounting.ts` | jurnal, general ledger, P&L, trial balance |
| Reports | `reports.ts` | laporan penjualan, inventori, dompet, kasir |
| Dashboard | `dashboard.ts` | ringkasan operasional dan keuangan |
| Services | `services.ts` | laundry, barbershop, jastip |
| PPOB | `ppob.ts` | produk dan transaksi PPOB |
| Payments | `payments.ts` | virtual account, webhook, top up |
| Audit | `audit.ts` | jejak audit append-only |
| Settings | `settings.ts` | pengaturan, notifikasi, orang tua |
| Seed | `seed.ts` | bootstrap, seed idempoten, linking akun |

Total 130+ fungsi publik.

### Frontend

Landing, auth, dashboard, POS, penjualan, produk, inventori, supplier,
siswa, detail siswa, dompet, keuangan, laporan, layanan, PPOB, pengguna,
audit, pengaturan, notifikasi, 404.

Prinsip: **klik lebih banyak, mengetik lebih sedikit.**

### Pengujian

- 128 unit test lulus (`bun test`) di `tests/{money,wallet,costing,accounting,rbac}.test.ts`.
- Typecheck bersih (`bun tsc -b --noEmit`).
- Verifikasi integrasi 7 akun demo x 16 modul backend: semua lulus, RBAC
  menolak sesuai peran (`node scripts/verify-app.mjs`).
- Verifikasi tulis nyata: buka shift, checkout, uji idempotensi, tutup shift,
  top up dompet. Trial balance tetap seimbang.

---

## V1.1 — Parent Portal + Virtual Account

- Portal orang tua: login, saldo anak, riwayat transaksi, request pencairan.
- Virtual account dari payment provider sungguhan (V1.0 masih simulasi).
- Verifikasi webhook HMAC dengan provider nyata.
- Notifikasi top up via WhatsApp.
- Batas limit per Santri yang bisa diatur wali.

---

## V1.2 — Laundry + Barbershop + Jastip

Tabel dan alur sudah ada di V1.0. Yang belum:

- Notifikasi status laundry dan barbershop ke wali.
- Laporan waktu dan pendapatan per layanan.
- Integrasi printer untuk struk.

---

## V1.3 — PPOB + Operational Analytics

- Integrasi PPOB provider nyata (kategori, produk, transaksi).
- Handling callback dan retry.
- Analitik operasional: penjualan per jam, produk terlaris, retensi Santri.
- Ekspor laporan ke PDF.

---

## Yang Belum Selesai dan Batasan Diketahui

| Item | Status | Catatan |
|---|---|---|
| Hardware RFID | simulasi | reader fisik belum terhubung; `RFID_MODE=simulation` |
| Payment provider | simulasi | alur VA dan webhook sudah ada, provider belum terhubung |
| localStorage sebagai DB | tidak dipakai | sesuai blueprint seksi 35 |
| HMR Vite | dinonaktifkan | `server.hmr: false` wajib untuk Freebuff |
| `seed:createDemoAccounts` | rusak | memakai `signInViaProvider` yang tidak ada; jalur signup manual yang dipakai |
| Beban saat jam sibuk | belum diuji | reactive query sudah dipakai, uji beban belum dilakukan |

---

## Utamakan Berikutnya

1. Ganti `seed:createDemoAccounts` dengan implementasi yang benar, atau hapus
   agar tidak menjadi kode mati yang menyesatkan.
2. Uji beban POS pada jam sibuk (target blueprint: checkout di bawah 3 detik).
3. Ambil kunci API payment provider dan PPOB lewat Settings lalu Environment.
4. Siapkan hardware RFID dan set `RFID_MODE=reader`.
