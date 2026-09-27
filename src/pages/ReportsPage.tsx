import { useState } from "react";
import { useQuery } from "convex/react";
import { Download, FileBarChart, Wallet, Boxes, Banknote, Receipt } from "lucide-react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  PageHeader,
  StatCard,
  LoadingState,
  ErrorState,
  EmptyState,
  formatDateTime,
  downloadCsv,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PERMISSIONS } from "@/lib/rbac";
import { formatNumber } from "@/lib/money";

const PERIODS = [
  { key: "today", label: "Hari Ini" },
  { key: "week", label: "7 Hari" },
  { key: "month", label: "30 Hari" },
  { key: "quarter", label: "90 Hari" },
];

type Dataset = "sales" | "inventory" | "wallet" | "cashier" | "expenses";

export default function ReportsPage() {
  const { can } = useAuth();
  const [period, setPeriod] = useState("month");
  const [dataset, setDataset] = useState<Dataset>("sales");

  const from = useMemoFrom(period);
  const to = Date.now();

  // Halaman ini dipagari `report.view`, tetapi tiap tab butuh izin yang
  // berbeda. Query yang tidak di-skip akan melempar ForbiddenError dari
  // backend dan menggagalkan seluruh halaman, bukan hanya tab-nya.
  //
  // Catatan: pada convex 1.46, `skip` adalah NILAI pada posisi args
  // (mis. `useQuery(ref, "skip")`), bukan field di dalam objek args.
  const canInventory = can(PERMISSIONS.INVENTORY_VIEW);
  const canWallet = can(PERMISSIONS.WALLET_VIEW);
  const canFinancial = can(PERMISSIONS.REPORT_FINANCIAL);

  const sales = useQuery(api.reports.salesReport, { period });
  const inventory = useQuery(
    api.reports.inventoryReport,
    canInventory ? {} : "skip",
  );
  const wallet = useQuery(api.reports.walletReport, canWallet ? {} : "skip");
  const cashier = useQuery(api.reports.cashierReport, {});
  const financial = useQuery(
    api.reports.financialReport,
    canFinancial ? {} : "skip",
  );
  const csv = useQuery(api.reports.exportCsv, { dataset, from, to });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laporan"
        description="Laporan penjualan, inventory, wallet, kasir, dan keuangan. Ekspor CSV untuk analisis lebih lanjut."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
              value={dataset}
              onChange={(e) => setDataset(e.target.value as Dataset)}
            >
              <option value="sales">Data: Penjualan</option>
              <option value="wallet">Data: Mutasi Wallet</option>
              <option value="inventory">Data: Persediaan</option>
              <option value="cashier">Data: Shift Kasir</option>
              <option value="expenses">Data: Beban</option>
            </select>
            {csv !== undefined && (
              <Button
                onClick={() => downloadCsv(`laporan-${dataset}.csv`, csv)}
              >
                <Download className="h-4 w-4" /> Ekspor CSV
              </Button>
            )}
          </div>
        }
      />

      <Tabs defaultValue="penjualan">
        <TabsList>
          <TabsTrigger value="penjualan">
            <Receipt className="h-4 w-4" /> Penjualan
          </TabsTrigger>
          {canInventory && (
            <TabsTrigger value="inventory">
              <Boxes className="h-4 w-4" /> Inventory
            </TabsTrigger>
          )}
          {canWallet && (
            <TabsTrigger value="wallet">
              <Wallet className="h-4 w-4" /> Wallet
            </TabsTrigger>
          )}
          <TabsTrigger value="kasir">
            <Banknote className="h-4 w-4" /> Kasir
          </TabsTrigger>
          {canFinancial && (
            <TabsTrigger value="keuangan">
              <FileBarChart className="h-4 w-4" /> Keuangan
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="penjualan">
          <div className="mb-3 flex gap-1 rounded-lg bg-muted p-1 sm:w-fit">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === p.key ? "bg-card shadow-sm" : "text-muted-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {sales === undefined ? (
            <LoadingState />
          ) : "error" in sales ? (
            <ErrorState message={String(sales.error)} />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard
                  label="Pendapatan"
                  value={formatNumber(sales.summary.revenue, 0)}
                  tone="primary"
                />
                <StatCard label="HPP" value={formatNumber(sales.summary.cogs, 0)} />
                <StatCard
                  label="Laba Kotor"
                  value={formatNumber(sales.summary.grossProfit, 0)}
                  tone="success"
                />
                <StatCard
                  label="Via Wallet"
                  value={formatNumber(sales.summary.walletTotal, 0)}
                />
                <StatCard
                  label="Via Tunai"
                  value={formatNumber(sales.summary.cashTotal, 0)}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Penjualan per Kasir</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Kasir</TableHead>
                          <TableHead className="text-right">Transaksi</TableHead>
                          <TableHead className="text-right">Omzet</TableHead>
                          <TableHead className="text-right">Laba</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sales.byCashier.map((c: any) => (
                          <TableRow key={c.name}>
                            <TableCell className="text-sm">{c.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.count}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(c.total, 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-success">
                              {formatNumber(c.grossProfit, 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Produk Terlaris</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produk</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Omzet</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sales.byProduct.slice(0, 12).map((p: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-sm">{p.name}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(p.qty, 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium">
                              {formatNumber(p.total, 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tren Harian</CardTitle>
                </CardHeader>
                <CardContent>
                  {sales.byDay.length === 0 ? (
                    <EmptyState title="Belum ada data" />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tanggal</TableHead>
                          <TableHead className="text-right">Transaksi</TableHead>
                          <TableHead className="text-right">Pendapatan</TableHead>
                          <TableHead className="text-right">HPP</TableHead>
                          <TableHead className="text-right">Laba Kotor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sales.byDay.map((d: any) => (
                          <TableRow key={d.date}>
                            <TableCell className="text-sm">
                              {new Date(d.date).toLocaleDateString("id-ID", {
                                dateStyle: "medium",
                              })}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{d.count}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(d.revenue, 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatNumber(d.cogs, 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-success">
                              {formatNumber(d.grossProfit, 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {canInventory && (
          <TabsContent value="inventory">
            {inventory === undefined ? (
              <LoadingState />
            ) : "error" in inventory ? (
              <ErrorState message={String(inventory.error)} />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Nilai Persediaan"
                    value={formatNumber(inventory.summary.totalValue, 0)}
                    tone="primary"
                  />
                  <StatCard
                    label="Nilai Jual"
                    value={formatNumber(inventory.summary.totalRetail, 0)}
                  />
                  <StatCard
                    label="Potensi Laba"
                    value={formatNumber(inventory.summary.potentialProfit, 0)}
                    tone="success"
                  />
                  <StatCard
                    label="Perlu Perhatian"
                    value={String(inventory.summary.lowStockCount)}
                    hint={`${inventory.summary.outOfStockCount} habis`}
                    tone="warning"
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Ringkasan pergerakan (bulan ini)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Jenis</TableHead>
                          <TableHead className="text-right">Transaksi</TableHead>
                          <TableHead className="text-right">Total Qty</TableHead>
                          <TableHead className="text-right">Nilai</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventory.movementsByType.map((m: any) => (
                          <TableRow key={m.type}>
                            <TableCell className="text-sm">{m.type}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.count}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(m.qty, 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(m.value, 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        )}

        {canWallet && (
          <TabsContent value="wallet">
            {wallet === undefined ? (
              <LoadingState />
            ) : "error" in wallet ? (
              <ErrorState message={String(wallet.error)} />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Total Kewajiban Wallet"
                    value={formatNumber(wallet.summary.liability, 0)}
                    hint="Dana titipan santri"
                    tone="warning"
                  />
                  <StatCard
                    label="Masuk"
                    value={formatNumber(wallet.summary.totalCredit, 0)}
                    tone="success"
                  />
                  <StatCard
                    label="Keluar"
                    value={formatNumber(wallet.summary.totalDebit, 0)}
                  />
                  <StatCard
                    label="Transaksi"
                    value={String(wallet.summary.transactionCount)}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Saldo Tertinggi</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Santri</TableHead>
                            <TableHead>NIS</TableHead>
                            <TableHead className="text-right">Saldo</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {wallet.topBalances.map((w: any) => (
                            <TableRow key={w.studentId}>
                              <TableCell className="text-sm">{w.name}</TableCell>
                              <TableCell className="font-mono text-xs">{w.nis}</TableCell>
                              <TableCell className="text-right font-semibold tabular-nums text-primary">
                                {formatNumber(w.balance, 0)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Mutasi per Jenis</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Jenis</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {wallet.byType.map((t: any) => (
                            <TableRow key={t.type}>
                              <TableCell className="text-sm">{t.type}</TableCell>
                              <TableCell className="text-right tabular-nums">{t.count}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatNumber(t.total, 0)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>
        )}

        <TabsContent value="kasir">
          {cashier === undefined ? (
            <LoadingState />
          ) : "error" in cashier ? (
            <ErrorState message={String(cashier.error)} />
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Rekap per Kasir</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kasir</TableHead>
                        <TableHead className="text-right">Shift</TableHead>
                        <TableHead className="text-right">Trx</TableHead>
                        <TableHead className="text-right">Tunai</TableHead>
                        <TableHead className="text-right">Wallet</TableHead>
                        <TableHead className="text-right">Penarikan</TableHead>
                        <TableHead className="text-right">Selisih</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashier.byCashier.map((c: any) => (
                        <TableRow key={c.name}>
                          <TableCell className="text-sm font-medium">{c.name}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.shiftCount}</TableCell>
                          <TableCell className="text-right tabular-nums">{c.transactions}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(c.cashSales, 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(c.walletSales, 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(c.withdrawals, 0)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              c.discrepancy !== 0 ? "text-destructive" : ""
                            }`}
                          >
                            {formatNumber(c.discrepancy, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Detail Shift</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kode</TableHead>
                        <TableHead>Kasir</TableHead>
                        <TableHead>Dibuka</TableHead>
                        <TableHead className="text-right">Modal</TableHead>
                        <TableHead className="text-right">Harus</TableHead>
                        <TableHead className="text-right">Aktual</TableHead>
                        <TableHead className="text-right">Selisih</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashier.shifts.map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">{s.code}</TableCell>
                          <TableCell className="text-sm">{s.cashier}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(s.openedAt)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(s.openingCash, 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(s.expectedCash, 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.actualCash === undefined ? "—" : formatNumber(s.actualCash, 0)}
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums font-semibold ${
                              s.difference ? "text-destructive" : "text-success"
                            }`}
                          >
                            {s.difference === undefined ? "—" : formatNumber(s.difference, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {canFinancial && (
          <TabsContent value="keuangan">
            {financial === undefined ? (
              <LoadingState />
            ) : "error" in financial ? (
              <ErrorState message={String(financial.error)} />
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard
                    label="Total Jurnal"
                    value={String(financial.journalSummary.totalEntries)}
                  />
                  <StatCard
                    label="Total Debit"
                    value={formatNumber(financial.journalSummary.totalDebit, 0)}
                    tone="primary"
                  />
                  <StatCard
                    label="Neraca"
                    value={financial.trialBalance.isBalanced ? "Balance" : "Tidak Balance"}
                    tone={financial.trialBalance.isBalanced ? "success" : "destructive"}
                  />
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Posisi Aset & Kewajiban</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Akun</TableHead>
                          <TableHead>Jenis</TableHead>
                          <TableHead className="text-right">Saldo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {financial.positions.map((p: any) => (
                          <TableRow key={p.accountCode}>
                            <TableCell className="font-mono text-xs">{p.accountCode}</TableCell>
                            <TableCell>
                              {p.accountName}{" "}
                              <Badge variant="muted" className="text-[10px]">
                                {p.accountType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">
                              {formatNumber(p.balance, 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            )}
                  </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function useMemoFrom(period: string): number {
  const now = Date.now();
  const day = 86_400_000;
  switch (period) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    case "week":
      return now - 7 * day;
    case "quarter":
      return now - 90 * day;
    default:
      return now - 30 * day;
  }
}
