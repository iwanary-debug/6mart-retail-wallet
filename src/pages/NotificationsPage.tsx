import { useMutation, useQuery } from "convex/react";
import { Bell, CheckCheck, AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { api } from "../convex/_generated/api";
import {
  PageHeader,
  LoadingState,
  EmptyState,
  timeAgo,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ICONS: Record<string, any> = {
  INFO: Info,
  SUCCESS: CheckCircle2,
  WARNING: AlertTriangle,
  ERROR: XCircle,
};

const STYLES: Record<string, string> = {
  INFO: "border-border",
  SUCCESS: "border-success/40",
  WARNING: "border-warning/40",
  ERROR: "border-destructive/40",
};

export default function NotificationsPage() {
  const list = useQuery(api.settings.listNotifications, { limit: 60 });
  const markRead = useMutation(api.settings.markRead);

  if (list === undefined) return <LoadingState label="Memuat notifikasi…" />;
  if ("error" in list) return <AlertBannerError message={String(list.error)} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifikasi"
        description="Peringatan sistem: stok menipis, transaksi gagal, selisih kas, dan status wallet."
        action={
          list.unread > 0 ? (
            <Button variant="outline" onClick={() => markRead({})}>
              <CheckCheck className="h-4 w-4" /> Tandai Semua Dibaca
            </Button>
          ) : undefined
        }
      />

      {list.items.length === 0 ? (
        <EmptyState
          title="Tidak ada notifikasi"
          description="Notifikasi muncul otomatis saat ada aktivitas penting."
          icon={Bell}
        />
      ) : (
        <div className="space-y-2">
          {list.items.map((n) => {
            const Icon = ICONS[n.severity] ?? Info;
            return (
              <Card
                key={n._id}
                className={cn(STYLES[n.severity], !n.isRead && "bg-primary/[0.03]")}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                      n.severity === "ERROR"
                        ? "bg-destructive/10 text-destructive"
                        : n.severity === "WARNING"
                          ? "bg-warning/10 text-warning"
                          : n.severity === "SUCCESS"
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium">{n.title}</p>
                      {!n.isRead && <Badge>Baru</Badge>}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => markRead({ id: n._id })}
                    >
                      <CheckCheck className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AlertBannerError({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
      {message}
    </div>
  );
}
