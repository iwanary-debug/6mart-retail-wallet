import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Nfc,
  QrCode,
  Plus,
  Ban,
  RefreshCw,
  Wallet as WalletIcon,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Download,
  CreditCard,
  History,
  Users as UsersIcon,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  PageHeader,
  Money,
  LoadingState,
  ErrorState,
  EmptyState,
  errorMessage,
  formatDateTime,
} from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label, Badge } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PERMISSIONS } from "@/lib/rbac";
import { formatNumber } from "@/lib/money";

const TYPE_LABELS: Record<string, string> = {
  TOPUP: "Top Up",
  PURCHASE: "Pembelian",
  WITHDRAWAL: "Penarikan",
  REFUND: "Retur",
  ADJUSTMENT: "Penyesuaian",
  LAUNDRY: "Laundry",
  BARBERSHOP: "Barbershop",
  JASTIP: "Jastip",
  PPOB: "PPOB",
};

export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useAuth();
  const detail = useQuery(api.students.get, { id: id as any });
  const [rfidOpen, setRfidOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState<"TOPUP" | "WITHDRAW" | "ADJUST" | null>(null);

  const registerCard = useMutation(api.students.registerCard);
  const linkRfid = useMutation(api.students.linkRfid);
  const blockCard = useMutation(api.students.blockCard);
  const replaceCard = useMutation(api.students.replaceCard);
  const regenQr = useMutation(api.students.regenerateQr);
  const topUp = useMutation(api.wallets.topUp);
  const withdraw = useMutation(api.wallets.withdraw);
  const adjust = useMutation(api.wallets.adjust);

  if (detail === undefined) return <LoadingState label="Memuat data santri…" />;
  if ("error" in detail) return <ErrorState message={String(detail.error)} />;

  const d = detail as any;
  const activeCard = d.cards.find((c: any) => c.status === "ACTIVE");
  const cardHistory = d.cards.filter((c: any) => c.status !== "ACTIVE");

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/app/santri">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Santri
        </Link>
      </Button>

      <PageHeader
        title={d.student.name}
        breadcrumb={`Santri / ${d.student.nis}`}
        description={`${d.student.className} · ${d.student.dormitory ?? "—"} ${d.student.room ? `/ ${d.student.room}` : ""} · ${d.student.gender === "L" ? "Laki-laki" : "Perempuan"}`}
        action={
          can(PERMISSIONS.WALLET_TOPUP) && (
            <>
              <Button variant="outline" onClick={() => setMoneyOpen("TOPUP")}>
                <ArrowDownToLine className="h-4 w-4" /> Top Up
              </Button>
              <Button variant="outline" onClick={() => setMoneyOpen("WITHDRAW")}>
                <ArrowUpFromLine className="h-4 w-4" /> Tarik
              </Button>
              {can(PERMISSIONS.WALLET_ADJUST) && (
                <Button onClick={() => setMoneyOpen("ADJUST")}>
                  <WalletIcon className="h-4 w-4" /> Penyesuaian
                </Button>
              )}
            </>
          )
        }
      />

      {/* Ringkasan */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="sm:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-muted-foreground">Saldo Wallet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-extrabold tabular-nums text-primary">
              <Money value={d.wallet?.currentBalance ?? 0} />
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant={d.wallet?.status === "ACTIVE" ? "success" : "warning"}>
                {d.wallet?.status ?? "TIDAK ADA WALLET"}
              </Badge>
              <span className="font-mono text-xs text-muted-foreground">{d.wallet?.code}</span>
              <span className="text-xs text-muted-foreground">· versi {d.wallet?.version}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Limit Harian</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Debit</span>
              <span className="tabular-nums">{formatNumber(d.limits.dailyDebitLimit, 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Top up</span>
              <span className="tabular-nums">{formatNumber(d.limits.dailyTopupLimit, 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Maks saldo</span>
              <span className="tabular-nums">{formatNumber(d.limits.maxBalance ?? 0, 0)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Kartu Aktif</CardTitle>
          </CardHeader>
          <CardContent>
            {activeCard ? (
              <div className="space-y-1.5">
                <p className="font-mono text-sm font-semibold">{activeCard.code}</p>
                <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
                  <Nfc className="h-3 w-3" />
                  {activeCard.rfidUid ?? "belum ada UID"}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  Diterbitkan {formatDateTime(activeCard.issuedAt)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada kartu aktif</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ledger">
        <TabsList>
          <TabsTrigger value="ledger">
            <History className="h-4 w-4" /> Ledger
          </TabsTrigger>
          <TabsTrigger value="cards">
            <CreditCard className="h-4 w-4" /> Kartu RFID/QR
          </TabsTrigger>
          <TabsTrigger value="parents">
            <UsersIcon className="h-4 w-4" /> Wali
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ledger">
          <Card>
            <CardHeader>
              <CardTitle>Riwayat Transaksi Wallet</CardTitle>
              <CardDescription>
                Setiap perubahan saldo selalu tercatat di sini. Saldo tidak pernah diubah tanpa
                ledger.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {d.recentLedger.length === 0 ? (
                <EmptyState
                  title="Belum ada transaksi"
                  description="Lakukan top up untuk memulai."
                  icon={WalletIcon}
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Transaksi</TableHead>
                      <TableHead>Tipe</TableHead>
                      <TableHead className="text-right">Nominal</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.recentLedger.map((e: any) => (
                      <TableRow key={e._id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDateTime(e.createdAt)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{e.transactionId}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              e.direction === "CREDIT" ? "success" : "secondary"
                            }
                          >
                            {TYPE_LABELS[e.type] ?? e.type}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold tabular-nums ${
                            e.direction === "CREDIT" ? "text-success" : ""
                          }`}
                        >
                          {e.direction === "CREDIT" ? "+" : "−"}
                          <Money value={e.amount} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          <Money value={e.balanceAfter} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cards">
          <Card>
            <CardHeader>
              <CardTitle>Kartu RFID & QR</CardTitle>
              <CardDescription>
                Kartu adalah alat identifikasi saja. Saldo tetap tersimpan di wallet, tidak pernah
                menempel pada kartu.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {can(PERMISSIONS.CARD_MANAGE) && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await registerCard({ studentId: d.student._id });
                    }}
                  >
                    <Plus className="h-4 w-4" /> Buat Kartu Baru
                  </Button>
                  {activeCard && (
                    <Button variant="outline" size="sm" onClick={() => setRfidOpen(true)}>
                      <Nfc className="h-4 w-4" /> {activeCard.rfidUid ? "Ganti UID RFID" : "Daftarkan UID RFID"}
                    </Button>
                  )}
                </div>
              )}

              {activeCard ? (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                    <QrPanel token={activeCard.qrToken} studentName={d.student.name} nis={d.student.nis} />
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-mono text-base font-bold">{activeCard.code}</p>
                        <Badge variant="success">AKTIF</Badge>
                      </div>
                      <p className="flex items-center gap-1.5 text-sm">
                        <Nfc className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono">
                          {activeCard.rfidUid ?? "UID belum terdaftar"}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Diterbitkan {formatDateTime(activeCard.issuedAt)}
                      </p>

                      {can(PERMISSIONS.CARD_MANAGE) && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await regenQr({ cardId: activeCard._id });
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Regenerasi QR
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const reason = prompt("Alasan pemblokiran kartu:");
                              if (reason) await blockCard({ cardId: activeCard._id, reason });
                            }}
                          >
                            <Ban className="h-3.5 w-3.5" /> Blokir
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const reason = prompt("Alasan penggantian kartu (hilang/rusak):");
                              if (reason) await replaceCard({ oldCardId: activeCard._id, reason });
                            }}
                          >
                            <RefreshCw className="h-3.5 w-3.5" /> Ganti Kartu
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <EmptyState
                  title="Belum ada kartu aktif"
                  description="Buat kartu untuk mengaktifkan identifikasi RFID atau QR di kasir."
                  icon={CreditCard}
                />
              )}

              {cardHistory.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-semibold">Riwayat Kartu</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kode</TableHead>
                        <TableHead>UID RFID</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Alasan</TableHead>
                        <TableHead>Waktu</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cardHistory.map((c: any) => (
                        <TableRow key={c._id}>
                          <TableCell className="font-mono text-xs">{c.code}</TableCell>
                          <TableCell className="font-mono text-xs">{c.rfidUid ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="muted">{c.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.note ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(c.blockedAt ?? c.issuedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <LinkRfidDialog
                open={rfidOpen}
                onOpenChange={setRfidOpen}
                onSubmit={async (uid) => {
                  if (activeCard) await linkRfid({ cardId: activeCard._id, rfidUid: uid });
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="parents">
          <Card>
            <CardHeader>
              <CardTitle>Wali Santri</CardTitle>
            </CardHeader>
            <CardContent>
              {d.parents.length === 0 ? (
                <EmptyState title="Belum ada wali terdaftar" icon={UsersIcon} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nama</TableHead>
                      <TableHead>Hubungan</TableHead>
                      <TableHead>Telepon</TableHead>
                      <TableHead>Kode</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.parents.map((p: any) => (
                      <TableRow key={p._id}>
                        <TableCell className="font-medium">{p.parent.name}</TableCell>
                        <TableCell>{p.relation}</TableCell>
                        <TableCell className="tabular-nums">{p.parent.phone}</TableCell>
                        <TableCell className="font-mono text-xs">{p.parent.code}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <MoneyDialog
        mode={moneyOpen}
        studentId={d.student._id}
        balance={d.wallet?.currentBalance ?? 0}
        onClose={() => setMoneyOpen(null)}
        onTopUp={async (args) => topUp({ studentId: d.student._id, ...args })}
        onWithdraw={async (args) => withdraw({ studentId: d.student._id, ...args })}
        onAdjust={async (args) => adjust({ studentId: d.student._id, ...args })}
      />
    </div>
  );
}

// ---------------------------------------------------------------- QR panel ----

function QrPanel({ token, studentName, nis }: { token: string; studentName: string; nis: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(token, { width: 180, margin: 1, color: { dark: "#0f172a" } })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => {
        if (active) setDataUrl(null);
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-white p-3">
      {dataUrl ? (
        <img src={dataUrl} alt={`QR ${studentName}`} className="h-40 w-40" />
      ) : (
        <div className="flex h-40 w-40 items-center justify-center text-xs text-slate-400">
          <QrCode className="h-10 w-10" />
        </div>
      )}
      <p className="text-center text-[11px] font-semibold text-slate-800">{studentName}</p>
      <p className="text-[10px] text-slate-500">NIS {nis}</p>
      <a
        href={dataUrl ?? "#"}
        download={`qr-${nis}.png`}
        className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-1 text-[10px] font-medium text-white"
      >
        <Download className="h-3 w-3" /> Unduh QR
      </a>
    </div>
  );
}

function LinkRfidDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (uid: string) => Promise<unknown>;
}) {
  const [uid, setUid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Daftarkan UID RFID</DialogTitle>
          <DialogDescription>
            Aktifkan RFID reader, lalu tap kartu. UID akan terbaca pada kolom di bawah.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>UID RFID</Label>
          <Input
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            placeholder="Contoh: A0001B22C3"
            className="font-mono"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={busy || !uid.trim()}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onSubmit(uid.trim());
                onOpenChange(false);
                setUid("");
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan UID
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MoneyDialog({
  mode,
  studentId,
  balance,
  onClose,
  onTopUp,
  onWithdraw,
  onAdjust,
}: {
  mode: "TOPUP" | "WITHDRAW" | "ADJUST" | null;
  studentId: string;
  balance: number;
  onClose: () => void;
  onTopUp: (args: any) => Promise<unknown>;
  onWithdraw: (args: any) => Promise<unknown>;
  onAdjust: (args: any) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const presets = [50_000, 100_000, 200_000, 500_000];

  async function submit() {
    const value = Number(amount) || 0;
    if (value === 0) {
      setError("Nominal harus lebih dari 0");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const key = `${mode}-${studentId}-${value}-${Date.now()}`;
      let res: any;
      if (mode === "TOPUP") {
        res = await onTopUp({ amount: value, note: note || undefined, method: "MANUAL", idempotencyKey: key });
      } else if (mode === "WITHDRAW") {
        res = await onWithdraw({ amount: value, note: note || undefined, idempotencyKey: key });
      } else {
        const signed = reason.trim().toLowerCase().includes("kurang") ? -value : value;
        res = await onAdjust({ amount: signed, reason: reason || "Penyesuaian", idempotencyKey: key });
      }
      setDone(`Saldo baru: ${formatNumber(res.balanceAfter, 0)}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "TOPUP" ? "Top Up Wallet" : mode === "WITHDRAW" ? "Penarikan Uang" : "Penyesuaian Saldo";

  return (
    <Dialog
      open={!!mode}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setDone(null);
          setError(null);
          setAmount("");
          setNote("");
          setReason("");
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Saldo saat ini: <Money value={balance} />. Setiap perubahan menghasilkan entri ledger
            dan jurnal akuntansi.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <>
            <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-center">
              <p className="text-sm text-muted-foreground">Berhasil</p>
              <p className="mt-1 text-lg font-bold text-success">{done}</p>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Tutup</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>Nominal (Rp)</Label>
              <Input
                value={amount}
                inputMode="numeric"
                placeholder="100000"
                onChange={(e) =>
                  setAmount(e.target.value === "" ? "" : Number(e.target.value.replace(/\D/g, "")))
                }
                autoFocus
              />
              {mode !== "ADJUST" && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {presets.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAmount(p)}
                      className="rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                    >
                      {formatNumber(p, 0)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {mode === "ADJUST" && (
              <div className="space-y-1.5">
                <Label>Alasan (wajib)</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="mis. Koreksi saldo atau koreksi pembukuan"
                />
                <p className="text-xs text-muted-foreground">
                  Tulis “kurang” pada alasan untuk mengurangi saldo.
                </p>
              </div>
            )}

            {mode !== "ADJUST" && (
              <div className="space-y-1.5">
                <Label>Catatan (opsional)</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="mis. Top up dari wali"
                />
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Batal
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
