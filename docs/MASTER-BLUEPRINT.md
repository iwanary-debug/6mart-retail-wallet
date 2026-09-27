# 6Mart Retail & Student Wallet System

## MASTER BLUEPRINT

### Version 1.0

**Project Name:** 6Mart Retail & Student Wallet System
**Institution:** PIAT 6 Bondowoso
**Project Type:** Standalone Web Application
**Development Platform:** Freebuff Cloud + GitHub
**Target Architecture:** Cloudflare-compatible, API-first, relational database
**Document Status:** Master Source of Truth
**Version:** 1.0
**Priority:** Build a simple, usable, reliable V1.0 first

---

# 1. PROJECT OVERVIEW

6Mart adalah aplikasi mandiri untuk mengelola:

1. Toko/minimarket pesantren
2. Kasir/POS
3. Produk dan inventory
4. Student Wallet
5. Pembayaran cashless
6. RFID 125 kHz
7. QR Student ID
8. Penjualan
9. Penarikan uang santri
10. Keuangan dan akuntansi
11. Laporan laba/rugi
12. Audit transaksi

Pada versi berikutnya sistem akan dikembangkan untuk:

* Laundry
* Barbershop
* Jastip makanan/minuman
* PPOB
* Portal wali santri
* Virtual Account
* Integrasi dengan PIAT 6 Super App

---

# 2. TUJUAN UTAMA

Tujuan utama aplikasi adalah membuat operasional 6Mart:

* cepat
* sederhana
* mudah digunakan
* minim antrean
* aman
* tercatat
* mudah diaudit
* memiliki laporan keuangan
* dapat mengetahui apakah operasional 6Mart menghasilkan laba atau rugi

Sistem harus dirancang agar pengguna tidak perlu melakukan pekerjaan administrasi berulang.

Contoh:

Kasir cukup:

**SCAN BARANG → IDENTIFIKASI SANTRI → CEK SALDO → DEBIT WALLET → SELESAI**

Tidak boleh ada proses manual yang tidak diperlukan.

---

# 3. PRINSIP PENGEMBANGAN

## 3.1 Build Simple First

V1.0 tidak boleh terlalu kompleks.

Prioritas:

**Simple → Usable → Reliable → Scalable**

Jangan membangun fitur lanjutan sebelum fitur utama stabil.

---

## 3.2 Real Application

Aplikasi bukan sekadar mockup.

Semua fitur utama V1.0 harus mempunyai:

* database
* CRUD
* validasi
* API
* state nyata
* transaksi nyata
* audit trail

Jangan membuat tombol yang hanya terlihat bekerja tetapi tidak menyimpan data.

---

## 3.3 Financial Integrity

Semua transaksi uang harus dapat ditelusuri.

Tidak boleh:

* mengubah saldo secara sembarangan
* menghapus transaksi keuangan
* mengubah histori transaksi tanpa audit
* menggunakan floating point untuk uang
* membuat saldo tanpa ledger

Koreksi transaksi dilakukan melalui:

**REVERSAL / ADJUSTMENT**

bukan dengan menghapus transaksi lama.

---

# 4. V1.0 SCOPE

V1.0 wajib memiliki modul berikut:

1. Authentication
2. Dashboard
3. Kasir / POS
4. Produk
5. Inventory
6. Supplier
7. Student
8. RFID
9. QR Student ID
10. Student Wallet
11. Top Up
12. Withdrawal
13. Cashier Shift
14. Keuangan
15. Accounting dasar
16. Laporan
17. Audit Log
18. User & Role

Fitur berikut disiapkan sebagai roadmap dan **tidak wajib selesai pada V1.0**:

* Parent Portal
* Virtual Account
* Laundry
* Barbershop
* Jastip
* PPOB
* Payment Gateway
* Integrasi PIAT 6 Super App

---

# 5. USER ROLES

Minimal terdapat role:

## 5.1 Super Admin

Memiliki akses penuh.

## 5.2 Manager 6Mart

Melihat operasional, penjualan, inventory dan keuangan.

## 5.3 Supervisor

Mengawasi operasional dan kasir.

## 5.4 Cashier

Melakukan:

* transaksi penjualan
* pembayaran wallet
* pembayaran cash
* shift kasir

Tidak boleh mengakses konfigurasi sistem.

## 5.5 Inventory Staff

Mengelola:

* produk
* stok
* pembelian
* supplier
* stock adjustment

## 5.6 Finance

Mengelola:

* transaksi keuangan
* jurnal
* expense
* laporan

## 5.7 Owner / Management

Melihat dashboard dan laporan manajemen.

## 5.8 Parent

Disiapkan untuk V1.1.

## 5.9 Student

Disiapkan untuk akses terbatas di masa depan.

---

# 6. NAVIGATION

Sidebar utama:

1. Dashboard
2. Kasir
3. Penjualan
4. Produk
5. Inventory
6. Supplier
7. Student
8. Wallet
9. Keuangan
10. Laporan
11. Pengaturan
12. Audit Log

Fitur V1.2/V1.3:

13. Laundry
14. Barbershop
15. Jastip
16. PPOB

---

# 7. UI/UX PRINCIPLES

Bahasa aplikasi:

**Bahasa Indonesia**

Desain:

* modern
* bersih
* sederhana
* responsive
* desktop friendly
* mobile friendly

Prinsip:

> Klik lebih banyak, mengetik lebih sedikit.

---

# 8. FAST CHECKOUT

Fast Checkout adalah prioritas utama aplikasi.

Target alur:

```text
SCAN BARANG
      ↓
KERANJANG
      ↓
TOTAL
      ↓
TAP RFID / SCAN QR
      ↓
IDENTIFIKASI SANTRI
      ↓
CEK SALDO
      ↓
AUTO DEBIT
      ↓
TRANSAKSI SELESAI
```

Tidak boleh ada popup atau konfirmasi yang tidak diperlukan.

Jika saldo cukup:

**langsung proses pembayaran.**

Jika saldo tidak cukup:

**tampilkan saldo dan kekurangan.**

---

# 9. PAYMENT METHODS

V1.0 mendukung:

### 9.1 Cash

Pembayaran tunai.

### 9.2 Student Wallet

Pembayaran dari saldo santri.

### 9.3 RFID 125 kHz

RFID digunakan sebagai:

**IDENTIFIER / PAYMENT INSTRUMENT**

RFID bukan tempat penyimpanan saldo.

Saldo tetap berada di database wallet.

### 9.4 QR Student ID

QR dapat digunakan sebagai alternatif RFID.

### 9.5 NIS

NIS menjadi fallback identifier.

---

# 10. RFID DESIGN

Setiap kartu RFID memiliki:

* card_id
* RFID UID
* student_id
* status
* issued_at
* blocked_at

Status:

* ACTIVE
* BLOCKED
* LOST
* REPLACED

Jika kartu hilang:

1. blokir kartu lama
2. buat kartu baru
3. hubungkan kartu baru dengan student yang sama
4. saldo wallet tetap sama

Saldo tidak boleh melekat pada kartu.

Saldo melekat pada:

**STUDENT WALLET**

---

# 11. STUDENT

Data minimal:

```text
student_id
nis
name
gender
class
dormitory
room
parent_id
status
created_at
updated_at
```

Student ID harus unik.

NIS harus unik.

---

# 12. STUDENT WALLET

Setiap santri memiliki satu wallet utama.

Relasi:

```text
STUDENT
   ↓
WALLET
   ↓
WALLET LEDGER
```

Wallet mempunyai:

* wallet_id
* student_id
* current_balance
* status
* created_at
* updated_at

---

# 13. WALLET LEDGER

Wallet Ledger adalah sumber utama histori saldo.

Setiap transaksi memiliki:

```text
transaction_id
wallet_id
type
amount
debit
credit
balance_before
balance_after
reference_type
reference_id
status
created_at
created_by
```

Jenis transaksi:

```text
TOPUP
PURCHASE
WITHDRAWAL
REFUND
ADJUSTMENT
LAUNDRY
BARBERSHOP
JASTIP
PPOB
```

Untuk V1.0 fokus pada:

* TOPUP
* PURCHASE
* WITHDRAWAL
* REFUND
* ADJUSTMENT

---

# 14. WALLET RULES

## Rule 1

Saldo tidak boleh diedit langsung.

## Rule 2

Semua perubahan saldo harus melalui ledger.

## Rule 3

Saldo tidak boleh negatif kecuali fitur overdraft secara khusus diaktifkan pada versi mendatang.

## Rule 4

Transaksi wallet harus atomic.

## Rule 5

Satu transaksi tidak boleh terdebit dua kali.

## Rule 6

Transaksi yang sudah sukses tidak boleh diproses ulang.

Gunakan:

**idempotency key**

untuk transaksi yang memerlukan perlindungan duplicate processing.

---

# 15. TOP UP

V1.0 menyediakan top up untuk testing dan operasional internal.

Metode:

* manual oleh admin/finance
* bank transfer simulation
* future Virtual Account

Contoh:

Wali mengirim:

**Rp500.000**

Maka wallet santri:

```text
Saldo sebelum : Rp100.000
Top Up        : Rp500.000
Saldo sesudah : Rp600.000
```

---

# 16. ACCOUNTING TOP UP

Top Up wallet **BUKAN pendapatan 6Mart**.

Contoh:

Wali melakukan top up Rp500.000.

Jurnal:

```text
DEBIT
Bank                    Rp500.000

CREDIT
Student Wallet Liability Rp500.000
```

Artinya uang tersebut merupakan dana milik santri yang dititipkan dalam sistem.

---

# 17. PURCHASE

Contoh santri membeli:

```text
Roti       Rp10.000
Minuman     Rp5.000
-------------------
Total      Rp15.000
```

Wallet:

```text
Saldo sebelum : Rp100.000
Pembelian     : Rp15.000
Saldo sesudah : Rp85.000
```

Ledger:

```text
PURCHASE
Debit Wallet : Rp15.000
```

---

# 18. ACCOUNTING PURCHASE

Misalnya:

Harga jual:

**Rp15.000**

HPP:

**Rp10.000**

Jurnal pembayaran:

```text
DEBIT
Student Wallet Liability     Rp15.000

CREDIT
Retail Sales Revenue         Rp15.000
```

Jurnal HPP:

```text
DEBIT
Cost of Goods Sold           Rp10.000

CREDIT
Inventory                    Rp10.000
```

Gross Profit:

```text
Rp15.000 - Rp10.000
= Rp5.000
```

---

# 19. WITHDRAWAL

Santri dapat melakukan penarikan uang jika fitur tersebut diaktifkan.

Contoh:

```text
Saldo sebelum : Rp200.000
Withdrawal    : Rp50.000
Saldo sesudah : Rp150.000
```

Jurnal:

```text
DEBIT
Student Wallet Liability    Rp50.000

CREDIT
Cash                        Rp50.000
```

Withdrawal harus tercatat dalam audit log.

---

# 20. REFUND

Refund tidak menghapus transaksi lama.

Contoh:

Pembelian:

```text
PURCHASE #1001
Rp20.000
```

Refund:

```text
REFUND #1002
Rp20.000
```

Wallet ledger tetap menyimpan kedua transaksi tersebut.

---

# 21. PRODUCT

Data produk minimal:

```text
product_id
sku
barcode
name
category_id
unit
purchase_price
selling_price
stock
minimum_stock
supplier_id
status
created_at
updated_at
```

SKU harus unik.

Barcode harus unik jika digunakan.

---

# 22. INVENTORY

Inventory harus mencatat semua pergerakan stok.

Jenis movement:

```text
PURCHASE
SALE
RETURN
ADJUSTMENT_IN
ADJUSTMENT_OUT
DAMAGE
LOSS
```

Setiap movement memiliki:

```text
movement_id
product_id
type
quantity
unit_cost
reference_type
reference_id
created_at
created_by
```

---

# 23. INVENTORY COST

V1.0 menggunakan:

**Weighted Average Cost**

untuk menghitung HPP.

Sistem harus dapat menghitung:

* stock quantity
* average cost
* inventory value
* COGS

---

# 24. SUPPLIER

Data:

```text
supplier_id
name
phone
address
contact_person
status
```

Fitur V1.0:

* daftar supplier
* tambah supplier
* edit supplier
* pembelian
* histori pembelian

---

# 25. SALES

Setiap transaksi penjualan memiliki:

```text
sale_id
invoice_number
student_id
cashier_id
payment_method
subtotal
discount
total
status
created_at
```

Sale Items:

```text
sale_item_id
sale_id
product_id
quantity
selling_price
cost_price
subtotal
```

---

# 26. CASHIER SHIFT

Kasir bekerja berdasarkan shift.

Shift memiliki:

```text
shift_id
cashier_id
opening_cash
cash_sales
cash_in
cash_out
expected_cash
actual_cash
difference
opened_at
closed_at
status
```

Saat tutup shift:

```text
Expected Cash
Actual Cash
Difference
```

harus dihitung otomatis.

---

# 27. CASH MANAGEMENT

Semua pergerakan uang tunai harus tercatat.

Jenis:

```text
SALE
WITHDRAWAL
EXPENSE
CASH_IN
CASH_OUT
OPENING_BALANCE
SHIFT_ADJUSTMENT
```

---

# 28. CHART OF ACCOUNTS

V1.0 menggunakan COA sederhana.

## Assets

```text
1000 Cash
1010 Bank
1100 Inventory
```

## Liabilities

```text
2000 Student Wallet Liability
2100 Supplier Payable
```

## Equity

```text
3000 Owner Equity
```

## Revenue

```text
4000 Retail Sales
4010 Laundry Revenue
4020 Barbershop Revenue
4030 Jastip Revenue
4040 PPOB Revenue
```

Fitur revenue tambahan belum wajib aktif di V1.0.

## COGS

```text
5000 Retail COGS
5010 Laundry COGS
5020 Jastip COGS
```

## Operating Expense

```text
6000 Salary Expense
6010 Electricity Expense
6020 Internet Expense
6030 Rent Expense
6040 Supplies Expense
6050 Maintenance Expense
6060 Other Expense
```

---

# 29. ACCOUNTING ENGINE

Sistem harus memiliki:

* Chart of Accounts
* Journal Entry
* Journal Lines
* General Ledger
* Expense
* Cash Transaction

Setiap transaksi penting menghasilkan jurnal otomatis.

Kasir tidak perlu membuat jurnal manual.

---

# 30. PROFIT & LOSS

Dashboard keuangan minimal menampilkan:

```text
Revenue
- COGS
----------------
Gross Profit

- Operating Expense
----------------
Net Profit / Loss
```

Contoh:

```text
Revenue                 Rp50.000.000
COGS                    Rp35.000.000
------------------------------------
Gross Profit            Rp15.000.000

Operating Expense        Rp8.000.000
------------------------------------
Net Profit               Rp7.000.000
```

---

# 31. IMPORTANT FINANCIAL DISTINCTION

Sistem harus membedakan:

### Uang milik 6Mart

Contoh:

* pendapatan penjualan
* pendapatan jasa
* cash
* bank
* profit

dengan:

### Uang milik santri

Contoh:

* Student Wallet Balance
* dana titipan santri

Student Wallet harus tampil sebagai:

**LIABILITY**

dalam sistem akuntansi.

---

# 32. DASHBOARD

Dashboard utama menampilkan:

### Operational

* Sales Today
* Transactions Today
* Active Cashiers
* Low Stock
* Wallet Transactions

### Financial

* Revenue
* COGS
* Gross Profit
* Operating Expense
* Net Profit/Loss
* Cash
* Bank
* Inventory Value
* Student Wallet Liability

### Alert

* Low stock
* Failed transaction
* Cash discrepancy
* Wallet issue
* Pending transaction

---

# 33. REPORTS

V1.0 minimal memiliki:

## Sales Report

* daily
* weekly
* monthly
* by cashier
* by product
* by payment method

## Inventory Report

* stock
* stock movement
* low stock
* inventory value

## Wallet Report

* top up
* purchase
* withdrawal
* refund
* balance

## Financial Report

* Profit & Loss
* Revenue
* COGS
* Expense
* Cash
* Bank
* Wallet Liability

## Cashier Report

* shift
* cash sales
* expected cash
* actual cash
* difference

---

# 34. AUDIT LOG

Semua aktivitas penting harus dicatat.

Contoh:

```text
LOGIN
CREATE_PRODUCT
UPDATE_PRODUCT
DELETE_PRODUCT
CREATE_SALE
REFUND
TOPUP
WITHDRAWAL
ADJUST_WALLET
ADJUST_STOCK
OPEN_SHIFT
CLOSE_SHIFT
CREATE_EXPENSE
UPDATE_USER
```

Audit log:

```text
audit_id
user_id
action
entity_type
entity_id
old_value
new_value
ip_address
created_at
```

---

# 35. DATABASE

Database harus relational.

Gunakan database abstraction agar aplikasi tidak terkunci pada satu provider.

Target utama:

**Cloudflare D1 / SQL**

Namun jika Freebuff membutuhkan database provider lain untuk V1 development, gunakan abstraction layer.

Jangan menjadikan:

**localStorage**

sebagai database utama.

---

# 36. CORE TABLES

Minimal database harus memiliki tabel:

```text
users
roles
permissions

students
parents
parent_students
student_cards

wallets
wallet_ledger
wallet_limits

products
categories
suppliers
inventory
inventory_movements

sales
sale_items
payments
refunds

cashier_shifts
cash_transactions

chart_of_accounts
journal_entries
journal_lines
expenses

notifications
audit_logs
settings
```

---

# 37. API

Gunakan API-first architecture.

Base:

```text
/api/v1/
```

Contoh:

```text
/api/v1/auth
/api/v1/users
/api/v1/students
/api/v1/products
/api/v1/inventory
/api/v1/sales
/api/v1/payments
/api/v1/wallets
/api/v1/wallets/topup
/api/v1/wallets/withdraw
/api/v1/reports
/api/v1/finance
/api/v1/audit
```

API harus menggunakan:

* authentication
* authorization
* validation
* consistent response format
* error handling

---

# 38. SECURITY

Minimal:

* secure authentication
* password hashing
* RBAC
* server-side validation
* SQL injection protection
* XSS protection
* CSRF protection jika relevan
* secure session
* audit log
* rate limiting jika diperlukan
* idempotency
* transaction protection
* concurrency protection

---

# 39. WALLET CONCURRENCY

Wallet sangat sensitif.

Contoh:

Saldo:

```text
Rp100.000
```

Dua transaksi masuk bersamaan:

```text
Transaction A = Rp70.000
Transaction B = Rp50.000
```

Sistem tidak boleh membuat saldo:

```text
-Rp20.000
```

atau melakukan double spending.

Gunakan database transaction/locking strategy yang sesuai dengan database yang digunakan.

---

# 40. MONEY STORAGE

Jangan menggunakan JavaScript floating point untuk menghitung uang.

Gunakan:

* integer dalam satuan rupiah terkecil, atau
* tipe decimal/database numeric yang aman.

Contoh:

```text
50000
```

berarti:

**Rp50.000**

---

# 41. TRANSACTION ID

Setiap transaksi harus memiliki ID unik.

Contoh:

```text
SAL-20260927-000001
WLT-20260927-000001
TOP-20260927-000001
WDR-20260927-000001
```

Format boleh disesuaikan implementasi.

---

# 42. ERROR HANDLING

Jika transaksi gagal:

* jangan mengurangi saldo
* jangan mengurangi inventory
* jangan membuat jurnal setengah jadi
* jangan membuat transaksi palsu

Transaksi harus:

**SUCCESS atau FAILED**

secara konsisten.

---

# 43. TRANSACTION ATOMICITY

Untuk pembelian wallet:

```text
Create Sale
+
Create Sale Items
+
Debit Wallet
+
Create Wallet Ledger
+
Reduce Inventory
+
Create Accounting Journal
```

harus diproses secara atomic sesuai kemampuan database.

Jika proses gagal:

jangan meninggalkan data keuangan yang setengah selesai.

---

# 44. V1.0 DEVELOPMENT PHASES

## Phase 1 — Foundation

* project setup
* authentication
* database
* RBAC
* layout
* navigation

## Phase 2 — Master Data

* users
* students
* products
* categories
* suppliers
* RFID
* QR

## Phase 3 — POS

* cart
* barcode
* checkout
* cashier
* payment
* receipt
* cashier shift

## Phase 4 — Wallet

* wallet
* ledger
* top up
* purchase
* withdrawal
* refund

## Phase 5 — Inventory

* stock
* purchase
* stock movement
* COGS
* weighted average cost

## Phase 6 — Accounting

* COA
* journal
* ledger
* expense
* P&L

## Phase 7 — Dashboard

* operational dashboard
* financial dashboard
* reports

## Phase 8 — Security

* RBAC review
* audit log
* concurrency
* idempotency
* validation

## Phase 9 — Testing

* unit tests
* integration tests
* wallet tests
* accounting tests
* POS tests
* end-to-end tests

## Phase 10 — V1.0 Release

* seed data
* demo account
* production configuration
* deployment
* final QA

---

# 45. V1.1 ROADMAP

Setelah V1.0 stabil:

### Parent Portal

Parent dapat melihat:

* saldo anak
* top up
* transaksi
* pembelian
* withdrawal
* histori saldo

### Virtual Account

Arsitektur disiapkan untuk:

```text
Parent
 ↓
Bank / Payment Provider
 ↓
Virtual Account
 ↓
Webhook
 ↓
6Mart
 ↓
Wallet
```

---

# 46. V1.2 ROADMAP

Tambahkan:

## Laundry

* laundry order
* item
* price
* status
* pickup
* payment
* report

## Barbershop

* service
* booking
* queue
* payment
* report

## Jastip

* order
* item
* buyer
* price
* service fee
* delivery
* payment

---

# 47. V1.3 ROADMAP

Tambahkan:

## PPOB

* pulsa
* PLN token
* digital products
* provider abstraction
* transaction status
* callback/webhook
* failed transaction handling

---

# 48. FUTURE INTEGRATION

6Mart harus dapat terhubung dengan:

**PIAT 6 Super App**

Arsitektur:

```text
┌─────────────────────────┐
│   PIAT 6 SUPER APP      │
│                         │
│ Student Master Data     │
│ Parent Data             │
│ Academic                │
│ Kepengasuhan            │
└───────────┬─────────────┘
            │
            │ API
            │
┌───────────▼─────────────┐
│          6MART          │
│                         │
│ POS                     │
│ Wallet                  │
│ Inventory               │
│ Accounting              │
│ Services                │
└─────────────────────────┘
```

6Mart tetap menjadi aplikasi mandiri.

Jangan membuat 6Mart bergantung langsung pada database internal PIAT 6 Super App.

Gunakan API/integration layer.

---

# 49. DATA OWNERSHIP

6Mart memiliki data operasional:

* sales
* wallet transactions
* inventory
* cashier
* accounting
* services

PIAT 6 Super App dapat menjadi sumber master data santri pada tahap integrasi berikutnya.

Namun V1.0 harus tetap dapat berjalan secara standalone.

---

# 50. DEMO / SEED DATA

Development environment harus mempunyai data contoh.

Minimal:

### Users

```text
admin
manager
cashier
finance
inventory
```

### Students

Minimal 10 santri.

### Products

Minimal 20 produk.

### Wallet

Beberapa santri memiliki saldo.

### Sales

Beberapa transaksi contoh.

### Inventory

Beberapa produk memiliki stok rendah.

### Accounting

Beberapa transaksi memiliki jurnal.

---

# 51. DEMO SCENARIO

Aplikasi harus dapat mendemonstrasikan:

### Scenario 1

Admin login.

### Scenario 2

Tambah santri.

### Scenario 3

Buat wallet santri.

### Scenario 4

Top up Rp100.000.

### Scenario 5

Hubungkan RFID.

### Scenario 6

Kasir scan barang.

### Scenario 7

Santri tap RFID.

### Scenario 8

Sistem mengecek saldo.

### Scenario 9

Wallet terdebit.

### Scenario 10

Inventory berkurang.

### Scenario 11

Jurnal otomatis dibuat.

### Scenario 12

Dashboard berubah.

### Scenario 13

Laporan laba/rugi berubah.

Semua harus dapat ditelusuri.

---

# 52. FAST CHECKOUT PERFORMANCE

Karena masalah utama 6Mart adalah antrean kasir, sistem harus dirancang untuk checkout cepat.

Target desain:

```text
Scan Product
↓
Add Cart
↓
RFID / QR
↓
Wallet Check
↓
Debit
↓
Success
```

Target normal:

**sekitar 2–5 detik**

Namun angka aktual harus diuji dengan hardware RFID, network, database dan kondisi operasional nyata.

Sistem harus menyediakan dasar untuk mengukur:

* checkout duration
* payment duration
* wallet lookup duration
* failed payment
* queue duration

---

# 53. NOTIFICATION

V1.0 minimal menyediakan notification framework.

Contoh:

* saldo tidak cukup
* top up berhasil
* pembelian berhasil
* withdrawal berhasil
* stok menipis
* transaksi gagal

Parent notification dikembangkan lebih lanjut pada V1.1.

---

# 54. SETTINGS

Pengaturan minimal:

```text
Store Name
Store Address
Currency
Receipt Header
Receipt Footer
Low Stock Threshold
Wallet Minimum Balance
Withdrawal Enabled
RFID Enabled
QR Enabled
Cash Payment Enabled
```

---

# 55. RECEIPT

Struk transaksi minimal:

```text
6MART
--------------------
Invoice: SAL-XXXX
Date: XX/XX/XXXX
Cashier: XXXX

Product A     10.000
Product B      5.000
--------------------
TOTAL         15.000

Payment: WALLET
Student: XXXXX
Remaining: 85.000

Terima kasih
```

---

# 56. REPORT EXPORT

Siapkan kemampuan export:

* CSV
* Excel
* PDF

Jika belum memungkinkan semuanya pada V1.0, minimal:

**CSV**

harus tersedia untuk data penting.

---

# 57. TESTING

Minimal test:

## Authentication

* login valid
* login invalid
* authorization

## Product

* create
* update
* stock

## POS

* sale
* refund
* payment

## Wallet

* top up
* debit
* withdrawal
* refund
* insufficient balance
* concurrent transaction

## Accounting

* journal creation
* balance
* revenue
* COGS
* P&L

## Inventory

* stock in
* stock out
* COGS

---

# 58. ACCEPTANCE CRITERIA V1.0

V1.0 dianggap berhasil jika:

### Authentication

User dapat login sesuai role.

### POS

Kasir dapat melakukan transaksi.

### RFID

RFID dapat mengidentifikasi santri.

### QR

QR dapat mengidentifikasi santri.

### Wallet

Saldo dapat bertambah dan berkurang melalui ledger.

### Inventory

Stok berkurang ketika barang terjual.

### Accounting

Transaksi menghasilkan jurnal otomatis.

### Profitability

Sistem dapat menampilkan:

* Revenue
* COGS
* Gross Profit
* Expense
* Net Profit/Loss

### Audit

Aktivitas penting tercatat.

### Security

User hanya dapat mengakses fitur sesuai role.

---

# 59. DEVELOPMENT RULE FOR FREEBUFF

Freebuff harus:

1. Membaca dokumen ini sebelum melakukan perubahan besar.
2. Menganggap dokumen ini sebagai source of truth.
3. Tidak menghapus requirement utama.
4. Tidak membuat fitur palsu.
5. Tidak membuat tombol yang tidak berfungsi.
6. Tidak menggunakan localStorage sebagai database utama.
7. Tidak membuat fake authentication.
8. Tidak mengubah saldo wallet tanpa ledger.
9. Tidak menghapus histori transaksi keuangan.
10. Menggunakan migration untuk perubahan database.
11. Membuat test untuk fungsi kritis.
12. Memperbaiki error sebelum melanjutkan.
13. Menjaga backward compatibility jika memungkinkan.
14. Menjaga struktur aplikasi agar dapat dikembangkan ke V1.1–V1.3.

---

# 60. DEVELOPMENT PRIORITY

Jika terdapat keterbatasan waktu atau resource, gunakan urutan prioritas:

```text
1. Authentication
2. Student
3. Product
4. Inventory
5. POS
6. Wallet
7. RFID
8. QR
9. Accounting
10. Reports
11. Audit
12. Dashboard
13. Services
14. PPOB
15. Parent Portal
```

Jangan mengorbankan:

* wallet integrity
* accounting integrity
* security
* transaction consistency

demi menambahkan banyak fitur.

---

# 61. IMPORTANT ARCHITECTURE RULE

Pisahkan:

```text
PAYMENT INSTRUMENT
```

dengan:

```text
WALLET
```

Contoh:

```text
RFID CARD
      ↓
STUDENT
      ↓
WALLET
      ↓
LEDGER
```

QR:

```text
QR
 ↓
STUDENT
 ↓
WALLET
```

NIS:

```text
NIS
 ↓
STUDENT
 ↓
WALLET
```

Semua menggunakan wallet yang sama.

---

# 62. ACCOUNTING PRINCIPLE

Jangan menganggap semua uang yang masuk sebagai revenue.

Contoh:

```text
TOP UP
```

bukan revenue.

Sedangkan:

```text
PURCHASE
```

adalah revenue.

Ini adalah prinsip penting dalam sistem keuangan 6Mart.

---

# 63. FUTURE PAYMENT ARCHITECTURE

Sistem harus dapat dikembangkan dari:

```text
RFID
QR
Cash
```

menjadi:

```text
RFID
QR
NFC
Mobile App
Virtual Account
Payment Gateway
```

tanpa mengubah konsep wallet.

---

# 64. FUTURE HARDWARE

Sistem harus memungkinkan integrasi dengan:

* RFID Reader 125 kHz
* Barcode Scanner
* Receipt Printer
* Cash Drawer
* QR Scanner
* POS Computer
* Android Device

Hardware integration harus menggunakan abstraction layer jika diperlukan.

---

# 65. NON-FUNCTIONAL REQUIREMENTS

Aplikasi harus:

* responsive
* cepat
* reliable
* maintainable
* secure
* auditable
* scalable

Database transaction harus digunakan untuk transaksi finansial kritis.

---

# 66. OBSERVABILITY

Siapkan dasar monitoring:

```text
Error logs
Transaction logs
Audit logs
Performance logs
```

Terutama:

* failed wallet transaction
* failed payment
* database error
* API error
* duplicate transaction
* stock mismatch

---

# 67. BACKUP & RECOVERY

Data keuangan dan wallet merupakan data kritis.

Sistem harus dirancang agar dapat:

* backup database
* restore database
* recover transaction data

Jangan mengandalkan browser/device sebagai penyimpanan utama.

---

# 68. DOCUMENTATION

Dokumentasi lanjutan akan dibuat setelah V1.0:

```text
docs/
├── MASTER-BLUEPRINT.md
├── BUSINESS-RULES.md
├── DATABASE-DESIGN.md
├── ACCOUNTING-RULES.md
├── WALLET-RULES.md
└── ROADMAP.md
```

Untuk tahap awal, **MASTER-BLUEPRINT.md adalah dokumen utama**.

Dokumen lain dapat dibuat setelah struktur aplikasi V1.0 mulai terbentuk.

---

# 69. VERSION ROADMAP

```text
V1.0
Core POS + Wallet + Inventory + Accounting

        ↓

V1.1
Parent Portal + Virtual Account

        ↓

V1.2
Laundry + Barbershop + Jastip

        ↓

V1.3
PPOB + Operational Analytics

        ↓

V2.0
PIAT 6 Super App Integration
Advanced Mobile / NFC / Self Checkout
```

---

# 70. FINAL BUILD INSTRUCTION

Build this application progressively.

Do not attempt to build every future feature at once.

First make V1.0:

**SIMPLE + WORKING + SAFE + TESTABLE**

The most important operational flow is:

```text
PRODUCT
   ↓
POS
   ↓
STUDENT IDENTIFICATION
   ↓
WALLET
   ↓
DEBIT
   ↓
INVENTORY
   ↓
ACCOUNTING
   ↓
REPORT
```

The most important financial flow is:

```text
TOP UP
   ↓
BANK
   ↓
STUDENT WALLET LIABILITY
```

and:

```text
PURCHASE
   ↓
WALLET DEBIT
   ↓
REVENUE
   ↓
COGS
   ↓
PROFIT
```

The system must maintain a clear distinction between:

**student funds** and **6Mart revenue**.

---

# 71. DEFINITION OF DONE — V1.0

V1.0 is ready for initial operational testing when:

* [ ] Login works
* [ ] RBAC works
* [ ] Student management works
* [ ] RFID registration works
* [ ] QR identification works
* [ ] Product management works
* [ ] Inventory works
* [ ] POS works
* [ ] Cash payment works
* [ ] Wallet payment works
* [ ] Top up works
* [ ] Withdrawal works
* [ ] Refund works
* [ ] Cashier shift works
* [ ] Wallet ledger works
* [ ] Inventory movement works
* [ ] COGS works
* [ ] Accounting journal works
* [ ] Profit & Loss works
* [ ] Dashboard works
* [ ] Reports work
* [ ] Audit log works
* [ ] Critical tests pass
* [ ] No known critical financial bug remains

---

# END OF MASTER BLUEPRINT

**6Mart Retail & Student Wallet System — V1.0**

**Build simple first.
Make it work.
Make it safe.
Then make it bigger.**
