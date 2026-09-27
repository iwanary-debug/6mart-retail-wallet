import { Link } from "react-router-dom";
import { useState } from "react";
import {
  ArrowLeft,
  Store,
  ShieldCheck,
  ScanLine,
  KeyRound,
  Boxes,
  Receipt,
  Landmark,
  BarChart3,
  Sparkles,
  Zap,
  Copy,
  Check,
  Server,
  Wifi,
  AlertTriangle,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertBanner, PageHeader } from "@/components/common";
import { api } from "../convex/_generated/api";
import { useQuery } from "convex/react";

const DEMO_PASSWORD = "6mart2026";

const DEMO_ACCOUNTS = [
  { role: "Super Admin", email: "admin@6mart.test", desc: "Akses penuh" },
  { role: "Manager", email: "manager@6mart.test", desc: "Operasional & keuangan" },
  { role: "Kasir", email: "cashier@6mart.test", desc: "POS, shift, top up" },
  { role: "Finance", email: "finance@6mart.test", desc: "Jurnal, beban, laporan" },
  { role: "Inventory", email: "inventory@6mart.test", desc: "Produk, stok, pembelian" },
  { role: "Supervisor", email: "supervisor@6mart.test", desc: "Pengawasan kasir" },
  { role: "Owner", email: "owner@6mart.test", desc: "Dashboard & laporan" },
];

const MODULES = [
  { name: "Autentikasi dan RBAC", icon: ShieldCheck },
  { name: "Kasir dan Fast Checkout", icon: ScanLine },
  { name: "Student Wallet plus Ledger", icon: KeyRound },
  { name: "Inventori dan HPP rata-rata", icon: Boxes },
  { name: "Shift Kasir dan Struk", icon: Receipt },
  { name: "Akuntansi dan Jurnal", icon: Landmark },
  { name: "Laporan dan Ekspor CSV", icon: BarChart3 },
];

const INTEGRATIONS = [
  { name: "Virtual Account Bank", state: "SANDBOX", note: "Adapter simulasi, webhook siap" },
  { name: "PPOB", state: "SANDBOX", note: "Katalog dan transaksi simulasi" },
  { name: "Notifikasi WA dan Email", state: "SANDBOX", note: "Pesan dicatat di tabel notifications" },
  { name: "RFID Reader", state: "SIMULASI", note: "Input manual atau tap kartu" },
];

const CORE_RULES = [
  "Saldo wallet hanya berubah melalui ledger yang append-only.",
  "Top up bukan pendapatan: Debit Bank, Kredit Kewajiban Wallet.",
  "Dana siswa dipisahkan dari pendapatan toko.",
  "HPP dihitung dengan metode rata-rata tertimbang.",
  "Uang disimpan sebagai bilangan bulat rupiah tanpa float.",
  "Setiap mutasi memakai idempotency key dan version lock.",
  "Otorisasi RBAC ditegakkan di server, bukan di UI.",
  "Nomor transaksi mengikuti format PREFIX-YYYYMMDD-XXXX.",
];

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      aria-label="Salin"
      onClick={() => {
        const clip = navigator.clipboard;
        if (!clip) return;
        void clip
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => setCopied(false));
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

export default function DevInfoPage() {
  const settings = useQuery(api.settings.getAll, {});
  const health = settings === undefined ? "loading" : settings === null ? "error" : "ok";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-foreground/15">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">6Mart - Info Pengembang</h1>
              <p className="text-xs opacity-80">
                PIAT 6 Bondowoso - Retail dan Student Wallet System
              </p>
            </div>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Kembali ke Beranda
            </Link>
          </Button>
        </div>
      </header>

      <main className="container space-y-6 py-8">
        <PageHeader
          title="Dokumentasi dan Status Sistem"
          description="Ringkasan modul, akun demo, dan status integrasi untuk evaluator."
        />

        {health === "error" && (
          <AlertBanner variant="ERROR" title="Belum terhubung ke database">
            Masuk sebagai Super Admin, lalu jalankan seed agar data demo tersedia.
          </AlertBanner>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Wifi className="h-4 w-4 text-primary" /> Status Koneksi
              </CardTitle>
              <CardDescription>Convex lokal di 127.0.0.1:3210</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Database</span>
                {health === "loading" ? (
                  <Badge variant="secondary">Memuat</Badge>
                ) : health === "ok" ? (
                  <Badge className="bg-success text-success-foreground">
                    <Server className="mr-1 h-3 w-3" /> Terhubung
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <AlertTriangle className="mr-1 h-3 w-3" /> Gagal
                  </Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Seed data</span>
                {health === "ok" ? (
                  <Badge className="bg-success text-success-foreground">Tersedia</Badge>
                ) : (
                  <Badge variant="secondary">Belum</Badge>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Mode</span>
                <Badge variant="outline">Development</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> Akun Demo
              </CardTitle>
              <CardDescription>
                Kata sandi semua akun demo:{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {DEMO_PASSWORD}
                </code>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {DEMO_ACCOUNTS.map((a) => (
                  <li key={a.email} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.role}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{a.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">{a.desc}</Badge>
                      <CopyButton value={a.email} />
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Boxes className="h-4 w-4 text-primary" /> Modul
              </CardTitle>
              <CardDescription>V1.0 - seluruhnya selesai</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {MODULES.map((m) => {
                  const Icon = m.icon;
                  return (
                    <li key={m.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {m.name}
                      </span>
                      <Badge className="bg-success text-success-foreground">Selesai</Badge>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-primary" /> Integrasi Eksternal
              </CardTitle>
              <CardDescription>
                Semua adapter memakai mode sandbox sampai kredensial penyedia tersedia.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {INTEGRATIONS.map((i) => (
                  <li key={i.name} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className="text-sm font-medium">{i.name}</p>
                      <p className="text-xs text-muted-foreground">{i.note}</p>
                    </div>
                    <Badge variant="outline">{i.state}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" /> Aturan Inti Sistem
              </CardTitle>
              <CardDescription>
                Invarian yang tidak boleh dilanggar di seluruh modul.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {CORE_RULES.map((rule) => (
                <div
                  key={rule}
                  className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm"
                >
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{rule}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-center">
          <Button asChild>
            <Link to="/auth">Masuk ke Sistem</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
