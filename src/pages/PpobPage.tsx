import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Zap, Loader2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Info } from "lucide-react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  PageHeader,
  EmptyState,
  AlertBanner,
  errorMessage,
  formatDateTime,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, Badge } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber } from "@/lib/money";
import { PERMISSIONS } from "@/lib/rbac";

const CATEGORY_LABELS: Record<string, string> = {
  PULSA: "Pulsa",
  PLN: "Token Listrik",
  DATA: "Paket Data",
  GAME: "Voucher Game",
  E_WALLET: "E-Wallet",
  OTHER: "Lainnya",
};

export default function PpobPage() {
  const { can } = useAuth();
  const [productId, setProductId] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [studentId, setStudentId] = useState("");
  const [method, setMethod] = useState<"WALLET" | "CASH">("CASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const products = useQuery(api.ppob.listProducts, {});
  const transactions = useQuery(api.ppob.listTransactions, { limit: 60 });
  const provider = useQuery(api.ppob.providerInfo, {});
  // Pilihan Santri untuk pembayaran PPOB butuh `student.view`, sedangkan
  // halaman ini hanya digateway `service.ppob`.
  const students = useQuery(
    api.students.list,
    can(PERMISSIONS.STUDENT_VIEW) ? { status: "ACTIVE", limit: 200 } : "skip",
  );
  const sync = useAction(api.ppob.syncProducts);
  const create = useMutation(api.ppob.createTransaction);
  const retry = useMutation(api.ppob.retryTransaction);

  const productList = (products && !("error" in products) ? products : []) as any[];
  const selected = productList.find((p) => p._id === productId);
  const margin = selected ? selected.price - selected.costPrice : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumb="Layanan"
        title="PPOB"
        description="Pulsa, token listrik, dan produk digital. Menggunakan provider abstraction dengan adapter sandbox."
        action={
          can("service.ppob") && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await sync();
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RefreshCw className="h-4 w-4" /> Sinkronkan Katalog
            </Button>
          )
        }
      />

      {provider && !("error" in provider) && (provider as any).ppob.isSandbox && (
        <AlertBanner variant="WARNING" title="Provider PPOB aktif: SANDBOX">
          Ini adalah adapter simulasi, BUKAN provider sungguhan. Transaksi tidak diteruskan ke
          operator pulsa/token dan tidak ada uang nyata yang berpindah. Struktur kode sudah siap
          diganti dengan provider nyata (implementasikan interface{" "}
          <code className="font-mono">PPOBProvider</code> di{" "}
          <code className="font-mono">src/convex/providers.ts</code>).
        </AlertBanner>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Form */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Buat Transaksi</CardTitle>
            <CardDescription>
              Alur: validasi → debit wallet (jika dipilih) → charge provider → jurnal. Bila
              provider gagal, dana dikembalikan otomatis.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Produk</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">Pilih produk…</option>
                {["PULSA", "PLN", "DATA", "GAME", "E_WALLET"].map((cat) => {
                  const items = productList.filter((p) => p.category === cat);
                  if (items.length === 0) return null;
                  return (
                    <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                      {items.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} — {formatNumber(p.price, 0)}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {selected && (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Harga jual</span>
                  <span className="font-semibold">{formatNumber(selected.price, 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Harga beli (provider)</span>
                  <span className="tabular-nums">{formatNumber(selected.costPrice, 0)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1">
                  <span className="text-muted-foreground">Margin</span>
                  <span className="font-semibold text-success">{formatNumber(margin, 0)}</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Nomor Pelanggan / HP</Label>
              <Input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="081234567890 atau nomor token PLN"
                inputMode="numeric"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Santri (untuk pembayaran wallet)</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                disabled={method === "CASH"}
              >
                <option value="">— Tidak ada —</option>
                {((students && !("error" in students) ? students.items : []) as any[]).map(
                  (st) => (
                    <option key={st._id} value={st._id}>
                      {st.name} — saldo {formatNumber(st.balance, 0)}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(["CASH", "WALLET"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  disabled={m === "WALLET" && !studentId}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    method === m
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {m === "CASH" ? "Tunai" : "Wallet Santri"}
                </button>
              ))}
            </div>

            {error && <AlertBanner variant="ERROR" title="Transaksi gagal">{error}</AlertBanner>}

            {result && (
              <AlertBanner variant="SUCCESS" title="Transaksi Berhasil">
                <p>
                  Kode: <span className="font-mono">{result.code}</span>
                </p>
                {result.serialNumber && (
                  <p>
                    Serial: <span className="font-mono">{result.serialNumber}</span>
                  </p>
                )}
                <p className="mt-1 text-xs">Provider: {result.provider} ({result.environment})</p>
              </AlertBanner>
            )}

            <Button
              className="w-full"
              disabled={busy || !selected || !identifier.trim() || (method === "WALLET" && !studentId)}
              onClick={async () => {
                setBusy(true);
                setError(null);
                setResult(null);
                try {
                  setResult(
                    await create({
                      productId: productId as any,
                      customerIdentifier: identifier.trim(),
                      studentId: method === "WALLET" ? (studentId as any) : undefined,
                      paymentMethod: method,
                      idempotencyKey: `ppob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    }),
                  );
                  setIdentifier("");
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Memproses…
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4" /> Proses Transaksi
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Katalog */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Katalog Produk</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 space-y-2 overflow-y-auto">
            {productList.length === 0 ? (
              <EmptyState
                title="Katalog kosong"
                description="Klik Sinkronkan Katalog untuk mengambil produk dari provider."
                icon={Zap}
              />
            ) : (
              productList.map((p) => (
                <div
                  key={p._id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {CATEGORY_LABELS[p.category] ?? p.category}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{formatNumber(p.price, 0)}</p>
                    <p className="text-[10px] text-success">
                      +{formatNumber(p.price - p.costPrice, 0)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Riwayat */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Riwayat Transaksi PPOB</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactions && !("error" in transactions) && transactions.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Kode</TableHead>
                  <TableHead>Produk</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead className="text-right">Harga</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.items.map((t: any) => (
                  <TableRow key={t._id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(t.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{t.code}</TableCell>
                    <TableCell className="text-sm">{t.productName}</TableCell>
                    <TableCell className="font-mono text-xs">{t.customerIdentifier}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(t.price, 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-success">
                      {formatNumber(t.margin, 0)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          t.status === "SUCCESS"
                            ? "success"
                            : t.status === "FAILED"
                              ? "destructive"
                              : "muted"
                        }
                        className="gap-1 text-[10px]"
                      >
                        {t.status === "SUCCESS" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : t.status === "FAILED" ? (
                          <XCircle className="h-3 w-3" />
                        ) : (
                          <Info className="h-3 w-3" />
                        )}
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {t.status === "FAILED" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => await retry({ transactionId: t._id })}
                        >
                          <AlertTriangle className="h-3.5 w-3.5" /> Retry
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState title="Belum ada transaksi PPOB" icon={Zap} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
