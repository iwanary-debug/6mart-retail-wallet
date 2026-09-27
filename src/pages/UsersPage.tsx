import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus, Users, Shield, Loader2, Search } from "lucide-react";
import { api } from "../convex/_generated/api";
import {
  PageHeader,
  LoadingState,
  ErrorState,
  EmptyState,
  errorMessage,
  formatDateTime,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, Badge } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", roleKey: "cashier", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const list = useQuery(api.users.list, { search: search || undefined });
  const roles = useQuery(api.users.listRoles, {});
  const matrix = useQuery(api.users.permissionMatrix, {});
  const create = useMutation(api.users.create);
  const update = useMutation(api.users.update);

  if (list === undefined) return <LoadingState label="Memuat pengguna…" />;
  if ("error" in list) return <ErrorState message={String(list.error)} />;

  const roleList = (roles && !("error" in roles) ? roles : []) as any[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pengguna & Peran"
        description="Akun staff, role, dan matriks permission. Izin ditegakkan di server, bukan hanya disembunyikan di UI."
        action={
          <Button
            onClick={() => {
              setForm({ name: "", email: "", roleKey: "cashier", phone: "" });
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Tambah Pengguna
          </Button>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari nama, email, atau role…"
          className="pl-9"
        />
      </div>

      <Tabs defaultValue="pengguna">
        <TabsList>
          <TabsTrigger value="pengguna">
            <Users className="h-4 w-4" /> Pengguna
          </TabsTrigger>
          <TabsTrigger value="role">
            <Shield className="h-4 w-4" /> Role & Permission
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pengguna">
          <Card>
            <CardContent className="p-0">
              {list.length === 0 ? (
                <EmptyState title="Belum ada pengguna" icon={Users} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Telepon</TableHead>
                      <TableHead>Login Terakhir</TableHead>
                      <TableHead>Aktif</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((u: any) => (
                      <TableRow key={u._id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {u.email}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">
                            {u.roleLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-sm">{u.phone ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Belum pernah"}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={u.isActive}
                            onCheckedChange={async (v) =>
                              await update({ id: u._id, isActive: v })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="role">
          <div className="space-y-3">
            {(matrix && !("error" in matrix) ? matrix : []).map((r: any) => (
              <Card key={r.role}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{r.label}</CardTitle>
                    <Badge variant="muted">{r.permissions.length} izin</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {r.permissions.map((p: string) => (
                      <Badge key={p} variant="outline" className="font-mono text-[10px]">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Tambah Pengguna</DialogTitle>
            <DialogDescription>
              Akun dibuat di tabel staff 6Mart. Password awal dapat diatur kemudian oleh Super
              Admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nama Lengkap</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="nama@6mart.test"
                type="email"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={form.roleKey}
                onChange={(e) => setForm({ ...form, roleKey: e.target.value })}
              >
                {roleList.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Telepon</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              disabled={busy || !form.name.trim() || !form.email.trim()}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await create({
                    name: form.name,
                    email: form.email,
                    roleKey: form.roleKey,
                    phone: form.phone || undefined,
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
