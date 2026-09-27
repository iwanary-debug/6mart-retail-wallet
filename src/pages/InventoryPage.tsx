import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  Plus,
  Boxes,
  AlertTriangle,
  Loader2,
  Truck,
  PackagePlus,
  SlidersHorizontal,
  ArrowDownUp,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  PageHeader,
  StatCard,
  Money,
  LoadingState,
  ErrorState,
  EmptyState,
  errorMessage,
  formatDateTime,
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

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE: "Pembelian",
  SALE: "Penjualan",
  RETURN: "Retur",
  ADJUSTMENT_IN: "Adjustment +",
  ADJUSTMENT_OUT: "Adjustment −",
  DAMAGE: "Rusak",
  LOSS: "Hilang",
};

export default function InventoryPage() {
  const { can } = useAuth();
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [movementType, setMovementType] = useState<string | undefined>();

  const overview = useQuery(api.inventory.stockOverview, {});
  const valuation = useQuery(api.inventory.stockValuation, {});
  const movements = useQuery(api.inventory.listMovements, {
    type: movementType,
    limit: 150,
  });
  const purchases = useQuery(api.inventory.listPurchases, { limit: 50 });
  const products = useQuery(api.products.listProducts, { limit: 300 });
  const suppliers = useQuery(api.products.listSuppliers, {});

  const createPurchase = useMutation(api.inventory.createPurchase);
  const adjustStock = useMutation(api.inventory.adjustStock);

  if (overview === undefined) return <LoadingState label="Memuat data inventory…" />;
  if ("error" in overview) return <ErrorState message={String(overview.error)} />;

  const o = overview as any;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        description="Nilai persediaan, pergerakan stok, dan pembelian dengan weighted average cost."
        action={
          can(PERMISSIONS.PURCHASE_MANAGE) && (
            <Button onClick={() => setPurchaseOpen(true)}>
              <Truck className="h-4 w-4" /> Catat Pembelian
            </Button>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Nilai Persediaan" value={formatNumber(o.totalValue, 0)} icon={Boxes} tone="primary" />
        <StatCard
          label="Nilai Jual"
          value={formatNumber(o.totalRetailValue, 0)}
          hint={`Potensi laba ${formatNumber(o.potentialProfit, 0)}`}
          icon={PackagePlus}
          tone="success"
        />
        <StatCard
          label="Stok Menipis"
          value={String(o.lowStockCount)}
          hint="Perlu pembelian"
          icon={AlertTriangle}
          tone="warning"
        />
        <StatCard
          label="Stok Habis"
          value={String(o.outOfStockCount)}
          icon={AlertTriangle}
          tone="destructive"
        />
      </div>

      {o.lowStock.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-warning">Perlu Perhatian</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {o.lowStock.map((p: any) => (
                <Badge key={p.id} variant={p.stock <= 0 ? "destructive" : "warning"}>
                  {p.name} · {formatNumber(p.stock, 0)}/{formatNumber(p.minStock, 0)} {p.unit}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="stok">
        <TabsList>
          <TabsTrigger value="stok">
            <Boxes className="h-4 w-4" /> Nilai Persediaan
          </TabsTrigger>
          <TabsTrigger value="pergerakan">
            <ArrowDownUp className="h-4 w-4" /> Pergerakan
          </TabsTrigger>
          <TabsTrigger value="pembelian">
            <Truck className="h-4 w-4" /> Pembelian
          </TabsTrigger>
        </TabsList>

        <TabsContent value="stok">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Daftar Persediaan</CardTitle>
              <CardDescription>
                HPP menggunakan weighted average cost — setiap pembelian mengubah rata-rata.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {valuation && !("error" in valuation) ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Nama</TableHead>
                      <TableHead className="text-right">Stok</TableHead>
                      <TableHead className="text-right">HPP Rata-rata</TableHead>
                      <TableHead className="text-right">Harga Jual</TableHead>
                      <TableHead className="text-right">Nilai</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {valuation.byProduct.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                        <TableCell>{p.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(p.stock, 0)} {p.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatNumber(p.averageCost, 0)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(p.sellingPrice, 0)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatNumber(p.value, 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <LoadingState />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pergerakan">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-sm">Riwayat Pergerakan Stok</CardTitle>
                  <CardDescription>Setiap perubahan stok tercatat dengan nilai HPP saat itu.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
                    value={movementType ?? ""}
                    onChange={(e) => setMovementType(e.target.value || undefined)}
                  >
                    <option value="">Semua jenis</option>
                    {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {can(PERMISSIONS.INVENTORY_ADJUST) && (
                    <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>
                      <SlidersHorizontal className="h-3.5 w-3.5" /> Penyesuaian
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {movements && !("error" in movements) ? (
                movements.items.length === 0 ? (
                  <EmptyState title="Belum ada pergerakan stok" icon={ArrowDownUp} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Produk</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Stok</TableHead>
                        <TableHead>Referensi</TableHead>
                        <TableHead className="text-right">Nilai</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movements.items.map((m: any) => (
                        <TableRow key={m._id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(m.createdAt)}
                          </TableCell>
                          <TableCell className="text-sm">{m.productName}</TableCell>
                          <TableCell>
                            <Badge variant="muted" className="text-[10px]">
                              {MOVEMENT_LABELS[m.type] ?? m.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(m.quantity, 0)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                            {formatNumber(m.stockBefore, 0)} → {formatNumber(m.stockAfter, 0)}
                          </TableCell>
                          <TableCell className="font-mono text-[10px] text-muted-foreground">
                            {m.referenceId}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(Math.abs(m.valueChange), 0)}
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

        <TabsContent value="pembelian">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Riwayat Pembelian</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {purchases && !("error" in purchases) ? (
                purchases.items.length === 0 ? (
                  <EmptyState title="Belum ada pembelian" icon={Truck} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kode</TableHead>
                        <TableHead>Waktu</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead className="text-right">Item</TableHead>
                        <TableHead>Pembayaran</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.items.map((p: any) => (
                        <TableRow key={p._id}>
                          <TableCell className="font-mono text-xs">{p.code}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(p.createdAt)}
                          </TableCell>
                          <TableCell>{p.supplierName}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.itemCount}</TableCell>
                          <TableCell>
                            <Badge variant="muted" className="text-[10px]">
                              {p.paymentMethod}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatNumber(p.totalAmount, 0)}
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

      <PurchaseDialog
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
        products={(products && !("error" in products) ? products.items : []) as any[]}
        suppliers={(suppliers && !("error" in suppliers) ? suppliers : []) as any[]}
        onSubmit={async (args) => {
          await createPurchase(args as any);
        }}
      />

      <AdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        products={(products && !("error" in products) ? products.items : []) as any[]}
        onSubmit={async (args) => {
          await adjustStock(args as any);
        }}
      />
    </div>
  );
}

function PurchaseDialog({
  open,
  onOpenChange,
  products,
  suppliers,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: any[];
  suppliers: any[];
  onSubmit: (args: any) => Promise<unknown>;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [lines, setLines] = useState<{ productId: string; quantity: number; unitCost: number }[]>([
    { productId: "", quantity: 1, unitCost: 0 },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Catat Pembelian</DialogTitle>
          <DialogDescription>
            Barang akan masuk ke stok, HPP rata-rata dihitung ulang, dan jurnal pembelian dibuat
            otomatis (bukan pendapatan).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">— Tanpa supplier —</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Pembayaran</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="CASH">Tunai</option>
              <option value="TRANSFER">Transfer</option>
              <option value="CREDIT">Tempo (kredit)</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Barang</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setLines([...lines, { productId: "", quantity: 1, unitCost: 0 }])}
            >
              <Plus className="h-3.5 w-3.5" /> Baris
            </Button>
          </div>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-1.5">
                <select
                  className="col-span-6 h-9 rounded-lg border border-input bg-background px-2 text-sm sm:col-span-5"
                  value={line.productId}
                  onChange={(e) => {
                    const p = products.find((x) => x._id === e.target.value);
                    setLines(
                      lines.map((l, j) =>
                        j === i
                          ? { ...l, productId: e.target.value, unitCost: p?.purchasePrice ?? l.unitCost }
                          : l,
                      ),
                    );
                  }}
                >
                  <option value="">Pilih produk…</option>
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} (stok {formatNumber(p.stock, 0)})
                    </option>
                  ))}
                </select>
                <Input
                  className="col-span-2 h-9 px-2 text-sm sm:col-span-2"
                  value={line.quantity || ""}
                  inputMode="decimal"
                  placeholder="Qty"
                  onChange={(e) =>
                    setLines(
                      lines.map((l, j) =>
                        j === i ? { ...l, quantity: Number(e.target.value) || 0 } : l,
                      ),
                    )
                  }
                />
                <Input
                  className="col-span-3 h-9 px-2 text-sm sm:col-span-4"
                  value={line.unitCost || ""}
                  inputMode="numeric"
                  placeholder="Harga beli"
                  onChange={(e) =>
                    setLines(
                      lines.map((l, j) =>
                        j === i ? { ...l, unitCost: Number(e.target.value) || 0 } : l,
                      ),
                    )
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="col-span-1 h-9 w-9"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                  disabled={lines.length === 1}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
          <span className="text-sm font-medium">Total Pembelian</span>
          <span className="font-bold tabular-nums">
            <Money value={total} />
          </span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={busy || total <= 0}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit({
                  supplierId: supplierId || undefined,
                  paymentMethod,
                  items: lines.filter((l) => l.productId && l.quantity > 0),
                });
                onOpenChange(false);
                setLines([{ productId: "", quantity: 1, unitCost: 0 }]);
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Pembelian
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({
  open,
  onOpenChange,
  products,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: any[];
  onSubmit: (args: any) => Promise<unknown>;
}) {
  const [productId, setProductId] = useState("");
  const [type, setType] = useState("ADJUSTMENT_IN");
  const [quantity, setQuantity] = useState<number | "">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Penyesuaian Stok</DialogTitle>
          <DialogDescription>
            Untuk koreksi opname, barang rusak, atau barang hilang. Setiap penyesuaian tercatat di
            audit log dan untuk kerusakan/hilangnya membebani beban operasional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Produk</Label>
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            <option value="">Pilih produk…</option>
            {products.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} (stok {formatNumber(p.stock, 0)})
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Jenis</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="ADJUSTMENT_IN">Adjustment Masuk (+)</option>
              <option value="ADJUSTMENT_OUT">Adjustment Keluar (−)</option>
              <option value="DAMAGE">Barang Rusak</option>
              <option value="LOSS">Barang Hilang</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input
              value={quantity}
              inputMode="decimal"
              placeholder="1"
              onChange={(e) =>
                setQuantity(e.target.value === "" ? "" : Number(e.target.value))
              }
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Alasan (wajib)</Label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="mis. Hasil hitung fisik berbeda"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={busy || !productId || !quantity || !reason.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit({
                  productId,
                  type,
                  quantity,
                  reason,
                });
                onOpenChange(false);
                setReason("");
                setQuantity("");
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
