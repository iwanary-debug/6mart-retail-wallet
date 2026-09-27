import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search, Package, Loader2, Archive, Pencil, ArrowDownToLine } from "lucide-react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  PageHeader,
  Money,
  LoadingState,
  ErrorState,
  EmptyState,
  errorMessage,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

const emptyForm = {
  sku: "",
  name: "",
  barcode: "",
  unit: "pcs",
  purchasePrice: 0,
  sellingPrice: 0,
  minStock: 5,
  categoryId: "",
  supplierId: "",
  trackInventory: true,
};

export default function ProductsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [dialog, setDialog] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<any>(null);

  const list = useQuery(api.products.listProducts, {
    search: search || undefined,
    lowStockOnly: lowStockOnly || undefined,
    limit: 300,
  });
  const categories = useQuery(api.products.listCategories, {});
  const suppliers = useQuery(api.products.listSuppliers, {});
  const create = useMutation(api.products.createProduct);
  const update = useMutation(api.products.updateProduct);
  const archive = useMutation(api.products.archiveProduct);

  if (list === undefined) return <LoadingState label="Memuat produk…" />;
  if ("error" in list) return <ErrorState message={String(list.error)} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Produk"
        description="Master produk, harga beli, harga jual, dan ambang stok menipis."
        action={
          can(PERMISSIONS.PRODUCT_MANAGE) && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(null);
                  setDialog("create");
                }}
              >
                <ArrowDownToLine className="h-4 w-4" /> Tambah Stok
              </Button>
              <Button
                onClick={() => {
                  setEditing(null);
                  setDialog("create");
                }}
              >
                <Plus className="h-4 w-4" /> Tambah Produk
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, SKU, atau barcode…"
            className="pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
          Stok menipis saja
        </label>
      </div>

      <Card>
        <CardContent className="p-0">
          {list.items.length === 0 ? (
            <EmptyState
              title="Belum ada produk"
              description="Tambahkan produk, lalu lakukan pembelian untuk menambah stok."
              icon={Package}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead className="text-right">Harga Beli</TableHead>
                  <TableHead className="text-right">Harga Jual</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                  <TableHead className="text-right">Stok</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((p) => {
                  const margin = p.sellingPrice - p.purchasePrice;
                  const low = p.stock <= Math.max(p.minStock, 10);
                  return (
                    <TableRow key={p._id}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {p.barcode ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(p.purchasePrice, 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatNumber(p.sellingPrice, 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-success">
                        {formatNumber(margin, 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-semibold tabular-nums ${low ? "text-destructive" : ""}`}
                        >
                          {formatNumber(p.stock, 0)}
                        </span>
                        <span className="ml-1 text-xs text-muted-foreground">{p.unit}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {can(PERMISSIONS.PRODUCT_MANAGE) && (
                          <div className="flex justify-end gap-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditing(p);
                                setDialog("edit");
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                if (confirm(`Nonaktifkan "${p.name}"?`)) await archive({ id: p._id });
                              }}
                            >
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Menampilkan {list.items.length} dari {list.total} produk
      </p>

      <ProductDialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        initial={editing}
        categories={(categories && !("error" in categories) ? categories : []) as any[]}
        suppliers={(suppliers && !("error" in suppliers) ? suppliers : []) as any[]}
        onSubmit={async (args) => {
          if (editing) await update({ id: editing._id, ...args });
          else await create(args as any);
        }}
      />
    </div>
  );
}

function ProductDialog({
  open,
  onOpenChange,
  initial,
  categories,
  suppliers,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: any;
  categories: any[];
  suppliers: any[];
  onSubmit: (args: any) => Promise<unknown>;
}) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  // Reset form saat dialog dibuka dengan data baru.
  if (open && key !== (initial?._id ?? "new")) {
    setKey(initial?._id ?? "new");
    setError(null);
    setForm(
      initial
        ? {
            sku: initial.sku,
            name: initial.name,
            barcode: initial.barcode ?? "",
            unit: initial.unit,
            purchasePrice: initial.purchasePrice,
            sellingPrice: initial.sellingPrice,
            minStock: initial.minStock,
            categoryId: initial.categoryId ?? "",
            supplierId: initial.supplierId ?? "",
            trackInventory: initial.trackInventory,
          }
        : emptyForm,
    );
  }

  const margin = form.sellingPrice - form.purchasePrice;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Produk" : "Tambah Produk"}</DialogTitle>
          <DialogDescription>
            Stok awal tidak diisi di sini — gunakan menu Inventory &gt; Pembelian agar setiap
            pergerakan stok tercatat dan HPP terhitung.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>SKU</Label>
            <Input
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })}
              placeholder="MI-001"
              disabled={!!initial}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Barcode</Label>
            <Input
              value={form.barcode}
              onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              placeholder="899…"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nama Produk</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Indomie Goreng"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Satuan</Label>
            <Input
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="pcs"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Min. Stok</Label>
            <Input
              value={form.minStock}
              inputMode="decimal"
              onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Harga Beli (Rp)</Label>
            <Input
              value={form.purchasePrice || ""}
              inputMode="numeric"
              onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Harga Jual (Rp)</Label>
            <Input
              value={form.sellingPrice || ""}
              inputMode="numeric"
              onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kategori</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">— Tanpa kategori —</option>
              {categories.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            >
              <option value="">— Tanpa supplier —</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
          <div>
            <p className="text-sm font-medium">Lacak inventory</p>
            <p className="text-xs text-muted-foreground">Nonaktifkan untuk barang/services</p>
          </div>
          <Switch
            checked={form.trackInventory}
            onCheckedChange={(v: boolean) => setForm({ ...form, trackInventory: v })}
          />
        </div>

        {margin !== 0 && (
          <p className="text-sm text-muted-foreground">
            Margin:{" "}
            <span className={margin > 0 ? "font-semibold text-success" : "font-semibold text-destructive"}>
              <Money value={margin} />
            </span>{" "}
            per {form.unit}
          </p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit({
                  ...form,
                  categoryId: form.categoryId || undefined,
                  supplierId: form.supplierId || undefined,
                  barcode: form.barcode || undefined,
                });
                onOpenChange(false);
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
