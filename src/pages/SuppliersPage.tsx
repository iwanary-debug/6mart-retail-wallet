import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Search, Truck, Loader2 } from "lucide-react";
import { api } from "../convex/_generated/api";
import {
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
  errorMessage,
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
import { formatNumber } from "@/lib/money";

export default function SuppliersPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", address: "", contactPerson: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery(api.products.listSuppliers, { search: search || undefined });
  const create = useMutation(api.products.createSupplier);

  if (list === undefined) return <LoadingState label="Memuat supplier…" />;
  if ("error" in list) return <ErrorState message={String(list.error)} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supplier"
        description="Mitra pemasok barang untuk pembelian dan penerimaan stok."
        action={
          <Button
            onClick={() => {
              setForm({ name: "", phone: "", address: "", contactPerson: "" });
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Tambah Supplier
          </Button>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama atau kode supplier…"
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <EmptyState title="Belum ada supplier" icon={Truck} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kontak</TableHead>
                  <TableHead>Telepon</TableHead>
                  <TableHead className="text-right">Pembelian</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-mono text-xs">{s.code}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-sm">{s.contactPerson ?? "—"}</TableCell>
                    <TableCell className="tabular-nums text-sm">{s.phone ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.purchaseCount}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatNumber(s.purchaseTotal, 0)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={s.status === "ACTIVE" ? "success" : "muted"}
                        className="text-[10px]"
                      >
                        {s.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tambah Supplier</DialogTitle>
            <DialogDescription>Kode supplier dibuat otomatis oleh sistem.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama Supplier</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Telepon</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nama Kontak</Label>
                <Input
                  value={form.contactPerson}
                  onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Alamat</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={busy || !form.name.trim()}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await create({
                    name: form.name,
                    phone: form.phone || undefined,
                    address: form.address || undefined,
                    contactPerson: form.contactPerson || undefined,
                  });
                  setOpen(false);
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
    </div>
  );
}
