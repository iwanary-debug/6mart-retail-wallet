import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Search, Receipt, Printer, Undo2, Ban, Loader2, Eye } from "lucide-react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { useDateRange } from "@/hooks/useDateRange";
import {
  PageHeader,
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
import { Card, CardContent } from "@/components/ui/card";
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

const PERIODS = [
  { key: "today", label: "Hari Ini" },
  { key: "week", label: "7 Hari" },
  { key: "month", label: "Bulan Ini" },
  { key: "quarter", label: "90 Hari" },
];

export default function SalesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("month");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);

  const list = useQuery(api.sales.listSales, {
    search: search || undefined,
    limit: 100,
  });
  // Halaman ini dipagari `sale.view`, tetapi ringkasan dan ekspor butuh
  // `report.view`. Tanpa `skip`, peran tanpa izin laporan (mis. Inventory)
  // akan mendapat ForbiddenError dan halaman ini gagal total.
  //
  // Catatan: pada convex 1.46, `skip` adalah NILAI pada posisi args, bukan
  // field di dalam objek args.
  const canReport = can(PERMISSIONS.REPORT_VIEW);
  const { from, to } = useDateRange(30);
  const range = { from, to };
  const report = useQuery(
    api.reports.salesReport,
    canReport ? { period } : "skip",
  );
  const refund = useMutation(api.sales.refund);
  const voidSale = useMutation(api.sales.voidSale);
  const csv = useQuery(
    api.reports.exportCsv,
    canReport ? { dataset: "sales" as const, ...range } : "skip",
  );

  if (list === undefined) return <LoadingState label="Memuat transaksi…" />;
  if ("error" in list) return <ErrorState message={String(list.error)} />;

  const r = report && !("error" in report) ? report : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Penjualan"
        description="Riwayat seluruh transaksi penjualan beserta HPP dan laba kotor."
        action={
          csv !== undefined ? (
            <Button
              variant="outline"
              onClick={() => downloadCsv(`penjualan-30hari.csv`, csv)}
            >
              Ekspor CSV
            </Button>
          ) : undefined
        }
      />

      {r && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="stat-tile">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pendapatan</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-primary">
              {formatNumber(r.summary.revenue, 0)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {r.summary.transactionCount} transaksi
            </p>
          </div>
          <div className="stat-tile">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">HPP</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums">
              {formatNumber(r.summary.cogs, 0)}
            </p>
          </div>
          <div className="stat-tile">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Laba Kotor</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums text-success">
              {formatNumber(r.summary.grossProfit, 0)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">Margin {r.summary.margin}%</p>
          </div>
          <div className="stat-tile">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rata-rata</p>
            <p className="mt-1.5 text-xl font-bold tabular-nums">
              {formatNumber(r.summary.averageTransaction, 0)}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari invoice, kasir, atau nama santri…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                period === p.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {list.items.length === 0 ? (
            <EmptyState title="Belum ada transaksi" description="Mulai dari halaman Kasir." icon={Receipt} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Kasir</TableHead>
                  <TableHead>Santri</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead className="text-right">HPP</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Laba</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((s: any) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(s.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">{s.cashierName}</TableCell>
                    <TableCell className="text-sm">{s.studentName ?? "Umum"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.paymentMethod === "WALLET"
                            ? "secondary"
                            : s.paymentMethod === "CASH"
                              ? "muted"
                              : "default"
                        }
                        className="text-[10px]"
                      >
                        {s.paymentMethod === "WALLET"
                          ? "Wallet"
                          : s.paymentMethod === "CASH"
                            ? "Tunai"
                            : "Campuran"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatNumber(s.costTotal, 0)}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatNumber(s.total, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {formatNumber(s.total - s.costTotal, 0)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          s.status === "COMPLETED"
                            ? "success"
                            : s.status === "VOID"
                              ? "destructive"
                              : "warning"
                        }
                        className="text-[10px]"
                      >
                        {s.status}
                      </Badge>
                      {s.refundedAmount > 0 && (
                        <Badge variant="warning" className="ml-1 text-[10px]">
                          Retur {formatNumber(s.refundedAmount, 0)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button size="sm" variant="ghost" onClick={() => setDetailId(s._id)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {can(PERMISSIONS.SALE_REFUND) && s.status === "COMPLETED" && (
                          <Button size="sm" variant="ghost" onClick={() => setRefundId(s._id)}>
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {can(PERMISSIONS.SALE_VOID) && s.status === "COMPLETED" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={async () => {
                              const reason = prompt("Alasan pembatalan:");
                              if (reason) await voidSale({ saleId: s._id, reason });
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SaleDetailDialog id={detailId} onClose={() => setDetailId(null)} />
      <RefundDialog
        id={refundId}
        onClose={() => setRefundId(null)}
        onRefund={async (saleId, amount, reason) => refund({ saleId, amount, reason })}
      />
    </div>
  );
}

function SaleDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  // Dialog ini hanya dirender saat `id` ada, jadi query dilewati kalau null.
  const detail = useQuery(
    api.sales.getSale,
    id ? { id: id as never } : "skip",
  );
  if (!id) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Detail Transaksi</DialogTitle>
          <DialogDescription>
            {detail && !("error" in detail)
              ? `${(detail as any).sale.code} · ${formatDateTime((detail as any).sale.createdAt)}`
              : "Memuat…"}
          </DialogDescription>
        </DialogHeader>

        {detail && !("error" in detail) ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kasir</span>
                <span className="font-medium">{(detail as any).sale.cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Santri</span>
                <span className="font-medium">
                  {(detail as any).sale.studentName ?? "Umum"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Metode</span>
                <span className="font-medium">{(detail as any).sale.paymentMethod}</span>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Item
              </p>
              <div className="space-y-1 rounded-lg border border-border p-2">
                {(detail as any).items.map((i: any) => (
                  <div key={i._id} className="flex justify-between text-sm">
                    <span>
                      {i.name}{" "}
                      <span className="text-muted-foreground">×{formatNumber(i.quantity, 0)}</span>
                    </span>
                    <span className="tabular-nums">{formatNumber(i.subtotal, 0)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1 border-t border-border pt-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums">
                  {formatNumber((detail as any).sale.subtotal, 0)}
                </span>
              </div>
              {(detail as any).sale.discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Diskon</span>
                  <span className="tabular-nums">
                    −{formatNumber((detail as any).sale.discount, 0)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="tabular-nums text-primary">
                  {formatNumber((detail as any).sale.total, 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">HPP</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatNumber((detail as any).sale.costTotal, 0)}
                </span>
              </div>
              <div className="flex justify-between font-semibold text-success">
                <span>Laba Kotor</span>
                <span className="tabular-nums">
                  {formatNumber((detail as any).sale.total - (detail as any).sale.costTotal, 0)}
                </span>
              </div>
              {(detail as any).balanceAfter !== null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sisa saldo wallet</span>
                  <span className="tabular-nums font-medium text-primary">
                    {formatNumber((detail as any).balanceAfter, 0)}
                  </span>
                </div>
              )}
            </div>

            {(detail as any).refunds.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Retur
                </p>
                <div className="space-y-1">
                  {(detail as any).refunds.map((rf: any) => (
                    <div key={rf._id} className="flex justify-between text-sm text-destructive">
                      <span>
                        {rf.code} · {rf.reason}
                      </span>
                      <span className="tabular-nums">{formatNumber(rf.amount, 0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <LoadingState label="Memuat detail…" />
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Cetak
          </Button>
          <Button onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefundDialog({
  id,
  onClose,
  onRefund,
}: {
  id: string | null;
  onClose: () => void;
  onRefund: (saleId: any, amount: number | undefined, reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setReason("");
          setAmount("");
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Retur / Refund</DialogTitle>
          <DialogDescription>
            Transaksi lama TIDAK dihapus. Retur dicatat sebagai transaksi baru di ledger dan jurnal,
            dan barang dikembalikan ke persediaan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Nominal Retur (kosong = retur penuh)</Label>
          <Input
            value={amount}
            inputMode="numeric"
            placeholder="Retur penuh"
            onChange={(e) => setAmount(e.target.value === "" ? "" : Number(e.target.value))}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Alasan (wajib)</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="mis. Barang rusak / tidak sesuai"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="destructive"
            disabled={busy || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onRefund(id, amount === "" ? undefined : amount, reason);
                onClose();
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Proses Retur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
