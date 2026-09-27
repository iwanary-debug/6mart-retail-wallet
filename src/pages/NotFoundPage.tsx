import { Link } from "react-router-dom";
import { Compass, Store, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="sixmart-grid flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
        <Compass className="h-8 w-8" />
      </div>

      <p className="mt-8 font-mono text-sm font-semibold tracking-[0.3em] text-accent">
        404
      </p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        Halaman tidak ditemukan
      </h1>
      <p className="mt-3 max-w-md text-muted-foreground">
        Alamat yang Anda tuju tidak tersedia di 6Mart. Periksa kembali tautan
        atau kembali ke halaman utama.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button asChild>
          <Link to="/">
            <Store className="mr-2 h-4 w-4" />
            Beranda
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/app">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Ke Dashboard
          </Link>
        </Button>
      </div>
    </div>
  );
}
