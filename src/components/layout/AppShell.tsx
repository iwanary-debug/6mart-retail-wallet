import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ScanBarcode,
  Receipt,
  Package,
  Boxes,
  Truck,
  Users,
  Wallet,
  Landmark,
  FileBarChart,
  Settings,
  ScrollText,
  Zap,
  Bell,
  LogOut,
  Menu,
  X,
  Store,
  ChevronDown,
  Shirt,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PERMISSIONS } from "@/lib/rbac";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  group: string;
}

const NAV: NavItem[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, permission: PERMISSIONS.DASHBOARD_VIEW, group: "Utama" },
  { to: "/app/pos", label: "Kasir", icon: ScanBarcode, permission: PERMISSIONS.SALE_CREATE, group: "Operasional" },
  { to: "/app/penjualan", label: "Penjualan", icon: Receipt, permission: PERMISSIONS.SALE_VIEW, group: "Operasional" },
  { to: "/app/produk", label: "Produk", icon: Package, permission: PERMISSIONS.PRODUCT_VIEW, group: "Master Data" },
  { to: "/app/inventori", label: "Inventory", icon: Boxes, permission: PERMISSIONS.INVENTORY_VIEW, group: "Master Data" },
  { to: "/app/supplier", label: "Supplier", icon: Truck, permission: PERMISSIONS.SUPPLIER_MANAGE, group: "Master Data" },
  { to: "/app/santri", label: "Santri", icon: Users, permission: PERMISSIONS.STUDENT_VIEW, group: "Master Data" },
  { to: "/app/wallet", label: "Wallet", icon: Wallet, permission: PERMISSIONS.WALLET_VIEW, group: "Keuangan" },
  { to: "/app/keuangan", label: "Keuangan", icon: Landmark, permission: PERMISSIONS.FINANCE_VIEW, group: "Keuangan" },
  { to: "/app/laporan", label: "Laporan", icon: FileBarChart, permission: PERMISSIONS.REPORT_VIEW, group: "Keuangan" },
  { to: "/app/layanan", label: "Layanan", icon: Shirt, permission: PERMISSIONS.SERVICE_LAUNDRY, group: "Layanan" },
  { to: "/app/ppob", label: "PPOB", icon: Zap, permission: PERMISSIONS.SERVICE_PPOB, group: "Layanan" },
  { to: "/app/pengguna", label: "Pengguna & Peran", icon: Settings, permission: PERMISSIONS.USER_MANAGE, group: "Sistem" },
  { to: "/app/audit", label: "Audit Log", icon: ScrollText, permission: PERMISSIONS.AUDIT_VIEW, group: "Sistem" },
];

const GROUP_ORDER = ["Utama", "Operasional", "Master Data", "Keuangan", "Layanan", "Sistem"];

export function AppShell() {
  const { profile, signOut, can } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const notifications = useQuery(api.settings.listNotifications, { limit: 20 });
  const settings = useQuery(api.settings.getAll, {});

  const visible = NAV.filter((n) => !n.permission || can(n.permission));
  const unread = notifications && !("error" in notifications) ? notifications.unread : 0;

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar desktop */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card lg:flex">
        <SidebarContent
          visible={visible}
          onNavigate={() => {}}
          settingsName={settings && !("error" in settings) ? settings.storeName : "6Mart"}
        />
      </aside>

      {/* Sidebar mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative flex h-full w-72 flex-col border-r border-border bg-card">
            <button
              type="button"
              className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setMobileOpen(false)}
              aria-label="Tutup menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              visible={visible}
              onNavigate={() => setMobileOpen(false)}
              settingsName={settings && !("error" in settings) ? settings.storeName : "6Mart"}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Buka menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Link to="/app" className="flex items-center gap-2 lg:hidden">
            <Store className="h-5 w-5 text-primary" />
            <span className="font-semibold">6Mart</span>
          </Link>

          <div className="hidden min-w-0 flex-1 lg:block">
            <Breadcrumb pathname={location.pathname} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/app/notifikasi" aria-label="Notifikasi" className="relative">
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </Button>

            <div className="flex items-center gap-2 border-l border-border pl-2">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-tight">{profile?.name}</p>
                <p className="text-xs text-muted-foreground">{profile?.roleLabel}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {profile?.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Keluar">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  visible,
  onNavigate,
  settingsName,
}: {
  visible: NavItem[];
  onNavigate: () => void;
  settingsName: string;
}) {
  return (
    <>
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Store className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight">6Mart</p>
          <p className="truncate text-[11px] text-muted-foreground">{settingsName}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {GROUP_ORDER.map((group) => {
          const items = visible.filter((n) => n.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className="mb-4">
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/app"}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <Badge variant="warning" className="w-full justify-center py-1.5">
          Mode Development
        </Badge>
      </div>
    </>
  );
}

const LABELS: Record<string, string> = {
  app: "Dashboard",
  pos: "Kasir",
  penjualan: "Penjualan",
  produk: "Produk",
  inventori: "Inventory",
  supplier: "Supplier",
  santri: "Santri",
  wallet: "Wallet",
  keuangan: "Keuangan",
  laporan: "Laporan",
  layanan: "Layanan",
  ppob: "PPOB",
  pengguna: "Pengguna & Peran",
  pengaturan: "Pengaturan",
  audit: "Audit Log",
  notifikasi: "Notifikasi",
};

function Breadcrumb({ pathname }: { pathname: string }) {
  const parts = pathname.split("/").filter(Boolean);
  return (
    <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Link to="/app" className="hover:text-foreground">
        Dashboard
      </Link>
      {parts.slice(1).map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
          <span className={i === parts.length - 2 ? "font-medium text-foreground" : ""}>
            {LABELS[p] ?? p}
          </span>
        </span>
      ))}
    </nav>
  );
}
