import { Link } from "react-router-dom";
import { useQuery } from "convex/react";
import {
  TrendingUp,
  Receipt,
  Users,
  Wallet,
  Banknote,
  ArrowUpRight,
  Boxes,
  Landmark,
  Scale,
  PiggyBank,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  PageHeader,
  StatCard,
  LoadingState,
  ErrorState,
  AlertBanner,
  EmptyState,
  formatTime,
  timeAgo,
} from "@/components/common";
import { Money } from "@/components/common";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/rbac";
import { formatNumber } from "@/lib/money";

export default function DashboardPage() {
  const { profile, can } = useAuth();
  const canSeeFinancial = can(PERMISSIONS.DASHBOARD_FINANCIAL);

  const ops = useQuery(api.dashboard.operational, {});

  // Query keuangan HANYA dijalankan bila role memang berhak. Backend
  // menjatuhkan ForbiddenError untuk role lain, jadi memanggilnya tanpa
  // mengecek izin membuat halaman ini gagal total untuk Kasir, Inventory,
  // dan Supervisor — meski halaman ini sudah menyembunyikan blok tersebut.
  const fin = useQuery(
    api.dashboard.financial,
    canSeeFinancial ? {} : "skip",
  );

  if (ops === undefined) return <LoadingState />;
  if ("error" in ops) return <ErrorState message={String((ops as { error: string }).error)} />;

  const o = ops as Exclude<typeof ops, undefined | { error: unknown }>;
  const f = canSeeFinancial
    ? (fin as Exclude<typeof fin, undefined | { error: unknown }>)
    : undefined;
  const maxTrend = Math.max(...o.trend.map((t) => t.revenue), 1);

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumb="6Mart"
        title={`Selamat ${greeting()}, ${profile?.name?.split(" ")[0] ?? "Pengguna"}`}
        description="Ringkasan operasional dan keuangan 6Mart hari ini."
        action={
          can(PERMISSIONS.SALE_CREATE) ? (
            <Button asChild>
              <Link to="/app/pos">
                <Receipt className="h-4 w-4" /> Buka Kasir
              </Link>
            </Button>
          ) : undefined
        }
      />

      {o.alerts.length > 0 && (
        <div className="space-y-2">
          {o.alerts.slice(0, 4).map((alert, i) => (
            <AlertBanner
              key={i}
              variant={alert.severity}
              title={alert.type.replace(/_/g, " ")}
            >
              {alert.message}
            </AlertBanner>
          ))}
        </div>
      )}

      {/* Operasional */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Penjualan Hari Ini"
          value={<Money value={o.today.revenue} />}
          hint={`${o.today.transactions} transaksi · rata-rata ${formatNumber(o.today.averageTransaction, 0)}`}
          icon={TrendingUp}
          tone="primary"
        />
        <StatCard
          label="Laba Kotor Hari Ini"
          value={<Money value={o.today.revenue - o.today.cogs} />}
          hint={`HPP ${formatNumber(o.today.cogs, 0)}`}
          icon={Banknote}
          tone="success"
        />
        <StatCard
          label="Transaksi Wallet"
          value={String(o.today.walletTransactions)}
          hint={`Volume ${formatNumber(o.today.walletVolume, 0)}`}
          icon={Wallet}
        />
        <StatCard
          label="Kasir Aktif"
          value={String(o.counts.activeCashiers)}
          hint={`${o.counts.lowStock} produk stok menipis`}
          icon={Users}
          tone={o.counts.activeCashiers > 0 ? "default" : "warning"}
        />
      </div>

      {/* Keuangan */}
      {canSeeFinancial && f && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Pendapatan Bulan Ini"
              value={<Money value={f.month.totalRevenue} short />}
              hint={`${f.month.journalCount} jurnal posted`}
              icon={Landmark}
              tone="primary"
            />
            <StatCard
              label="HPP Bulan Ini"
              value={<Money value={f.month.totalCogs} short />}
              hint="Weighted average cost"
              icon={Boxes}
            />
            <StatCard
              label="Laba Bersih Bulan Ini"
              value={<Money value={f.month.netProfit} short />}
              hint={f.month.isProfit ? "Untung" : "Rugi"}
              icon={Scale}
              tone={f.month.isProfit ? "success" : "destructive"}
            />
            <StatCard
              label="Kewajiban Wallet"
              value={<Money value={f.position.studentWalletLiability} short />}
              hint="Dana titipan santri (bukan pendapatan)"
              icon={PiggyBank}
              tone="warning"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Posisi Keuangan
                <Badge variant={f.trialBalanceBalanced ? "success" : "destructive"}>
                  {f.trialBalanceBalanced ? "Balance" : "Tidak Balance"}
                </Badge>
              </CardTitle>
              <CardDescription>
                Neraca saldo dari seluruh jurnal yang telah diposting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  { label: "Kas", value: f.position.cash },
                  { label: "Bank", value: f.position.bank },
                  { label: "Nilai Persediaan", value: f.position.inventoryValue },
                  { label: "Kewajiban Wallet", value: f.position.studentWalletLiability },
                  { label: "Hutang Supplier", value: f.position.supplierPayable },
                ].map((p) => (
                  <div key={p.label} className="rounded-lg border border-border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">{p.label}</p>
                    <p className="mt-1 font-semibold tabular-nums">
                      <Money value={p.value} short />
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tren */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Penjualan 7 Hari Terakhir</CardTitle>
            <CardDescription>Total penjualan per hari (tunai + wallet)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-2">
              {o.trend.map((t) => (
                <div key={t.date} className="group flex flex-1 flex-col items-center gap-1.5">
                  <div className="relative flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t-md bg-primary/80 transition-all hover:bg-primary"
                      style={{ height: `${Math.max((t.revenue / maxTrend) * 100, 2)}%` }}
                    />
                    <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] font-medium text-background shadow group-hover:block">
                      {formatNumber(t.revenue, 0)} · {t.transactions} trx
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(t.date).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Master data */}
        <Card>
          <CardHeader>
            <CardTitle>Data Master</CardTitle>
            <CardDescription>Jumlah data aktif di sistem</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {[
              { label: "Santri aktif", value: o.counts.students, to: "/app/santri" },
              { label: "Produk aktif", value: o.counts.products, to: "/app/produk" },
              { label: "Wallet", value: o.counts.wallets, to: "/app/wallet" },
              { label: "Stok menipis", value: o.counts.lowStock, to: "/app/inventori", warn: true },
              { label: "Stok habis", value: o.counts.outOfStock, to: "/app/inventori", warn: true },
            ].map((row) => (
              <Link
                key={row.label}
                to={row.to}
                className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted"
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className="flex items-center gap-2 font-semibold tabular-nums">
                  {row.value}
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Shift terbuka */}
      {o.openShifts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Shift Kasir Terbuka</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {o.openShifts.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{s.cashier}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.code} · dibuka {timeAgo(s.openedAt)}
                  </p>
                </div>
                <p className="font-semibold tabular-nums">
                  Penjualan tunai: <Money value={s.cashSales} />
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Transaksi terbaru */}
      <Card>
        <CardHeader>
          <CardTitle>Transaksi Terbaru</CardTitle>
          <CardDescription>Penjualan hari ini</CardDescription>
        </CardHeader>
        <CardContent>
          {o.recentSales.length === 0 ? (
            <EmptyState
              title="Belum ada transaksi hari ini"
              description="Transaksi penjualan akan muncul di sini setelah kasir membuka shift dan memulai penjualan."
              icon={Receipt}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Santri</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {o.recentSales.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-muted-foreground">{formatTime(s.time)}</TableCell>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell>{s.student}</TableCell>
                    <TableCell>
                      <Badge variant={s.method === "WALLET" ? "secondary" : "muted"}>
                        {s.method === "WALLET" ? "Wallet" : s.method === "CASH" ? "Tunai" : "Campuran"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      <Money value={s.total} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "pagi";
  if (h < 15) return "siang";
  if (h < 18) return "sore";
  return "malam";
}
