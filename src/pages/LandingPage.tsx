import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Store,
  ScanBarcode,
  Wallet,
  Landmark,
  Boxes,
  ShieldCheck,
  Zap,
  Shirt,
  Scissors,
  Bike,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Users,
  FileBarChart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/label";
import { useAuth } from "@/components/auth/AuthProvider";

const FEATURES = [
  {
    icon: ScanBarcode,
    title: "Kasir Cepat (Fast Checkout)",
    desc: "Scan barcode → tap RFID / scan QR → cek saldo → debit wallet. Selesai, tanpa popup yang tidak perlu.",
    span: "lg:col-span-2",
  },
  {
    icon: Wallet,
    title: "Student Wallet",
    desc: "Setiap santri memiliki satu wallet dengan ledger yang tidak dapat dimanipulasi.",
  },
  {
    icon: Landmark,
    title: "Akuntansi Otomatis",
    desc: "Setiap penjualan, top up, dan penarikan menghasilkan jurnal berpasangan otomatis.",
  },
  {
    icon: Boxes,
    title: "Inventory & HPP",
    desc: "Weighted average cost, movements tercatat, COGS akurat, stok tidak pernah negatif.",
  },
  {
    icon: ShieldCheck,
    title: "RBAC & Audit Log",
    desc: "Sembilan role, izin ditegakkan di server, semua aktivitas penting tercatat.",
  },
  {
    icon: FileBarChart,
    title: "Laporan & Ekspor",
    desc: "Penjualan, wallet, inventory, kasir, dan keuangan. Ekspor CSV.",
  },
];

const SERVICES = [
  { icon: Shirt, label: "Laundry", desc: "Order, status, pembayaran" },
  { icon: Scissors, label: "Barbershop", desc: "Booking & antrean" },
  { icon: Bike, label: "Jastip", desc: "Order & pengiriman" },
  { icon: Zap, label: "PPOB", desc: "Pulsa, PLN, data" },
];

const FLOW = [
  { step: "01", label: "SCAN BARANG", desc: "Barcode reader atau pencarian" },
  { step: "02", label: "TAP RFID / SCAN QR", desc: "Identifikasi santri otomatis" },
  { step: "03", label: "CEK SALDO", desc: "Tampil instan dari wallet" },
  { step: "04", label: "DEBIT + JURNAL", desc: "Stok, wallet, akuntansi sekaligus" },
];

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const appHref = isAuthenticated ? "/app" : "/auth";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight">6Mart</p>
            <p className="text-[11px] leading-tight text-muted-foreground">
              PIAT 6 Bondowoso
            </p>
          </div>

          <nav className="ml-auto hidden items-center gap-6 md:flex">
            <a href="#fitur" className="text-sm text-muted-foreground hover:text-foreground">
              Fitur
            </a>
            <a href="#alur" className="text-sm text-muted-foreground hover:text-foreground">
              Alur Kasir
            </a>
            <a href="#layanan" className="text-sm text-muted-foreground hover:text-foreground">
              Layanan
            </a>
          </nav>

          <Button asChild size="sm" className="ml-auto md:ml-0">
            <Link to={appHref}>
              {isAuthenticated ? "Buka Dashboard" : "Masuk"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="sixmart-grid absolute inset-0" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute -left-20 top-40 h-64 w-64 rounded-full bg-primary/15 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl"
          >
            <Badge variant="secondary" className="mb-5 gap-1.5 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Retail & Student Wallet System
            </Badge>

            <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight md:text-6xl">
              Kasir cepat.
              <br />
              <span className="bg-gradient-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
                Uang selalu tercatat
              </span>.
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              6Mart menyatukan Point of Sale, Student Wallet berbasis RFID, inventory, dan
              akuntansi dalam satu sistem untuk PIAT 6 Bondowoso. Setiap rupiah tercatat —
              dari top up wali sampai HPP penjualan.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="xl">
                <Link to={appHref}>
                  {isAuthenticated ? "Lanjut ke Dashboard" : "Coba Sekarang"}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button asChild size="xl" variant="outline">
                <Link to="/info">Akun Demo & Fitur</Link>
              </Button>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" /> 9 role dengan RBAC
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" /> Wallet ledger-only
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-success" /> Jurnal otomatis
              </span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-border bg-card/50">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-4 md:grid-cols-4">
          {[
            { value: "4", label: "Modul Inti Terintegrasi" },
            { value: "100%", label: "Transaksi Terjurnal" },
            { value: "0", label: "Saldo Diubah Tanpa Ledger" },
            { value: "9", label: "Role & Permission" },
          ].map((s) => (
            <div key={s.label} className="px-4 py-6 text-center">
              <p className="text-3xl font-extrabold text-primary">{s.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Flow */}
      <section id="alur" className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="mb-10 text-center">
          <Badge variant="muted" className="mb-3">
            <TrendingUp className="h-3.5 w-3.5" /> Fast Checkout
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Empat langkah, selesai
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Prinsip: klik lebih banyak, mengetik lebih sedikit. Kasir tidak perlu membuat
            jurnal, mengurangi stok, atau menghitung kembalian secara manual.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {FLOW.map((f, i) => (
            <motion.div
              key={f.step}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="relative rounded-lg border border-border bg-card p-5"
            >
              <span className="text-3xl font-extrabold text-primary/20">{f.step}</span>
              <p className="mt-1 text-sm font-bold">{f.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
              {i < FLOW.length - 1 && (
                <ArrowRight className="absolute -right-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-muted-foreground/40 md:block" />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="fitur" className="border-y border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="mb-10 max-w-2xl">
            <Badge variant="muted" className="mb-3">
              Fitur
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Sistem lengkap, bukan mockup
            </h2>
            <p className="mt-3 text-muted-foreground">
              Setiap tombol menyimpan data nyata, setiap transaksi menghasilkan jurnal, dan
              setiap perubahan saldo traced ke ledger.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.06 }}
                className={`rounded-lg border border-border bg-card p-5 transition-shadow hover:shadow-md ${f.span ?? ""}`}
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Accounting principle */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="grid items-center gap-8 md:grid-cols-2">
          <div>
            <Badge variant="warning" className="mb-3">
              Aturan Keuangan
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight">
              Top up <span className="text-destructive">bukan</span> pendapatan
            </h2>
            <p className="mt-3 text-muted-foreground">
              Uang yang dikirim wali adalah dana titipan santri — bukan pendapatan 6Mart.
              Sistem menjaga pemisahan ini secara otomatis di jurnal.
            </p>
            <ul className="mt-5 space-y-2.5">
              {[
                "Top up → Kas/Bank vs Kewajiban Wallet (bukan pendapatan)",
                "Pembelian → Pendapatan Retail + HPP",
                "Penarikan → Kewajiban Wallet vs Kas",
                "Saldo wali dan laba 6Mart tidak pernah tercampur",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 font-mono text-sm shadow-sm">
            <p className="mb-2 text-xs text-muted-foreground">Top up Rp500.000</p>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold">DR Bank</span>
                <span className="tabular-nums">500.000</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">CR Student Wallet Liability</span>
                <span className="tabular-nums">500.000</span>
              </div>
            </div>
            <div className="my-4 border-t border-border" />
            <p className="mb-2 text-xs text-muted-foreground">Pembelian Rp20.000 (HPP 12.000)</p>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="font-semibold">DR Student Wallet Liability</span>
                <span className="tabular-nums">20.000</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">CR Retail Sales Revenue</span>
                <span className="tabular-nums">20.000</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">DR COGS</span>
                <span className="tabular-nums">12.000</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold">CR Inventory</span>
                <span className="tabular-nums">12.000</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="layanan" className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-20">
          <div className="mb-10 text-center">
            <Badge variant="muted" className="mb-3">
              Layanan
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Lebih dari sekadar toko
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Semua layanan terhubung ke wallet, penjualan, dan akuntansi yang sama.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICES.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-border bg-card p-5 text-center transition-shadow hover:shadow-md"
              >
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-accent/15 text-accent">
                  <s.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold">{s.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-12 text-center text-primary-foreground md:px-12">
          <div className="sixmart-grid absolute inset-0 opacity-20" />
          <div className="relative">
            <Users className="mx-auto mb-4 h-10 w-10" />
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Siap mencoba 6Mart?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-primary-foreground/80">
              Masuk dengan akun demo, atau hubungi Super Admin untuk akun staff Anda. Data
              demo ditandai jelas dan tidak memengaruhi data produksi.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button asChild size="xl" variant="secondary">
                <Link to={appHref}>
                  {isAuthenticated ? "Dashboard" : "Masuk ke Aplikasi"}
                  <ArrowRight className="h-5 w-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="xl"
                variant="outline"
                className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
              >
                <Link to="/info">Lihat Akun Demo</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            <span>6Mart Retail & Student Wallet System</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/info" className="hover:text-foreground">
              Info Development
            </Link>
            <span>PIAT 6 Bondowoso</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
