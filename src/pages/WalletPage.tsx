import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import {
  Search,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Landmark,
  CreditCard,
  Coins,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useDateRange } from "@/hooks/useDateRange";
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

const TYPE_LABELS: Record<string, string> = {
  TOPUP: "Top Up",
  PURCHASE: "Pembelian",
  WITHDRAWAL: "Penarikan",
  REFUND: "Retur",
  ADJUSTMENT: "Penyesuaian",
  LAUNDRY: "Laundry",
  BARBERSHOP: "Barbershop",
  JASTIP: "Jastip",
  PPOB: "PPOB",
};

export default function WalletPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [topupOpen, setTopupOpen] = useState(false);
  const [vaOpen, setVaOpen] = useState(false);

  const wallets = useQuery(api.wallets.listWallets, { search: search || undefined, limit: 200 });
  const ledger = useQuery(api.wallets.listLedger, {
    type: typeFilter || undefined,
    limit: 200,
  });
  const report = useQuery(api.reports.walletReport, {});
  const topups = useQuery(api.payments.listTopups, { status: "PENDING" });
  // Ekspor CSV butuh `report.view`; halaman ini digateway `wallet.view`.
  // `skip` pada convex 1.46 adalah NILAI di posisi args, bukan field args.
  const canReport = can(PERMISSIONS.REPORT_VIEW);
  const { from, to } = useDateRange(30);
  const range = { from, to };
  const csv = useQuery(
    api.reports.exportCsv,
    canReport ? { dataset: "wallet" as const, ...range } : "skip",
  );

  const topUp = useMutation(api.wallets.topUp);
  const createVa = useMutation(api.payments.createVirtualAccount);
  const simulateVa = useMutation(api.payments.simulateVaPayment);

  if (wallets === undefined) return <LoadingState label="Memuat data wallet…" />;
  if ("error" in wallets) return <ErrorState message={String(wallets.error)} />;

  const r = report && !("error" in report) ? report : null;
  const pendingVa = topups && !("error" in topups) ? topups : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Student Wallet"
        description="Seluruh saldo terbentuk dari ledger — tidak pernah diubah langsung."
        action={
          can(PERMISSIONS.WALLET_TOPUP) && (
            <>
              <Button variant="outline" onClick={() => setVaOpen(true)}>
                <Landmark className="h-4 w-4" /> Virtual Account
              </Button>
              <Button onClick={() => setTopupOpen(true)}>
                <ArrowDownToLine className="h-4 w-4" /> Top Up
              </Button>
            </>
          )
        }
      />

      {r && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total Saldo"
            value={formatNumber(r.summary.totalBalance, 0)}
            hint={`${r.summary.totalWallets} wallet`}
            icon={Wallet}
            tone="primary"
          />
          <StatCard
            label="Masuk (30 hari)"
            value={formatNumber(r.summary.totalCredit, 0)}
            icon={ArrowDownToLine}
            tone="success"
          />
          <StatCard
            label="Keluar (30 hari)"
            value={formatNumber(r.summary.totalDebit, 0)}
            icon={ArrowUpFromLine}
          />
          <StatCard
            label="Wallet Tidak Aktif"
            value={String(r.summary.frozenWallets)}
            hint="Frozen / closed"
            icon={Wallet}
            tone={r.summary.frozenWallets > 0 ? "warning" : "default"}
          />
        </div>
      )}

      {pendingVa.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-warning">
              Virtual Account Menunggu Pembayaran
            </CardTitle>
            <CardDescription>
              Mode sandbox: klik "Tandai Dibayar" untuk mensimulasikan webhook bank.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingVa.map((t: any) => (
              <div
                key={t._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-mono font-semibold">{t.virtualAccountNumber ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.code} · {formatDateTime(t.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">
                    {formatNumber(t.amount, 0)}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await simulateVa({ topupCode: t.code });
                    }}
                  >
                    Tandai Dibayar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="wallet">
        <TabsList>
          <TabsTrigger value="wallet">
            <Wallet className="h-4 w-4" /> Daftar Wallet
          </TabsTrigger>
          <TabsTrigger value="ledger">
            <Coins className="h-4 w-4" /> Semua Mutasi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="wallet">
          <div className="mb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari nama atau NIS…"
                className="pl-9"
              />
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {wallets.items.length === 0 ? (
                <EmptyState title="Belum ada wallet" icon={Wallet} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NIS</TableHead>
                      <TableHead>Nama Santri</TableHead>
                      <TableHead>Kelas</TableHead>
                      <TableHead>Kode Wallet</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wallets.items.map((w: any) => (
                      <TableRow key={w.id}>
                        <TableCell className="font-mono text-xs">{w.nis}</TableCell>
                        <TableCell className="font-medium">{w.studentName}</TableCell>
                        <TableCell className="text-sm">{w.className}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {w.code}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={w.status === "ACTIVE" ? "success" : "warning"}
                            className="text-[10px]"
                          >
                            {w.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-primary">
                          {formatNumber(w.balance, 0)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/app/santri/${w.studentId}`}>Kelola</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <select
              className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">Semua jenis transaksi</option>
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {csv !== undefined && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv("mutasi-wallet-30hari.csv", csv)}
              >
                Ekspor CSV
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              {ledger && !("error" in ledger) ? (
                ledger.items.length === 0 ? (
                  <EmptyState title="Belum ada mutasi" icon={Coins} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Transaksi</TableHead>
                        <TableHead>Tipe</TableHead>
                        <TableHead>Keterangan</TableHead>
                        <TableHead className="text-right">Nominal</TableHead>
                        <TableHead className="text-right">Saldo Akhir</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledger.items.map((e: any) => (
                        <TableRow key={e._id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(e.createdAt)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{e.transactionId}</TableCell>
                          <TableCell>
                            <Badge
                              variant={e.direction === "CREDIT" ? "success" : "secondary"}
                              className="text-[10px]"
                            >
                              {TYPE_LABELS[e.type] ?? e.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-40 truncate text-xs text-muted-foreground">
                            {e.note ?? "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold tabular-nums ${
                              e.direction === "CREDIT" ? "text-success" : ""
                            }`}
                          >
                            {e.direction === "CREDIT" ? "+" : "−"}
                            {formatNumber(e.amount, 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {formatNumber(e.balanceAfter, 0)}
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
      </Tabs>

      <QuickTopUpDialog
        open={topupOpen}
        onOpenChange={setTopupOpen}
        wallets={(wallets.items as any[])}
        onSubmit={async (studentId, amount, method) => {
          await topUp({
            studentId: studentId as any,
            type: "TOPUP",
            amount,
            method: method as any,
            idempotencyKey: `topup-${studentId}-${amount}-${Date.now()}`,
          });
        }}
      />

      <VaDialog
        open={vaOpen}
        onOpenChange={setVaOpen}
        wallets={(wallets.items as any[])}
        onSubmit={async (studentId, amount) => createVa({ studentId: studentId as any, amount })}
      />
    </div>
  );
}

function QuickTopUpDialog({
  open,
  onOpenChange,
  wallets,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wallets: any[];
  onSubmit: (studentId: string, amount: number, method: string) => Promise<unknown>;
}) {
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState<number | "">(100000);
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onOpenChange(false);
          setResult(null);
          setError(null);
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Top Up Wallet</DialogTitle>
          <DialogDescription>
            Top up adalah pertukaran Kas/Bank dengan Kewajiban Wallet — BUKAN pendapatan 6Mart.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <>
            <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">Saldo baru</p>
              <p className="mt-1 text-xl font-bold text-success">
                {formatNumber(result.balanceAfter, 0)}
              </p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {result.transactionId}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Selesai</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Santri</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">Pilih santri…</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.studentId}>
                    {w.studentName} ({w.nis}) — saldo {formatNumber(w.balance, 0)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Nominal (Rp)</Label>
              <Input
                value={amount}
                inputMode="numeric"
                onChange={(e) =>
                  setAmount(e.target.value === "" ? "" : Number(e.target.value))
                }
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[50_000, 100_000, 200_000, 500_000].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setAmount(p)}
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                  >
                    {formatNumber(p, 0)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Metode</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="BANK_TRANSFER">Transfer Bank</option>
                <option value="CASH">Tunai</option>
                <option value="MANUAL">Manual oleh Admin</option>
              </select>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button
                disabled={busy || !studentId || !amount}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    setResult(
                      await onSubmit(studentId, Number(amount), method),
                    );
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Proses Top Up
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function VaDialog({
  open,
  onOpenChange,
  wallets,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wallets: any[];
  onSubmit: (studentId: string, amount: number) => Promise<unknown>;
}) {
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState<number | "">(200000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onOpenChange(false);
          setResult(null);
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Buat Virtual Account</DialogTitle>
          <DialogDescription>
            Alur: wali transfer ke VA → bank mengirim webhook → saldo bertambah otomatis.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <>
            {result.isSandbox && (
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-foreground">
                <strong>Mode Sandbox</strong> — provider ini simulasi, bukan bank sungguhan. Tidak
                ada uang nyata yang berpindah.
              </div>
            )}
            <div className="space-y-1 rounded-lg border-2 border-dashed border-primary/40 p-4 text-center">
              <p className="text-xs text-muted-foreground">Nomor Virtual Account</p>
              <p className="font-mono text-xl font-bold tracking-wider">
                {result.accountNumber}
              </p>
              <p className="text-xs text-muted-foreground">{result.bankCode}</p>
              <p className="mt-2 text-lg font-bold tabular-nums">
                {formatNumber(result.amount, 0)}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Tutup</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Santri</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
              >
                <option value="">Pilih santri…</option>
                {wallets.map((w) => (
                  <option key={w.id} value={w.studentId}>
                    {w.studentName} ({w.nis})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Nominal (Rp)</Label>
              <Input
                value={amount}
                inputMode="numeric"
                onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Batal
              </Button>
              <Button
                disabled={busy || !studentId || !amount}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    setResult(await onSubmit(studentId, Number(amount)));
                  } catch (err) {
                    setError(errorMessage(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <CreditCard className="h-4 w-4" /> Buat VA
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
