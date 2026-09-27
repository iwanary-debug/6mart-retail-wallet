import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Penangkap error render di level aplikasi.
 *
 * Tanpa batas error, satu exception saat render membuat React melepas seluruh
 * pohon DOM dan pengguna hanya melihat layar putih tanpa penjelasan apa pun.
 * Komponen ini memastikan setiap kegagalan tetap tampil sebagai pesan yang
 * bisa dibaca, plus cara untuk mencoba ulang.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Tetap dicatat di console agar mudah ditelusuri saat development.
    console.error("6Mart: render gagal", error, info.componentStack);
  }

  private readonly reload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="max-w-lg">
          <CardHeader className="text-center">
            <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
            <CardTitle className="mt-2">Halaman gagal ditampilkan</CardTitle>
            <CardDescription>
              Terjadi kesalahan saat memuat tampilan. Data Anda aman — tidak ada transaksi yang
              tersimpan sebagian.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              {error.message}
            </pre>
            <Button className="w-full" onClick={this.reload}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Muat Ulang Halaman
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}
