import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import {
  Plus,
  Search,
  Users,
  Nfc,
  QrCode,
  Loader2,
  Upload,
  Wallet as WalletIcon,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import { CsvImportDialog } from "@/components/common/CsvImportDialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PERMISSIONS } from "@/lib/rbac";

export default function StudentsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const list = useQuery(api.students.list, {
    search: search || undefined,
    status: status === "ALL" ? undefined : status,
    limit: 300,
  });
  const classes = useQuery(api.students.listClasses, {});
  const create = useMutation(api.students.create);
  const importStudents = useMutation(api.import.importStudents);

  if (list === undefined) return <LoadingState label="Memuat data santri…" />;
  if ("error" in list) return <ErrorState message={String(list.error)} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Santri"
        description="Master data santri, wallet, dan kartu RFID/QR."
        action={
          can(PERMISSIONS.STUDENT_MANAGE) && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Tambah Santri
              </Button>
            </>
          )
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari NIS atau nama…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACTIVE">Aktif</SelectItem>
            <SelectItem value="INACTIVE">Tidak Aktif</SelectItem>
            <SelectItem value="GRADUATED">Lulus</SelectItem>
            <SelectItem value="ALL">Semua</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {list.items.length === 0 ? (
            <EmptyState
              title="Belum ada data santri"
              description="Tambahkan santri untuk membuat wallet dan kartu RFID otomatis."
              icon={Users}
              action={
                can(PERMISSIONS.STUDENT_MANAGE) && (
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" /> Tambah Santri
                  </Button>
                )
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NIS</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kelas</TableHead>
                  <TableHead>Asrama / Kamar</TableHead>
                  <TableHead>RFID</TableHead>
                  <TableHead className="text-right">Saldo Wallet</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-mono text-xs">{s.nis}</TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.className}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s.dormitory ?? "—"}
                      {s.room ? ` / ${s.room}` : ""}
                    </TableCell>
                    <TableCell>
                      {s.rfidUid ? (
                        <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
                          <Nfc className="h-3 w-3" />
                          {s.rfidUid}
                        </Badge>
                      ) : (
                        <Badge variant="muted" className="gap-1 text-[10px]">
                          <QrCode className="h-3 w-3" /> QR saja
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      <Money value={s.balance} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="ghost">
                        <Link to={`/app/santri/${s._id}`}>Detail</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Menampilkan {list.items.length} dari {list.total} santri
        {classes && !("error" in classes) ? ` · ${classes.length} kelas` : ""}
      </p>

      <CreateStudentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={async (args) => {
          await create(args);
        }}
      />

      <CsvImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Import Santri dari CSV"
        template={{
          filename: "template-santri.csv",
          header: "nis,nama,jenisKelamin,kelas,asrama,kamar",
          example: "26001,Ahmad Fauzi,L,6A,Asrama A,101",
          required: ["nis", "nama", "jenisKelamin", "kelas"],
        }}
        onImport={async (rows) => (await importStudents({ rows: rows as any })) as any}
      />
    </div>
  );
}

export function CreateStudentDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (args: {
    nis: string;
    name: string;
    gender: "L" | "P";
    className: string;
    dormitory?: string;
    room?: string;
  }) => Promise<unknown>;
}) {
  const [form, setForm] = useState({
    nis: "",
    name: "",
    gender: "L" as "L" | "P",
    className: "",
    dormitory: "",
    room: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onCreate({
        nis: form.nis.trim(),
        name: form.name.trim(),
        gender: form.gender,
        className: form.className.trim(),
        dormitory: form.dormitory.trim() || undefined,
        room: form.room.trim() || undefined,
      });
      onOpenChange(false);
      setForm({ nis: "", name: "", gender: "L", className: "", dormitory: "", room: "" });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Santri Baru</DialogTitle>
          <DialogDescription>
            Wallet dan kartu RFID akan dibuat otomatis. Saldo dimulai dari nol dan hanya dapat
            berubah melalui ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>NIS</Label>
            <Input
              value={form.nis}
              onChange={(e) => setForm({ ...form, nis: e.target.value })}
              placeholder="26013"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Jenis Kelamin</Label>
            <Select
              value={form.gender}
              onValueChange={(v) => setForm({ ...form, gender: v as "L" | "P" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="L">Laki-laki</SelectItem>
                <SelectItem value="P">Perempuan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nama Lengkap</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nama Santri"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Kelas</Label>
            <Input
              value={form.className}
              onChange={(e) => setForm({ ...form, className: e.target.value })}
              placeholder="XII-A"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Asrama</Label>
            <Input
              value={form.dormitory}
              onChange={(e) => setForm({ ...form, dormitory: e.target.value })}
              placeholder="Asrama Putra 1"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nomor Kamar</Label>
            <Input
              value={form.room}
              onChange={(e) => setForm({ ...form, room: e.target.value })}
              placeholder="A-101"
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <WalletIcon className="h-4 w-4" /> Simpan & Buat Wallet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
