import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { ROLES, ROLE_LABELS, type RoleKey } from "@/lib/rbac";
import { useNavigate } from "react-router-dom";

export interface AuthProfile {
  id: string;
  name: string;
  email: string;
  roleKey: RoleKey;
  roleLabel: string;
  permissions: string[];
  isActive: boolean;
}

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  profile: AuthProfile | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn: authSignIn, signOut: authSignOut } = useAuthActions();
  const navigate = useNavigate();

  // Query profil HANYA berjalan ketika sudah masuk.
  //
  // `users:profile` memanggil `requireUser()`, yang melempar AuthError bila
  // belum terautentikasi. Tanpa `skip`, `useQuery` akan melempar error itu
  // ke luar. Karena AuthProvider membungkus SELURUH router, error yang
  // tidak tertangani membuat React melepas seluruh pohon — hasilnya layar
  // putih tanpa pesan apa pun.
  //
  // Pada convex 1.46, `skip` adalah NILAI pada posisi args (bukan opsi),
  // sehingga tanda tangannya berubah antara dua bentuk pemanggilan.
  const profileQuery = useQuery(
    api.users.profile,
    isAuthenticated ? {} : "skip",
  );

  const value = useMemo<AuthContextValue>(() => {
    const raw = profileQuery;
    const profile: AuthProfile | null =
      isAuthenticated && raw && !("error" in raw) && raw
        ? {
            id: (raw as { _id: string })._id,
            name: (raw as { name: string }).name,
            email: (raw as { email: string }).email,
            roleKey: (raw as { roleKey: RoleKey }).roleKey,
            roleLabel:
              (raw as { roleLabel?: string }).roleLabel ??
              ROLE_LABELS[(raw as { roleKey: RoleKey }).roleKey],
            permissions: (raw as { permissions: string[] }).permissions ?? [],
            isActive: (raw as { isActive: boolean }).isActive,
          }
        : null;

    return {
      // Selama query profil berjalan, sesi sudah ada tetapi profil belum.
      // Perlakukan sebagai "memuat" supaya RequireAuth tidak sempat
      // melempar navigasi ke /auth.
      isLoading: isLoading || (isAuthenticated && raw === undefined),
      isAuthenticated: isAuthenticated && profile !== null,
      profile,
      signIn: async (email: string, password: string) => {
        await authSignIn("password", {
          flow: "signIn",
          email: email.trim().toLowerCase(),
          password,
        });
      },
      signOut: async () => {
        await authSignOut();
        navigate("/", { replace: true });
      },
      can: (permission: string) => profile?.permissions.includes(permission) ?? false,
      canAny: (...permissions: string[]) =>
        permissions.some((p) => profile?.permissions.includes(p) ?? false),
    };
  }, [isLoading, isAuthenticated, profileQuery, authSignIn, authSignOut, navigate]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam AuthProvider");
  return ctx;
}

export { AuthContext, ROLES };
