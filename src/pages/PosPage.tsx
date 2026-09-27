import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  ScanBarcode,
  Search,
  Trash2,
  Plus,
  Minus,
  Wallet,
  Banknote,
  User,
  CheckCircle2,
  Printer,
  Lock,
  Unlock,
  ShoppingCart,
  Radio,
  X,
  Loader2,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import {
  PageHeader,
  Money,
  AlertBanner,
  EmptyState,
  errorMessage,
  formatTime,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatNumber, formatRupiah } from "@/lib/money";
import { cn } from "@/lib/utils";

interface CartLine {
  productId: string;
  name: string;
  unit: string;
  sellingPrice: number;
  stock: number;
  quantity: number;
  discount: number;
}

interface IdentifiedStudent {
  studentId: string;
  name: string;
  nis: string;
  className: string;
  balance: number;
  walletVersion: number;
  method: "RFID" | "QR" | "NIS" | "MANUAL";
  cardCode?: string;
}

const newKey = () =>
  `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export default function PosPage() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [term, setTerm] = useState("");
  const [student, setStudent] = useState<IdentifiedStudent | null>(null);
  const [rfidInput, setRfidInput] = useState("");
  const [payMethod, setPayMethod] = useState<"WALLET" | "CASH" | "MIXED">("WALLET");
  const [walletUse, setWalletUse] = useState(0);
  const [cashGiven, setCashGiven] = useState<number | "">("");
  const [shiftOpen, setShiftOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState<number | "">("");
  const [shiftDialog, setShiftDialog] = useState(false);
  const [closingDialog, setClosingDialog] = useState(false);
  const [actualCash, setActualCash] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<any>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const rfidRef = useRef<HTMLInputElement>(null);
  const startedAt = useRef<number>(Date.now());

  const currentShift = useQuery(api.sales.currentShift, {});
  const productsQuery = useQuery(api.products.searchForPos, { term, limit: 24 });
  const allProducts = useQuery(api.products.listProducts, { limit: 500 });
  const settings = useQuery(api.settings.getAll, {});

  const openShift = useMutation(api.sales.openShift);
  const closeShift = useMutation(api.sales.closeShift);
  const checkout = useMutation(api.sales.checkout);
  const identifyStudent = useMutation(api.students.identifyForPos);

  const open = currentShift != null && !("error" in currentShift);
  useEffect(() => {
    setShiftOpen(!!open);
  }, [open]);

  // ------------------------------------------------------------ calculations ----
  const subtotal = useMemo(
    () => cart.reduce((s, l) => s + l.sellingPrice * l.quantity, 0),
    [cart],
  );
  const lineDiscount = useMemo(
    () => cart.reduce((s, l) => s + l.discount, 0),
    [cart],
  );
  const total = Math.max(0, subtotal - lineDiscount);
  const walletAmount = payMethod === "WALLET" ? total : payMethod === "MIXED" ? walletUse : 0;
  const cashAmount = Math.max(0, total - walletAmount);
  const cashGivenNum = typeof cashGiven === "number" ? cashGiven : 0;
  const change = Math.max(0, cashGivenNum - total);
  const insufficient =
    student !== null && walletAmount > student.balance;
  const canPay = cart.length > 0 && total > 0 && (walletAmount > 0 || cashAmount > 0);

  // ------------------------------------------------------------ cart actions ----
  const addToCart = useCallback((p: {
    _id: string;
    name: string;
    unit: string;
    sellingPrice: number;
    stock: number;
    trackInventory: boolean;
  }) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p._id);
      if (existing) {
        if (p.trackInventory && existing.quantity + 1 > p.stock) {
          setError(`Stok "${p.name}" hanya ${p.stock} ${p.unit}`);
          return prev;
        }
        return prev.map((l) =>
          l.productId === p._id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          productId: p._id,
          name: p.name,
          unit: p.unit,
          sellingPrice: p.sellingPrice,
          stock: p.stock,
          quantity: 1,
          discount: 0,
        },
      ];
    });
    setError(null);
  }, []);

  const changeQty = useCallback((productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.productId !== productId) return l;
          const next = l.quantity + delta;
          if (next < 1) return l;
          if (next > l.stock) return l;
          return { ...l, quantity: next };
        })
        .filter((l) => l.quantity > 0),
    );
  }, []);

  const setLineDiscount = useCallback((productId: string, value: number) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l;
        const max = l.sellingPrice * l.quantity;
        return { ...l, discount: Math.max(0, Math.min(value, max)) };
      }),
    );
  }, []);

  const resetCart = () => {
    setCart([]);
    setStudent(null);
    setCashGiven("");
    setWalletUse(0);
    setPayMethod("WALLET");
    setSuccess(null);
    startedAt.current = Date.now();
    searchRef.current?.focus();
  };

  // ------------------------------------------------------------ identification ----
  const [manualNis, setManualNis] = useState("");

  async function identifyBy(
    value: string,
    method: "NIS" | "RFID" | "QR",
  ) {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await identifyStudent(
        method === "RFID" ? { rfidUid: value.trim() } : { nis: value.trim() },
      );
      setStudent({
        studentId: res.studentId,
        name: res.name,
        nis: res.nis,
        className: res.className,
        balance: res.balance,
        walletVersion: res.version,
        method: res.method,
        cardCode: res.cardCode,
      });
      if (method === "RFID") setRfidInput("");
      if (method === "NIS") setManualNis("");
      setPayMethod("WALLET");
      setWalletUse(0);
    } catch (err) {
      setError(errorMessage(err));
      setStudent(null);
    } finally {
      setBusy(false);
    }
  }

  // Barcode: Enter pada kolom pencarian langsung menambah ke keranjang.
  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = (productsQuery && !("error" in productsQuery) ? productsQuery : [])[0];
    if (found) {
      addToCart(found);
      setTerm("");
      searchRef.current?.focus();
    }
  }

  // ------------------------------------------------------------ checkout ----
  async function doCheckout() {
    if (!canPay || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await checkout({
        items: cart.map((l) => ({ productId: l.productId as any, quantity: l.quantity })),
        studentId: student?.studentId as any,
        identificationMethod: student?.method,
        walletAmount,
        cashAmount,
        idempotencyKey: newKey(),
      });
      setSuccess({ ...res, elapsed: Date.now() - startedAt.current });
      setCart([]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const productList =
    term.trim().length > 0
      ? ((productsQuery && !("error" in productsQuery) ? productsQuery : []) as any[])
      : ((allProducts && !("error" in allProducts) ? allProducts.items : []) as any[]).slice(0, 24);

  if (!shiftOpen) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Kasir"
          description="Shift kasir belum terbuka. Buka shift untuk memulai transaksi penjualan."
        />
        <AlertBanner variant="WARNING" title="Shift belum terbuka">
          Semua transaksi penjualan membutuhkan shift kasir yang terbuka. Ini memastikan setiap
          uang tunai tercatat dan dapat dihitung pada saat tutup shift.
        </AlertBanner>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <Lock className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-semibold">Tidak ada shift terbuka</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Masukkan modal awal yang ada di laci kas untuk membuka shift.
              </p>
            </div>
            <Button onClick={() => setShiftDialog(true)}>
              <Unlock className="h-4 w-4" /> Buka Shift Kasir
            </Button>
          </CardContent>
        </Card>

        <ShiftOpenDialog
          open={shiftDialog}
          onOpenChange={setShiftDialog}
          value={openingCash}
          onChange={setOpeningCash}
          busy={busy}
          onSubmit={async () => {
            setBusy(true);
            try {
              await openShift({ openingCash: Number(openingCash) || 0 });
              setShiftDialog(false);
              setOpeningCash("");
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kasir"
        description="Scan barang → identifikasi santri → cek saldo → selesai."
        action={
          <>
            <Button variant="outline" onClick={() => setClosingDialog(true)}>
              <Lock className="h-4 w-4" /> Tutup Shift
            </Button>
            <Button variant="secondary" onClick={resetCart} disabled={cart.length === 0}>
              <X className="h-4 w-4" /> Kosongkan
            </Button>
          </>
        }
      />

      {error && <AlertBanner variant="ERROR" title="Transaksi gagal">{error}</AlertBanner>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Kiri: produk + keranjang */}
        <div className="space-y-4 lg:col-span-2">
          {/* Scan bar */}
          <div className="grid gap-3 sm:grid-cols-2">
            <form onSubmit={onSearchSubmit} className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                <ScanBarcode className="mr-1 inline h-3.5 w-3.5" /> Scan / Cari Barang
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Barcode atau nama produk, lalu Enter"
                  className="pl-9"
                  autoFocus
                />
              </div>
            </form>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                <Radio className="mr-1 inline h-3.5 w-3.5" /> Tap RFID
              </label>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (rfidInput.trim()) identifyBy(rfidInput.trim(), "RFID");
                }}
              >
                <Input
                  ref={rfidRef}
                  value={rfidInput}
                  onChange={(e) => setRfidInput(e.target.value)}
                  placeholder="Aktifkan RFID reader lalu tap kartu"
                />
              </form>
            </div>
          </div>

          {/* Produk */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                {term ? `Hasil pencarian (${productList.length})` : "Produk cepat"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {productList.length === 0 ? (
                <EmptyState
                  title={term ? "Produk tidak ditemukan" : "Belum ada produk"}
                  description={
                    term
                      ? "Coba barcode atau nama lain."
                      : "Tambahkan produk terlebih dahulu di menu Produk."
                  }
                  icon={Search}
                />
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {productList.map((p) => {
                    const out = p.trackInventory && p.stock <= 0;
                    return (
                      <button
                        key={p._id}
                        type="button"
                        disabled={out}
                        onClick={() => addToCart(p)}
                        className={cn(
                          "rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-primary/50 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-45",
                          out && "line-through",
                        )}
                      >
                        <p className="line-clamp-2 text-xs font-semibold leading-tight">{p.name}</p>
                        <p className="mt-1 text-sm font-bold text-primary tabular-nums">
                          {formatNumber(p.sellingPrice, 0)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Stok {formatNumber(p.stock, 0)} {p.unit}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Kanan: keranjang + pembayaran */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" /> Keranjang
                </span>
                <Badge variant="muted">{cart.length} item</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {cart.length === 0 ? (
                <EmptyState
                  title="Keranjang kosong"
                  description="Scan barcode atau klik produk untuk menambahkan."
                  icon={ShoppingCart}
                />
              ) : (
                <>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {cart.map((l) => (
                      <div key={l.productId} className="rounded-md border border-border p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 flex-1 text-xs font-medium">{l.name}</p>
                          <button
                            type="button"
                            onClick={() =>
                              setCart((prev) => prev.filter((x) => x.productId !== l.productId))
                            }
                            className="text-muted-foreground hover:text-destructive"
                            aria-label="HapusSantri"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-6 w-6"
                              onClick={() => changeQty(l.productId, -1)}
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <span className="w-8 text-center text-xs font-semibold tabular-nums">
                              {formatNumber(l.quantity, 0)}
                            </span>
                            <Button
                              size="icon"
                              variant="outline"
                              className="h-6 w-6"
                              onClick={() => changeQty(l.productId, 1)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold tabular-nums">
                              <Money value={l.sellingPrice * l.quantity - l.discount} />
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatNumber(l.sellingPrice, 0)}/{l.unit}
                            </p>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground">Diskon item</span>
                          <Input
                            className="h-6 px-1.5 py-0 text-right text-[11px]"
                            value={l.discount || ""}
                            placeholder="0"
                            inputMode="numeric"
                            onChange={(e) =>
                              setLineDiscount(l.productId, Number(e.target.value) || 0)
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-1 border-t border-border pt-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span className="tabular-nums">
                        <Money value={subtotal} />
                      </span>
                    </div>
                    {lineDiscount > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Diskon</span>
                        <span className="tabular-nums text-destructive">
                          −<Money value={lineDiscount} />
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold">
                      <span>Total</span>
                      <span className="tabular-nums text-primary">
                        <Money value={total} />
                      </span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Identifikasi & Pembayaran */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Pembayaran</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Santri */}
              <div className="rounded-lg border border-border p-3">
                {student ? (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-semibold">
                          <User className="h-3.5 w-3.5" />
                          <span className="truncate">{student.name}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          NIS {student.nis} · {student.className} · {student.method}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStudent(null)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="HapusSantri"

                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2">
                      <span className="text-xs text-muted-foreground">Saldo Wallet</span>
                      <span className="font-bold tabular-nums text-primary">
                        <Money value={student.balance} />
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Ketik NIS untuk pembayaran wallet (fallback identifier):
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (manualNis.trim()) identifyBy(manualNis, "NIS");
                      }}
                      className="flex gap-1.5"
                    >
                      <Input
                        value={manualNis}
                        onChange={(e) => setManualNis(e.target.value)}
                        placeholder="contoh: 26001"
                      />
                      <Button type="submit" variant="secondary" disabled={busy}>
                        <Search className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                )}
              </div>

              {/* Metode */}
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { key: "WALLET", label: "Wallet", icon: Wallet, needStudent: true },
                    { key: "CASH", label: "Tunai", icon: Banknote, needStudent: false },
                    { key: "MIXED", label: "Campur", icon: Wallet, needStudent: true },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setPayMethod(m.key)}
                    disabled={m.needStudent && !student}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      payMethod === m.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    <m.icon className="h-4 w-4" />
                    {m.label}
                  </button>
                ))}
              </div>

              {payMethod === "MIXED" && student && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">
                    Nominal dari wallet (maks <Money value={Math.min(total, student.balance)} />)
                  </label>
                  <Input
                    value={walletUse || ""}
                    inputMode="numeric"
                    placeholder="0"
                    onChange={(e) =>
                      setWalletUse(
                        Math.max(0, Math.min(Number(e.target.value) || 0, total, student.balance)),
                      )
                    }
                  />
                </div>
              )}

              {cashAmount > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">
                    Uang diterima (kembalian: <Money value={change} />)
                  </label>
                  <Input
                    value={cashGiven}
                    inputMode="numeric"
                    placeholder="0"
                    onChange={(e) => setCashGiven(Number(e.target.value) || "")}
                  />
                </div>
              )}

              {insufficient && (
                <AlertBanner variant="ERROR" title="Saldo tidak cukup">
                  Kurang{" "}
                  <strong>
                    <Money value={walletAmount - student.balance} />
                  </strong>
                  . Pilih pembayaran tunai atau turunkan nominal.
                </AlertBanner>
              )}

              <Button
                size="xl"
                className="w-full"
                onClick={doCheckout}
                disabled={!canPay || busy || insufficient}
              >
                {busy ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Memproses…
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-5 w-5" /> Selesaikan — <Money value={total} />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ReceiptDialog
        result={success}
        onClose={resetCart}
        storeName={settings && !("error" in settings) ? settings.storeName : "6Mart"}
        onPrint={() => window.print()}
      />

      <ShiftCloseDialog
        open={closingDialog}
        onOpenChange={setClosingDialog}
        shiftId={currentShift && !("error" in currentShift) ? currentShift._id : null}
        value={actualCash}
        onChange={setActualCash}
        busy={busy}
        onSubmit={async () => {
          if (!currentShift || "error" in currentShift) return;
          setBusy(true);
          try {
            await closeShift({
              shiftId: currentShift._id,
              actualCash: Number(actualCash) || 0,
            });
            setClosingDialog(false);
            setActualCash("");
            setCart([]);
            setStudent(null);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------ dialogs ----

function ShiftOpenDialog({
  open,
  onOpenChange,
  value,
  onChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: number | "";
  onChange: (v: number | "") => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Buka Shift Kasir</DialogTitle>
          <DialogDescription>
            Masukkan nominal uang yang ada di laci kas saat shift dibuka.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Modal Awal (Rp)</label>
          <Input
            value={value}
            inputMode="numeric"
            placeholder="200000"
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlock className="h-4 w-4" />}
            Buka Shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShiftCloseDialog({
  open,
  onOpenChange,
  shiftId,
  value,
  onChange,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shiftId: string | null;
  value: number | "";
  onChange: (v: number | "") => void;
  busy: boolean;
  onSubmit: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);
  const shift = useQuery(
    api.sales.shiftDetail,
    shiftId ? { shiftId: shiftId as any } : "skip",
  );

  useEffect(() => {
    if (open && shift && !("error" in shift)) {
      const s = (shift as any).shift;
      setDetail({
        expectedCash: s.expectedCash,
        cashSales: s.cashSales,
        openingCash: s.openingCash,
      });
    }
  }, [open, shift]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Tutup Shift Kasir</DialogTitle>
          <DialogDescription>
            Hitung kas fisik yang ada lalu masukkan nominalnya. Selisih akan tercatat di audit log.
          </DialogDescription>
        </DialogHeader>

        {detail && (
          <div className="space-y-1 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Modal awal</span>
              <span className="tabular-nums">{formatRupiah(detail.openingCash)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Penjualan tunai</span>
              <span className="tabular-nums">{formatRupiah(detail.cashSales)}</span>
            </div>
            <div className="flex justify-between font-bold">
              <span>Harus ada</span>
              <span className="tabular-nums">{formatRupiah(detail.expectedCash)}</span>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Kas Aktual (Rp)</label>
          <Input
            value={value}
            inputMode="numeric"
            placeholder="0"
            onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
            autoFocus
          />
        </div>

        {detail && typeof value === "number" && (
          <AlertBanner
            variant={value - detail.expectedCash === 0 ? "SUCCESS" : "WARNING"}
            title={
              value - detail.expectedCash === 0
                ? "Kas sesuai"
                : `Selisih ${value - detail.expectedCash > 0 ? "lebih" : "kurang"} ${formatRupiah(Math.abs(value - detail.expectedCash))}`
            }
          >
            Expected {formatRupiah(detail.expectedCash)} · Aktual {formatRupiah(value)}
          </AlertBanner>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={onSubmit} disabled={busy || !shiftId}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            Tutup Shift
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptDialog({
  result,
  onClose,
  storeName,
  onPrint,
}: {
  result: any;
  onClose: () => void;
  storeName: string;
  onPrint: () => void;
}) {
  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-success">
            <CheckCircle2 className="h-5 w-5" /> Transaksi Berhasil
          </DialogTitle>
          <DialogDescription>
            Selesai dalam {(result?.elapsed ?? 0)} ms · {result?.code}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-dashed border-border bg-muted/40 p-4 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{storeName}</p>
          <p className="mt-1 font-mono text-sm">{result?.code}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {result ? formatTime(Date.now()) : ""}
          </p>

          <div className="my-3 border-t border-dashed border-border" />

          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-extrabold tabular-nums">
            <Money value={result?.total ?? 0} />
          </p>

          <div className="my-3 border-t border-dashed border-border" />

          <div className="space-y-1 text-left text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Metode</span>
              <span className="font-medium">
                {result?.paymentMethod === "WALLET"
                  ? "Wallet"
                  : result?.paymentMethod === "CASH"
                    ? "Tunai"
                    : "Campuran"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Santri</span>
              <span className="font-medium">{result?.studentName ?? "Umum"}</span>
            </div>
            {result?.balanceAfter !== null && result?.balanceAfter !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sisa saldo</span>
                <span className="font-semibold text-primary">
                  <Money value={result.balanceAfter} />
                </span>
              </div>
            )}
            {result?.changeAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kembalian</span>
                <span className="font-semibold">
                  <Money value={result.changeAmount} />
                </span>
              </div>
            )}
          </div>

          <p className="mt-3 text-[10px] text-muted-foreground">
            Terima kasih telah berbelanja.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onPrint}>
            <Printer className="h-4 w-4" /> Cetak
          </Button>
          <Button onClick={onClose}>Transaksi Baru</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
