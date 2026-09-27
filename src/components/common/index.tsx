import type { ReactNode } from "react";
import { Loader2, Inbox, AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRupiah, formatRupiahShort } from "@/lib/money";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumb?: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {breadcrumb}
          </p>
        )}
        <h1 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    primary: "text-primary",
  };
  return (
    <div className={cn("stat-tile", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {Icon && (
          <span className="rounded-md bg-primary/10 p-1.5 text-primary">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p className={cn("mt-2 text-2xl font-bold tabular-nums tracking-tight", tones[tone])}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Money({ value, short, className }: { value: number; short?: boolean; className?: string }) {
  return (
    <span className={cn("tabular-nums", className)}>
      {short ? formatRupiahShort(value) : formatRupiah(value)}
    </span>
  );
}

export function LoadingState({ label = "Memuat data…" }: { label?: string }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        {description && (
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-destructive/30">
      <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
        <XCircle className="h-8 w-8 text-destructive" />
        <div>
          <p className="font-medium text-destructive">Gagal memuat data</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
        </div>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Coba Lagi
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

const ALERT_STYLES = {
  INFO: { icon: Info, cls: "border-border bg-muted/50 text-foreground" },
  SUCCESS: { icon: CheckCircle2, cls: "border-success/30 bg-success/10 text-foreground" },
  WARNING: { icon: AlertTriangle, cls: "border-warning/40 bg-warning/10 text-foreground" },
  ERROR: { icon: XCircle, cls: "border-destructive/30 bg-destructive/10 text-foreground" },
} as const;

export function AlertBanner({
  variant = "INFO",
  title,
  children,
}: {
  variant?: keyof typeof ALERT_STYLES;
  title?: string;
  children: ReactNode;
}) {
  const style = ALERT_STYLES[variant];
  const Icon = style.icon;
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border p-3.5", style.cls)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && "mt-0.5", "text-muted-foreground")}>{children}</div>
      </div>
    </div>
  );
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("id-ID", { timeStyle: "short" });
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "baru saja";
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return formatDate(ts);
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "string") return data;
  }
  if (error instanceof Error) return error.message;
  return "Terjadi kesalahan yang tidak diketahui";
}
