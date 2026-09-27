import { Navigate, useLocation, Link } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function RequireAuth({
  children,
  anyPermission,
}: {
  children: React.ReactNode;
  anyPermission?: string[];
}) {
  const { isLoading, isAuthenticated, canAny } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Memuat sesi Anda…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?returnTo=${returnTo}`} replace />;
  }

  if (anyPermission && anyPermission.length > 0 && !canAny(...anyPermission)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <ShieldAlert className="h-10 w-10 text-destructive" />
            <h2 className="text-lg font-semibold">Akses Ditolak</h2>
            <p className="text-sm text-muted-foreground">
              Role Anda tidak memiliki izin untuk membuka halaman ini. Hubungi Super Admin bila
              Anda merasa ini adalah kekeliruan.
            </p>
            <Button asChild variant="outline" className="mt-2">
              <Link to="/app">Kembali ke Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
