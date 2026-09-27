import { useState, type ChangeEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Landmark,
  BookOpen,
  Receipt,
  Plus,
  Loader2,
  Scale,
  TrendingUp,
  TrendingDown,
  Wallet,
  Banknote,
  Download,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  PageHeader,
  StatCard,
  LoadingState,
  ErrorState,
  EmptyState,
  errorMessage,
  formatDateTime,
  downloadCsv,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, Badge } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { PERMISSIONS } from "@/lib/rbac";
import { formatNumber } from "@/lib/money";

export default function FinancePage() {
  const { can } = useAuth();
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [glAccount, setGlAccount] = useState("");

  const pl = useQuery(api.finance.profitAndLoss, {});
  const coa = useQuery(api.finance.chartOfAccounts, {});
  const trial = useQuery(api.finance.trialBalance, {});
  const journals = useQuery(api.finance.listJournals, { limit: 100 });
  const expenses = useQuery(api.finance.listExpenses, { limit: 100 });
  const cash = useQuery(api.finance.cashSummary, {});
  // Ekspor CSV butuh `report.view`, sedangkan halaman ini digateway
  // `finance.view`. `skip` pada convex 1.46 adalah NILAI di posisi args,
  // bukan field di dalam args.
  const canReport = can(PERMISSIONS.REPORT_VIEW);
  const expenseCsv = useQuery(
    api.reports.exportCsv,
    canReport
      ? {
          dataset: "expenses" as const,
          from: Date.now() - 30 * 86_400_000,
          to: Date.now(),
        }
      : "skip",
  );

  const createExpense = useMutation(api.finance.createExpense);

  if (pl === undefined) return <LoadingState label="Memuat data keuangan…" />;
  if ("error" in pl) return <ErrorState message={String(pl.error)} />;

  const p = pl as any;
  const t = trial && !("error" in trial) ? (trial as any) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Keuangan"
        description="Laporan laba/rugi, jurnal otomatis, chart of accounts, dan beban operasional."
        action={
          can(PERMISSIONS.FINANCE_EXPENSE) && (
            <Button onClick={() => setExpenseOpen(true)}>
              <Plus className="h-4 w-4" /> Catat Beban
            </Button>
          )
        }
      />

      {/* P&L */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pendapatan"
          value={formatNumber(p.totalRevenue, 0)}
          icon={TrendingUp}
          tone="primary"
        />
        <StatCard label="HPP" value={formatNumber(p.totalCogs, 0)} icon={TrendingDown} />
        <StatCard
          label="Laba Kotor"
          value={formatNumber(p.grossProfit, 0)}
          hint={`${p.journalCount} jurnal posted`}
          icon={Scale}
          tone="success"
        />
        <StatCard
          label="Laba Bersih"
          value={formatNumber(p.netProfit, 0)}
          hint={p.isProfit ? "Untung" : "Rugi"}
          icon={p.isProfit ? TrendingUp : TrendingDown}
          tone={p.isProfit ? "success" : "destructive"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* P&L detail */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Laporan Laba Rugi (Bulan Berjalan)</CardTitle>
            <CardDescription>
              Dihitung otomatis dari jurnal — pendapatan dan beban diakui saat transaksi terjadi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Pendapatan
              </p>
              <div className="space-y-1">
                {p.revenueBreakdown
                  .filter((r: any) => r.amount !== 0)
                  .map((r: any) => (
                    <div key={r.code} className="flex justify-between text-sm">
                      <span>{r.name}</span>
                      <span className="tabular-nums">{formatNumber(r.amount, 0)}</span>
                    </div>
                  ))}
                <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
                  <span>Total Pendapatan</span>
                  <span className="tabular-nums text-primary">
                    {formatNumber(p.totalRevenue, 0)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                HPP
              </p>
              <div className="space-y-1">
                {p.cogsBreakdown
                  .filter((r: any) => r.amount !== 0)
                  .map((r: any) => (
                    <div key={r.code} className="flex justify-between text-sm">
                      <span>{r.name}</span>
                      <span className="tabular-nums">{formatNumber(r.amount, 0)}</span>
                    </div>
                  ))}
                <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
                  <span>Total HPP</span>
                  <span className="tabular-nums">{formatNumber(p.totalCogs, 0)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 p-3">
              <div className="flex justify-between text-base font-bold">
                <span>Laba Kotor</span>
                <span className="tabular-nums text-success">
                  {formatNumber(p.grossProfit, 0)}
                </span>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Beban Operasional
              </p>
              <div className="space-y-1">
                {p.expenseBreakdown.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Belum ada beban tercatat.</p>
                ) : (
                  p.expenseBreakdown.map((e: any) => (
                    <div key={e.code} className="flex justify-between text-sm">
                      <span>{e.name}</span>
                      <span className="tabular-nums">{formatNumber(e.amount, 0)}</span>
                    </div>
                  ))
                )}
                <div className="flex justify-between border-t border-border pt-1 text-sm font-semibold">
                  <span>Total Beban</span>
                  <span className="tabular-nums">{formatNumber(p.totalOperatingExpense, 0)}</span>
                </div>
              </div>
            </div>

            <div
              className={`rounded-lg p-3 ${p.isProfit ? "bg-success/10" : "bg-destructive/10"}`}
            >
              <div className="flex justify-between text-base font-bold">
                <span>{p.isProfit ? "Laba Bersih" : "Rugi Bersih"}</span>
                <span className={`tabular-nums ${p.isProfit ? "text-success" : "text-destructive"}`}>
                  {formatNumber(p.netProfit, 0)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Posisi */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Posisi Saldo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Kas", value: p.balances.cash, icon: Banknote },
                { label: "Bank", value: p.balances.bank, icon: Landmark },
                { label: "Nilai Persediaan", value: p.balances.inventory, icon: Scale },
                {
                  label: "Kewajiban Wallet",
                  value: p.balances.studentWalletLiability,
                  icon: Wallet,
                  warn: true,
                },
                {
                  label: "Hutang Supplier",
                  value: p.balances.supplierPayable,
                  icon: Landmark,
                },
              ].map((r) => (
                <div
                  key={r.label}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <r.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {r.label}
                  </span>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      r.warn ? "text-warning" : ""
                    }`}
                  >
                    {formatNumber(r.value, 0)}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {cash && !("error" in cash) ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Arus Kas (Bulan Ini)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kas masuk</span>
                  <span className="tabular-nums text-success">
                    {formatNumber((cash as any).cashIn, 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Kas keluar</span>
                  <span className="tabular-nums text-destructive">
                    {formatNumber((cash as any).cashOut, 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Penjualan tunai</span>
                  <span className="tabular-nums">
                    {formatNumber((cash as any).cashSales, 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Penarikan wali</span>
                  <span className="tabular-nums">
                    {formatNumber((cash as any).withdrawalsPaid, 0)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-border pt-1.5">
                  <span className="text-muted-foreground">Selisih kas</span>
                  <span
                    className={`tabular-nums font-semibold ${
                      (cash as any).totalDiscrepancy !== 0 ? "text-warning" : ""
                    }`}
                  >
                    {formatNumber((cash as any).totalDiscrepancy, 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="jurnal">
        <TabsList>
          <TabsTrigger value="jurnal">
            <BookOpen className="h-4 w-4" /> Jurnal
          </TabsTrigger>
          <TabsTrigger value="beban">
            <Receipt className="h-4 w-4" /> Beban
          </TabsTrigger>
          <TabsTrigger value="coa">
            <Landmark className="h-4 w-4" /> Chart of Accounts
          </TabsTrigger>
          <TabsTrigger value="neraca">
            <Scale className="h-4 w-4" /> Neraca Saldo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jurnal">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Jurnal Entri</CardTitle>
              <CardDescription>
                Setiap jurnal otomatis balance (total debit = total credit).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {journals && !("error" in journals) ? (
                journals.items.length === 0 ? (
                  <EmptyState title="Belum ada jurnal" icon={BookOpen} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kode</TableHead>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Keterangan</TableHead>
                        <TableHead>Sumber</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {journals.items.map((j: any) => (
                        <TableRow key={j._id}>
                          <TableCell className="font-mono text-xs">{j.code}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(j.entryDate)}
                          </TableCell>
                          <TableCell className="text-sm">{j.description}</TableCell>
                          <TableCell>
                            <Badge variant="muted" className="text-[10px]">
                              {j.source}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(j.totalDebit, 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(j.totalCredit, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              ) : (
                <LoadingState />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="beban">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Beban Operasional</CardTitle>
                {expenseCsv !== undefined && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadCsv("beban.csv", expenseCsv)}
                  >
                    <Download className="h-3.5 w-3.5" /> Ekspor
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {expenses && !("error" in expenses) ? (
                expenses.items.length === 0 ? (
                  <EmptyState title="Belum ada beban" icon={Receipt} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kode</TableHead>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead>Keterangan</TableHead>
                        <TableHead>Dicatat Oleh</TableHead>
                        <TableHead className="text-right">Nominal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.items.map((e: any) => (
                        <TableRow key={e._id}>
                          <TableCell className="font-mono text-xs">{e.code}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(e.expenseDate)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{e.category}</TableCell>
                          <TableCell className="text-sm">{e.description}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {e.recordedByName ?? "—"}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatNumber(e.amount, 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              ) : (
                <LoadingState />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coa">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Chart of Accounts</CardTitle>
              <CardDescription>
                Kode akun standar 6Mart. Akun 2000 adalah kewajiban — bukan pendapatan.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kode</TableHead>
                    <TableHead>Nama Akun</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Saldo Normal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coa &&
                    !("error" in coa) &&
                    (coa as any[]).map((a) => (
                      <TableRow key={a.code}>
                        <TableCell className="font-mono text-xs font-semibold">{a.code}</TableCell>
                        <TableCell>{a.name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={a.type === "REVENUE" ? "success" : a.type === "LIABILITY" ? "warning" : "muted"}
                            className="text-[10px]"
                          >
                            {a.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {a.normalBalance}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="neraca">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="shrink-0">Account</Label>
              <select
                className="h-9 flex-1 rounded-lg border border-input bg-background px-2 text-sm"
                value={glAccount}
                onChange={(e) => setGlAccount(e.target.value)}
              >
                <option value="">— Pilih akun —</option>
                {coa &&
                  !("error" in coa) &&
                  (coa as any[]).map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
              </select>
            </div>
            {t && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Neraca Saldo</CardTitle>
                  <CardDescription>
                    {t.isBalanced ? (
                      <span className="text-success">Balance ✓</span>
                    ) : (
                      <span className="text-destructive">
                        Tidak balance — selisih {formatNumber(t.totalDebit - t.totalCredit, 0)}
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kode</TableHead>
                        <TableHead>Akun</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {t.rows.map((r: any) => (
                        <TableRow key={r.accountCode}>
                          <TableCell className="font-mono text-xs">{r.accountCode}</TableCell>
                          <TableCell>{r.accountName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.debit ? formatNumber(r.debit, 0) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.credit ? formatNumber(r.credit, 0) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold">
                        <TableCell colSpan={2}>TOTAL</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(t.totalDebit, 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(t.totalCredit, 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ExpenseDialog
        open={expenseOpen}
        onOpenChange={setExpenseOpen}
        onSubmit={async (args) => createExpense(args as any)}
      />
    </div>
  );
}

function ExpenseDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (args: any) => Promise<unknown>;
}) {
  const coa = useQuery(api.finance.chartOfAccounts, {});
  const [category, setCategory] = useState("6060");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expenseAccounts =
    coa && !("error" in coa) ? (coa as any[]).filter((a) => a.type === "EXPENSE") : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Catat Beban Operasional</DialogTitle>
          <DialogDescription>
            Jurnal otomatis: Debet akun beban, Kredit Kas. Beban mengurangi laba bersih tetapi
            bukan mengurangi pendapatan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Kategori Beban</Label>
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {expenseAccounts.map((a) => (
              <option key={a.code} value={a.code}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label>Keterangan</Label>
          <Input
            value={description}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setDescription(e.target.value)
            }
            placeholder="mis. Tagihan listrik bulan ini"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Nominal (Rp)</Label>
          <Input
            value={amount}
            inputMode="numeric"
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setAmount(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={busy || !description.trim() || !amount}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit({ category, description, amount: Number(amount) });
                onOpenChange(false);
                setDescription("");
                setAmount("");
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
