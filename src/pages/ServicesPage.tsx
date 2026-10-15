import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate } from "react-router-dom";
import {
  Shirt,
  Scissors,
  Bike,
  Plus,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import {
  PageHeader,
  StatCard,
  Money,
  LoadingState,
  EmptyState,
  errorMessage,
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
import { formatNumber } from "@/lib/money";
import { useAuth } from "@/components/auth/AuthProvider";
import { PERMISSIONS } from "@/lib/rbac";

const LAUNDRY_STATUS: Record<string, { label: string; variant: any }> = {
  PENDING: { label: "Menunggu", variant: "muted" },
  PROCESSING: { label: "Diproses", variant: "default" },
  READY: { label: "Siap Diambil", variant: "warning" },
  COMPLETED: { label: "Selesai", variant: "success" },
  CANCELLED: { label: "Dibatalkan", variant: "destructive" },
};

const BOOKING_STATUS: Record<string, { label: string; variant: any }> = {
  WAITING: { label: "Menunggu", variant: "muted" },
  IN_PROGRESS: { label: "Dikerjakan", variant: "default" },
  DONE: { label: "Selesai", variant: "success" },
  CANCELLED: { label: "Dibatalkan", variant: "destructive" },
  NO_SHOW: { label: "Tidak Datang", variant: "warning" },
};

/**
 * Pilihan jenis pesanan jastip.
 *
 * Disediakan tiga jenis saja karena itu yang benar-benar dipakai rutin di
 * sekolah. Menambah daftar hanya memperpanjang form tanpa manfaat.
 */
const JASTIP_ORDER_TYPES = ["Mie Gacoan", "Roti Gembul", "Surma"];

const JASTIP_STATUS: Record<string, { label: string; variant: any }> = {
  PENDING: { label: "Menunggu", variant: "muted" },
  PICKED_UP: { label: "Diambil", variant: "default" },
  IN_DELIVERY: { label: "Diantar", variant: "default" },
  DELIVERED: { label: "Selesai", variant: "success" },
  CANCELLED: { label: "Dibatalkan", variant: "destructive" },
};

export default function ServicesPage() {
  const { can } = useAuth();
  const summary = useQuery(api.services.servicesSummary, {});
  const [laundryOpen, setLaundryOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [jastipOpen, setJastipOpen] = useState(false);

  // Halaman ini digateway `service.laundry`, tetapi tiap tab punya izin
  // sendiri: barbershop butuh `service.barbershop`, jastip butuh
  // `service.jastip`, dan pilihan Santri di dialog butuh `student.view`.
  // Tanpa `skip`, peran yang hanya boleh laundry akan mendapat
  // ForbiddenError dan seluruh halaman gagal — bukan hanya tab lain.
  const canBarbershop = can(PERMISSIONS.SERVICE_BARBERSHOP);
  const canJastip = can(PERMISSIONS.SERVICE_JASTIP);
  const canStudent = can(PERMISSIONS.STUDENT_VIEW);

  const laundry = useQuery(api.services.listLaundry, { limit: 50 });
  const bookings = useQuery(
    api.services.listBookings,
    canBarbershop ? { limit: 50 } : "skip",
  );
  const jastip = useQuery(
    api.services.listJastip,
    canJastip ? { limit: 50 } : "skip",
  );
  const services = useQuery(api.services.listBarbershopServices, {});
  const students = useQuery(
    api.students.list,
    canStudent ? { status: "ACTIVE", limit: 200 } : "skip",
  );

  const updateLaundry = useMutation(api.services.updateLaundryStatus);
  const payLaundry = useMutation(api.services.payLaundry);
  const updateBooking = useMutation(api.services.updateBookingStatus);
  const payBooking = useMutation(api.services.payBooking);
  const createBooking = useMutation(api.services.createBooking);
  const updateJastip = useMutation(api.services.updateJastipStatus);
  const payJastip = useMutation(api.services.payJastip);
  const createLaundry = useMutation(api.services.createLaundryOrder);
  const createJastip = useMutation(api.services.createJastipOrder);

  if (summary === undefined) return <LoadingState label="Memuat layanan…" />;
  const s = summary as any;
  const studentOptions = (students && !("error" in students) ? students.items : []) as any[];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Layanan"
        description="Laundry, barbershop, dan jastip — semua terhubung ke wallet, penjualan, dan akuntansi."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Laundry Aktif"
          value={String(s.laundry.pending + s.laundry.ready)}
          hint={`${s.laundry.completed} selesai · omzet ${formatNumber(s.laundry.revenue, 0)}`}
          icon={Shirt}
          tone="primary"
        />
        <StatCard
          label="Barbershop Antrean"
          value={String(s.barbershop.waiting)}
          hint={`${s.barbershop.done} selesai · omzet ${formatNumber(s.barbershop.revenue, 0)}`}
          icon={Scissors}
        />
        <StatCard
          label="Jastip Aktif"
          value={String(s.jastip.active)}
          hint={`${s.jastip.delivered} selesai · omzet ${formatNumber(s.jastip.revenue, 0)}`}
          icon={Bike}
        />
        <StatCard
          label="PPOB Margin"
          value={formatNumber(s.ppob.margin, 0)}
          hint={`${s.ppob.success} sukses`}
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <Tabs defaultValue="laundry">
        <TabsList>
          <TabsTrigger value="laundry">
            <Shirt className="h-4 w-4" /> Laundry
          </TabsTrigger>
          {canBarbershop && (
            <TabsTrigger value="barbershop">
              <Scissors className="h-4 w-4" /> Barbershop
            </TabsTrigger>
          )}
          {canJastip && (
            <TabsTrigger value="jastip">
              <Bike className="h-4 w-4" /> Jastip
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="laundry">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm">Order Laundry</CardTitle>
                  <CardDescription>Dihitung per kilogram × harga/kg.</CardDescription>
                </div>
                <Button size="sm" onClick={() => setLaundryOpen(true)}>
                  <Plus className="h-4 w-4" /> Order Baru
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {laundry && !("error" in laundry) && laundry.items.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Pelanggan</TableHead>
                      <TableHead>Layanan</TableHead>
                      <TableHead className="text-right">Berat</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-40" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {laundry.items.map((o: any) => (
                      <TableRow key={o._id}>
                        <TableCell className="font-mono text-xs">{o.code}</TableCell>
                        <TableCell className="text-sm">{o.customerName}</TableCell>
                        <TableCell className="text-sm">{o.serviceType}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(o.weightKg, 1)} kg
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatNumber(o.totalAmount, 0)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={LAUNDRY_STATUS[o.status]?.variant ?? "muted"}
                            className="text-[10px]"
                          >
                            {LAUNDRY_STATUS[o.status]?.label ?? o.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {o.saleId ? (
                            <Badge variant="success" className="text-[10px]">
                              Dibayar
                            </Badge>
                          ) : (
                            <div className="flex justify-end gap-1">
                              {o.status === "PENDING" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateLaundry({ orderId: o._id, status: "PROCESSING" })}
                                >
                                  Proses
                                </Button>
                              )}
                              {o.status === "PROCESSING" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateLaundry({ orderId: o._id, status: "READY" })}
                                >
                                  Siap
                                </Button>
                              )}
                              <Button
                                size="sm"
                                onClick={async () => {
                                  const method = o.customerStudentId ? "WALLET" : "CASH";
                                  await payLaundry({
                                    orderId: o._id,
                                    method,
                                    idempotencyKey: `laundry-${o._id}-${Date.now()}`,
                                  });
                                }}
                              >
                                Bayar
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState title="Belum ada order laundry" icon={Shirt} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canBarbershop && (
          <TabsContent value="barbershop">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Booking Barbershop</CardTitle>
                    <CardDescription>Sistem antrean otomatis per hari.</CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setBookingOpen(true)}>
                    <Plus className="h-4 w-4" /> Booking Baru
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {bookings && !("error" in bookings) && bookings.items.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Antrean</TableHead>
                        <TableHead>Kode</TableHead>
                        <TableHead>Pelanggan</TableHead>
                        <TableHead>Layanan</TableHead>
                        <TableHead>Barber</TableHead>
                        <TableHead className="text-right">Harga</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-32" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bookings.items.map((b: any) => (
                        <TableRow key={b._id}>
                          <TableCell className="text-center font-bold">#{b.queueNumber}</TableCell>
                          <TableCell className="font-mono text-xs">{b.code}</TableCell>
                          <TableCell className="text-sm">{b.customerName}</TableCell>
                          <TableCell className="text-sm">{b.serviceName}</TableCell>
                          <TableCell className="text-sm">{b.barberName}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(b.price, 0)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={BOOKING_STATUS[b.status]?.variant ?? "muted"}
                              className="text-[10px]"
                            >
                              {BOOKING_STATUS[b.status]?.label ?? b.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {b.saleId ? (
                              <Badge variant="success" className="text-[10px]">
                                Dibayar
                              </Badge>
                            ) : (
                              <div className="flex justify-end gap-1">
                                {b.status === "WAITING" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => updateBooking({ bookingId: b._id, status: "IN_PROGRESS" })}
                                  >
                                    Kerjakan
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    const method = b.customerStudentId ? "WALLET" : "CASH";
                                    await payBooking({
                                      bookingId: b._id,
                                      method,
                                      idempotencyKey: `booking-${b._id}-${Date.now()}`,
                                    });
                                  }}
                                >
                                  Bayar
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState title="Belum ada booking" icon={Scissors} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {canJastip && (
          <TabsContent value="jastip">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Order Jastip</CardTitle>
                    <CardDescription>
                      6Mart hanya memproses biaya layanan — pembayaran barang dikirim terpisah.
                    </CardDescription>
                  </div>
                  <Button size="sm" onClick={() => setJastipOpen(true)}>
                    <Plus className="h-4 w-4" /> Order Baru
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {jastip && !("error" in jastip) && jastip.items.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kode</TableHead>
                        <TableHead>Pengirim</TableHead>
                        <TableHead>Jenis Pesanan</TableHead>
                        <TableHead className="text-right">Barang</TableHead>
                        <TableHead className="text-right">Biaya Layanan</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-28" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jastip.items.map((o: any) => (
                        <TableRow key={o._id}>
                          <TableCell className="font-mono text-xs">{o.code}</TableCell>
                          <TableCell className="text-sm">{o.customerName}</TableCell>
                          <TableCell className="text-sm">
                            {o.orderType ?? o.buyerName ?? o.destination ?? "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatNumber(o.itemsTotal, 0)}
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatNumber(o.serviceFee, 0)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={JASTIP_STATUS[o.status]?.variant ?? "muted"}
                              className="text-[10px]"
                            >
                              {JASTIP_STATUS[o.status]?.label ?? o.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {o.saleId ? (
                              <Badge variant="success" className="text-[10px]">
                                Dibayar
                              </Badge>
                            ) : (
                              <div className="flex justify-end gap-1">
                                {o.status === "PENDING" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      updateJastip({ orderId: o._id, status: "PICKED_UP" })
                                    }
                                  >
                                    Diambil
                                  </Button>
                                )}
                                {o.status === "PICKED_UP" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      updateJastip({ orderId: o._id, status: "IN_DELIVERY" })
                                    }
                                  >
                                    Dikirim
                                  </Button>
                                )}
                                {o.status === "IN_DELIVERY" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      updateJastip({ orderId: o._id, status: "DELIVERED" })
                                    }
                                  >
                                    Selesai
                                  </Button>
                                )}
                                <Button
                                size="sm"
                                onClick={async () => {
                                  const method = o.customerStudentId ? "WALLET" : "CASH";
                                  await payJastip({
                                    orderId: o._id,
                                    method,
                                    idempotencyKey: `jastip-${o._id}-${Date.now()}`,
                                  });
                                }}
                              >
                                Bayar
                              </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <EmptyState title="Belum ada order jastip" icon={Bike} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <LaundryDialog
        open={laundryOpen}
        onOpenChange={setLaundryOpen}
        students={studentOptions}
        onSubmit={async (args) => createLaundry(args as any)}
      />
      <BookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        students={studentOptions}
        services={(services && !("error" in services) ? services : []) as any[]}
        onSubmit={async (args) => createBooking(args as any)}
      />
      <JastipDialog
        open={jastipOpen}
        onOpenChange={setJastipOpen}
        students={studentOptions}
        onSubmit={async (args) => {
          // Order disimpan dulu, lalu kasir diarahkan ke halaman kasir untuk
          // menyelesaikan pembayaran — sama seperti saat belanja barang.
          const res: any = await createJastip(args as any);
          return res;
        }}
      />
    </div>
  );
}

function LaundryDialog({
  open,
  onOpenChange,
  students,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: any[];
  onSubmit: (args: any) => Promise<unknown>;
}) {
  const [customerType, setCustomerType] = useState("WALK_IN");
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [serviceType, setServiceType] = useState("Cuci Satuan");
  const [pricePerKg, setPricePerKg] = useState(7000);
  const [weightKg, setWeightKg] = useState<number | "">(2);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fees = useQuery(api.settings.getAll, {});
  // Biaya layanan datar ditambahkan di atas berat × harga per kg.
  const serviceFee = Number(
    (fees && !("error" in fees) ? (fees as any)?.laundryServiceFee : 0) ?? 0,
  );
  const laundryBase = (Number(weightKg) || 0) * pricePerKg;
  const total = laundryBase + serviceFee;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Order Laundry Baru</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipe Pelanggan</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
            >
              <option value="WALK_IN">Umum</option>
              <option value="STUDENT">Santri</option>
            </select>
          </div>
          {customerType === "STUDENT" ? (
            <div className="space-y-1.5">
              <Label>Santri</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  const st = students.find((x) => x._id === e.target.value);
                  if (st) setName(st.name);
                }}
              >
                <option value="">Pilih…</option>
                {students.map((st) => (
                  <option key={st._id} value={st._id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Jenis Layanan</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
            >
              <option>Cuci Satuan</option>
              <option>Cuci Lipat</option>
              <option>Setrika Saja</option>
              <option>Cuci + Setrika</option>
              <option>Jaket</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Berat (kg)</Label>
            <Input
              value={weightKg}
              inputMode="decimal"
              onChange={(e) => setWeightKg(e.target.value === "" ? "" : Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Harga/kg (Rp)</Label>
            <Input
              value={pricePerKg}
              inputMode="numeric"
              onChange={(e) => setPricePerKg(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        {/* Harga laundry dan jasa layanan ditampilkan terpisah supaya
            kasir bisa melihat keduanya, bukan hanya total akhir. */}
        <div className="space-y-1 rounded-lg border border-dashed border-border px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Harga laundry ({Number(weightKg) || 0} kg × {formatNumber(pricePerKg, 0)})
            </span>
            <span className="tabular-nums">{formatNumber(laundryBase, 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Jasa layanan</span>
            <span className="tabular-nums">{formatNumber(serviceFee, 0)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatNumber(total, 0)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Setelah disimpan, Anda diarahkan ke halaman kasir untuk membayar.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res: any = await onSubmit({
                  customerType,
                  customerStudentId: customerType === "STUDENT" ? studentId : undefined,
                  customerName: name || "Umum",
                  serviceType,
                  pricePerKg,
                  weightKg: Number(weightKg) || 0,
                });
                onOpenChange(false);
                // Pembayaran diselesaikan di halaman kasir, sama seperti
                // saat belanja barang.
                if (res?.orderId) navigate(`/app/pos?laundry=${res.orderId}`);
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan &amp; Bayar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BookingDialog({
  open,
  onOpenChange,
  students,
  services,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: any[];
  services: any[];
  onSubmit: (args: any) => Promise<unknown>;
}) {
  const [serviceId, setServiceId] = useState("");
  const [customerType, setCustomerType] = useState("WALK_IN");
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const [barberName, setBarberName] = useState("Pak Ahmad");
  const navigate = useNavigate();
  const fees = useQuery(api.settings.getAll, {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = services.find((s) => s._id === serviceId) ?? null;
  // Biaya layanan datar ditambahkan di atas harga layanan pilihan.
  const serviceFee = Number(
    (fees && !("error" in fees) ? (fees as any)?.barbershopServiceFee : 0) ?? 0,
  );
  const total = Number(service?.price ?? 0) + serviceFee;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Booking Barbershop</DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Layanan</Label>
          <select
            className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            <option value="">Pilih layanan…</option>
            {services
              .filter((x) => x.isActive)
              .map((x) => (
                <option key={x._id} value={x._id}>
                  {x.name} — {formatNumber(x.price, 0)}
                </option>
              ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipe</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
            >
              <option value="WALK_IN">Umum</option>
              <option value="STUDENT">Santri</option>
            </select>
          </div>
          {customerType === "STUDENT" ? (
            <div className="space-y-1.5">
              <Label>Santri</Label>
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  const st = students.find((x) => x._id === e.target.value);
                  if (st) setName(st.name);
                }}
              >
                <option value="">Pilih…</option>
                {students.map((st) => (
                  <option key={st._id} value={st._id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Nama</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Barber</Label>
            <Input value={barberName} onChange={(e) => setBarberName(e.target.value)} />
          </div>
        </div>

        {total > 0 && (
          <div className="space-y-1 rounded-lg border border-dashed border-border px-3 py-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Harga jasa</span>
              <span className="tabular-nums">
                {formatNumber(Number(service?.price ?? 0), 0)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Jasa layanan</span>
              <span className="tabular-nums">{formatNumber(serviceFee, 0)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-1.5 font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatNumber(total, 0)}</span>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={busy || !serviceId || (!name && !studentId)}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res: any = await onSubmit({
                  serviceId,
                  customerType,
                  customerStudentId: customerType === "STUDENT" ? studentId : undefined,
                  customerName: name || "Umum",
                  barberName,
                });
                onOpenChange(false);
                if (res?.id) navigate(`/app/pos?booking=${res.id}`);
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan &amp; Bayar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JastipDialog({
  open,
  onOpenChange,
  students,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  students: any[];
  onSubmit: (args: any) => Promise<unknown>;
}) {
  // Form jastip sengaja dibuat pendek: tipe pelanggan, nama, jenis pesanan,
  // jumlah, harga. Nis dan tujuan tidak lagi ditanyakan karena bikin lambat.
  const [customerType, setCustomerType] = useState("STUDENT");
  const [studentId, setStudentId] = useState("");
  const [name, setName] = useState("");
  const navigate = useNavigate();
  const [orderType, setOrderType] = useState("Mie Gacoan");
  const [quantity, setQuantity] = useState<number | "">(1);
  const [price, setPrice] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const quantityNum = Number(quantity) || 0;
  const priceNum = Number(price) || 0;
  const itemsTotal = quantityNum * priceNum;

  // Biaya layanan dan ongkir diambil dari pengaturan, jadi kasir tidak perlu
  // mengetik. Yang diketik hanya nilai barang.
  const fees = useQuery(api.settings.getAll, {});
  const serviceFee = Number(
    (fees && !("error" in fees) ? (fees as any)?.jastipServiceFee : 0) ?? 0,
  );
  // Ongkir tidak lagi ditagih; total = nilai pesanan + jasa layanan.
  const chargeTotal = itemsTotal + serviceFee;

  const valid =
    (customerType === "WALK_IN" ? name.trim().length > 0 : studentId !== "") &&
    orderType.trim().length > 0 &&
    quantityNum > 0 &&
    priceNum > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Order Jastip Baru</DialogTitle>
          <DialogDescription>
            Isi lima isian singkat lalu bayar langsung di tempat. Biaya layanan dan
            ongkir sudah dihitung otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Tipe Pelanggan</Label>
            <select
              className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value)}
            >
              <option value="STUDENT">Santri</option>
              <option value="WALK_IN">Umum</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Nama</Label>
            {customerType === "STUDENT" ? (
              <select
                className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
                value={studentId}
                onChange={(e) => {
                  setStudentId(e.target.value);
                  const st = students.find((x) => x._id === e.target.value);
                  if (st) setName(st.name);
                }}
              >
                <option value="">Pilih…</option>
                {students.map((st) => (
                  <option key={st._id} value={st._id}>
                    {st.name}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama pengirim"
              />
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Jenis Pesanan</Label>
            <div className="flex flex-wrap gap-1.5">
              {JASTIP_ORDER_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  className={
                    orderType === t
                      ? "rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                      : "rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                  }
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Jumlah</Label>
            <Input
              inputMode="numeric"
              value={quantity || ""}
              onChange={(e) => setQuantity(Number(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Harga</Label>
            <Input
              inputMode="numeric"
              placeholder="0"
              value={price || ""}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="space-y-1 rounded-lg border border-dashed border-border px-3 py-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              Harga ({quantityNum} × <Money value={priceNum} />)
            </span>
            <span className="tabular-nums">
              <Money value={itemsTotal} />
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Jasa layanan</span>
            <span className="tabular-nums">
              <Money value={serviceFee} />
            </span>
          </div>
          <div className="flex justify-between border-t border-border pt-1.5 font-bold">
            <span>Total</span>
            <span className="tabular-nums">
              <Money value={chargeTotal} />
            </span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Setelah disimpan, Anda diarahkan ke halaman kasir untuk membayar —
          di sana total, skema pembayaran, nominal, dan kembaliannya.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                const res: any = await onSubmit({
                  customerType,
                  customerStudentId: customerType === "STUDENT" ? studentId : undefined,
                  customerName: name || "Umum",
                  orderType,
                  items: [
                    { orderType, quantity: quantityNum, price: priceNum },
                  ],
                });
                onOpenChange(false);
                // Pembayaran diselesaikan di halaman kasir, bukan di dialog
                // ini — supaya total, skema pembayaran, nominal, dan
                // kembalian terlihat seperti saat belanja barang.
                if (res?.orderId) {
                  navigate(`/app/pos?jastip=${res.orderId}`);
                }
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Simpan &amp; Bayar di Kasir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
