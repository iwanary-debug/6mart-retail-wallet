import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AppShell } from "@/components/layout/AppShell";
import { PERMISSIONS } from "@/lib/rbac";

import LandingPage from "@/pages/LandingPage";
import AuthPage from "@/pages/AuthPage";
import DevInfoPage from "@/pages/DevInfoPage";
import DashboardPage from "@/pages/DashboardPage";
import PosPage from "@/pages/PosPage";
import SalesPage from "@/pages/SalesPage";
import ProductsPage from "@/pages/ProductsPage";
import InventoryPage from "@/pages/InventoryPage";
import SuppliersPage from "@/pages/SuppliersPage";
import StudentsPage from "@/pages/StudentsPage";
import StudentDetailPage from "@/pages/StudentDetailPage";
import WalletPage from "@/pages/WalletPage";
import FinancePage from "@/pages/FinancePage";
import ReportsPage from "@/pages/ReportsPage";
import ServicesPage from "@/pages/ServicesPage";
import PpobPage from "@/pages/PpobPage";
import UsersPage from "@/pages/UsersPage";
import AuditPage from "@/pages/AuditPage";
import SettingsPage from "@/pages/SettingsPage";
import NotificationsPage from "@/pages/NotificationsPage";
import NotFoundPage from "@/pages/NotFoundPage";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/info" element={<DevInfoPage />} />

        <Route
          path="/app"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route
            path="pos"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.SALE_CREATE]}>
                <PosPage />
              </RequireAuth>
            }
          />
          <Route
            path="penjualan"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.SALE_VIEW]}>
                <SalesPage />
              </RequireAuth>
            }
          />
          <Route
            path="produk"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.PRODUCT_VIEW]}>
                <ProductsPage />
              </RequireAuth>
            }
          />
          <Route
            path="inventori"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.INVENTORY_VIEW]}>
                <InventoryPage />
              </RequireAuth>
            }
          />
          <Route
            path="supplier"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.SUPPLIER_MANAGE]}>
                <SuppliersPage />
              </RequireAuth>
            }
          />
          <Route
            path="santri"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.STUDENT_VIEW]}>
                <StudentsPage />
              </RequireAuth>
            }
          />
          <Route
            path="santri/:id"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.STUDENT_VIEW]}>
                <StudentDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="wallet"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.WALLET_VIEW]}>
                <WalletPage />
              </RequireAuth>
            }
          />
          <Route
            path="keuangan"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.FINANCE_VIEW]}>
                <FinancePage />
              </RequireAuth>
            }
          />
          <Route
            path="laporan"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.REPORT_VIEW]}>
                <ReportsPage />
              </RequireAuth>
            }
          />
          <Route
            path="layanan"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.SERVICE_LAUNDRY]}>
                <ServicesPage />
              </RequireAuth>
            }
          />
          <Route
            path="ppob"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.SERVICE_PPOB]}>
                <PpobPage />
              </RequireAuth>
            }
          />
          <Route
            path="pengguna"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.USER_MANAGE]}>
                <UsersPage />
              </RequireAuth>
            }
          />
          <Route
            path="audit"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.AUDIT_VIEW]}>
                <AuditPage />
              </RequireAuth>
            }
          />
          <Route
            path="pengaturan"
            element={
              <RequireAuth anyPermission={[PERMISSIONS.SETTINGS_MANAGE]}>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route path="notifikasi" element={<NotificationsPage />} />
        </Route>

        <Route path="/404" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/404" replace />} />
      </Routes>
    </AuthProvider>
  );
}
