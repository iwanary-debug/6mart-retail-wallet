import { useState } from "react";
import { useQuery } from "convex/react";
import { ScrollText, Search, Download } from "lucide-react";
import { api } from "../convex/_generated/api";
import {
  PageHeader,
  StatCard,
  LoadingState,
  ErrorState,
  EmptyState,
  formatDateTime,
  downloadCsv,
} from "@/components/common";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export default function AuditPage() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");

  const list = useQuery(api.audit.list, {
    search: search || undefined,
    action: action || undefined,
    limit: 200,
  });
  const summary = useQuery(api.audit.summary, { days: 30 });
  const csv = useQuery(api.audit.exportCsv, {});

  if (list === undefined) return <LoadingState label="Memuat audit log…" />;
  if ("error" in list) return <ErrorState message={String(list.error)} />;

  const s = summary && !("error" in summary) ? summary : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Log"
        description="Jejak audit semua aktivitas penting: login, transaksi, wallet, inventory, akuntansi, dan konfigurasi."
        action={
          csv !== undefined ? (
            <Button
              variant="outline"
              onClick={() => downloadCsv("audit-log.csv", csv)}
            >
              <Download className="h-4 w-4" /> Ekspor CSV
            </Button>
          ) : undefined
        }
      />

      {s && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Aksi (30 hari)" value={String(s.total)} icon={ScrollText} tone="primary" />
          <StatCard
            label="Jenis Aksi"
            value={String(s.actions.length)}
            hint={`${s.entityTypes.length} entitas`}
          />
          <StatCard
            label="Pengguna Aktif"
            value={String(s.byUser.length)}
            hint={s.byUser[0]?.name}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari aksi, user, atau entitas…"
            className="pl-9"
          />
        </div>
        {s && (
          <select
            className="h-9 rounded-lg border border-input bg-background px-2 text-sm sm:w-56"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="">Semua aksi</option>
            {s.actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {list.items.length === 0 ? (
            <EmptyState title="Belum ada audit log" icon={ScrollText} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Pengguna</TableHead>
                  <TableHead>Aksi</TableHead>
                  <TableHead>Entitas</TableHead>
                  <TableHead>Perubahan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(a.createdAt)}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{a.userName}</p>
                      {a.userRole && (
                        <p className="text-[10px] text-muted-foreground">{a.userRole}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={severityVariant(a.action)}
                        className="font-mono text-[10px]"
                      >
                        {a.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.entityType}
                      {a.entityId && (
                        <span className="ml-1 font-mono text-[10px] opacity-70">
                          {a.entityId.slice(0, 8)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm">
                      <p className="truncate text-xs text-muted-foreground">
                        {a.newValue ?? a.note ?? "—"}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Menampilkan {list.items.length} dari {list.total} entri
      </p>
    </div>
  );
}

function severityVariant(action: string): any {
  if (/DELETE|ARCHIVE|VOID|ADJUST_WALLET|WITHDRAWAL/.test(action)) return "destructive";
  if (/CREATE|TOPUP|LOGIN/.test(action)) return "success";
  if (/UPDATE|SET_/.test(action)) return "secondary";
  return "muted";
}
