/**
 * Stub `@convex-dev/auth/react` untuk check render terautentikasi.
 *
 * Hanya perlu melaporkan sesi yang sudah masuk; token asli tidak relevan
 * karena `useQuery` juga di-stub. Profil datang dari `useQuery(users:profile)`
 * pada AuthProvider sungguhan, jadi jalur RBAC yang diuji adalah kode asli.
 */

import type { ReactNode } from "react";

export interface StubAuth {
  isLoading: boolean;
  isAuthenticated: boolean;
}

let current: StubAuth = { isLoading: false, isAuthenticated: true };

export function __setStubAuth(next: StubAuth) {
  current = next;
}

export function useConvexAuth() {
  return current;
}

export function useAuthActions() {
  return {
    signIn: async () => {},
    signOut: async () => {},
  };
}

export function ConvexAuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
