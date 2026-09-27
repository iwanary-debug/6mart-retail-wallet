import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Store, LogIn, Loader2, AlertCircle, ArrowLeft, ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label, Badge } from "@/components/ui/label";

const DEMO_ACCOUNTS = [
  { role: "Super Admin", email: "admin@6mart.test" },
  { role: "Manager", email: "manager@6mart.test" },
  { role: "Kasir", email: "cashier@6mart.test" },
  { role: "Finance", email: "finance@6mart.test" },
  { role: "Inventory", email: "inventory@6mart.test" },
];

export default function AuthPage() {
  const { signIn, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = params.get("returnTo");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate(returnTo && returnTo.startsWith("/") ? returnTo : "/app", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, returnTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal masuk";
      setError(
        /password|credential|invalid|unauthorized|not found/i.test(message)
          ? "Email atau password salah. Periksa kembali data Anda."
          : message,
      );
      setBusy(false);
    }
  }

  function fillDemo(demoEmail: string) {
    setEmail(demoEmail);
    setPassword("6mart2026");
    setError(null);
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Panel kiri */}
      <div className="relative hidden w-1/2 overflow-hidden bg-primary lg:block">
        <div className="sixmart-grid absolute inset-0 opacity-20" />
        <div className="absolute -right-20 top-20 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-foreground/15">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold">6Mart</p>
              <p className="text-sm text-primary-foreground/70">PIAT 6 Bondowoso</p>
            </div>
          </div>

          <div className="max-w-md">
            <h2 className="text-4xl font-extrabold leading-tight">
              Retail & Student Wallet
            </h2>
            <p className="mt-4 text-primary-foreground/80">
              Satu sistem untuk kasir, wallet santri, inventory, dan akuntansi. Setiap transaksi
              tercatat, setiap rupiah dapat ditelusuri.
            </p>
            <div className="mt-8 space-y-3 text-sm">
              {[
                "Kasir cepat dengan identifikasi RFID & QR",
                "Saldo hanya berubah melalui ledger",
                "Jurnal akuntansi otomatis untuk setiap transaksi",
              ].map((t) => (
                <div key={t} className="flex items-center gap-2.5">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span className="text-primary-foreground/85">{t}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-primary-foreground/50">
            6Mart Retail & Student Wallet System · Versi 1.0
          </p>
        </div>
      </div>

      {/* Panel kanan */}
      <div className="flex w-full flex-col justify-center px-4 py-10 lg:w-1/2">
        <div className="mx-auto w-full max-w-md">
          <Button asChild variant="ghost" size="sm" className="mb-6 -ml-2">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" /> Kembali ke Beranda
            </Link>
          </Button>

          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold">6Mart</p>
              <p className="text-xs text-muted-foreground">PIAT 6 Bondowoso</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Masuk ke 6Mart</CardTitle>
              <CardDescription>
                Gunakan akun staff Anda. Hubungi Super Admin bila belum memiliki akun.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    placeholder="nama@6mart.test"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Memproses…
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" /> Masuk
                    </>
                  )}
                </Button>
              </form>

              <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Akun Demo
                  </p>
                  <Badge variant="warning">Development</Badge>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Password demo: <code className="font-mono">6mart2026</code> — klik untuk isi
                  otomatis.
                </p>
                <div className="space-y-1">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.email}
                      type="button"
                      onClick={() => fillDemo(a.email)}
                      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-background"
                    >
                      <span className="font-medium">{a.role}</span>
                      <span className="font-mono text-muted-foreground">{a.email}</span>
                    </button>
                  ))}
                </div>
                <Button asChild variant="link" size="sm" className="mt-2 h-auto p-0 text-xs">
                  <Link to="/info">Lihat detail akun demo & fitur →</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
