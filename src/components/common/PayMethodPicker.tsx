import { Banknote, Wallet } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type PayOnSiteMethod = "CASH" | "WALLET";

interface PayMethodPickerProps {
  /** Nominal yang akan dibayar, untuk ditampilkan pada tombol wallet. */
  amount: number;
  walletBalance: number | null;
  method: PayOnSiteMethod;
  onMethodChange: (m: PayOnSiteMethod) => void;
  /** Nonaktifkan pilihan wallet bila pelanggan tidak punya saldo/referensi. */
  walletUsable?: boolean;
  hint?: string;
}

/**
 * Pilihan skema pembayaran di tempat.
 *
 * Dipakai di form order laundry, booking barbershop, dan order jastip
 * supaya kasir bisa langsung membayar di halaman tersebut — tanpa perlu
 * membuka fitur kasir.
 */
export function PayMethodPicker({
  amount,
  walletBalance,
  method,
  onMethodChange,
  walletUsable = true,
  hint,
}: PayMethodPickerProps) {
  const walletOk = walletUsable && walletBalance !== null;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-baseline justify-between">
        <Label>Bayar di tempat</Label>
        <span className="text-sm font-bold tabular-nums">
          Rp {amount.toLocaleString("id-ID")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => onMethodChange("CASH")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors",
            method === "CASH"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background hover:bg-muted",
          )}
        >
          <Banknote className="h-4 w-4" /> Tunai
        </button>
        <button
          type="button"
          onClick={() => onMethodChange("WALLET")}
          disabled={!walletOk}
          title={
            walletOk
              ? undefined
              : "Pilih pelanggan Santri agar bisa membayar dari wallet"
          }
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            method === "WALLET"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background hover:bg-muted",
          )}
        >
          <Wallet className="h-4 w-4" /> Wallet
        </button>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {hint ??
          (walletOk
            ? "Pesanan langsung dibayar dan tercatat di penjualan. Tidak perlu buka halaman kasir."
            : "Pilih metode Tunai, atau pilih pelanggan Santri untuk bisa bayar dari wallet.")}
      </p>
    </div>
  );
}
