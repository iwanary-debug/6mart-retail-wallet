import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "./App";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import "./index.css";

/**
 * Alamat deployment Convex.
 *
 * `VITE_CONVEX_URL` dibekukan saat build, dan Vite memberi prioritas pada nilai
 * yang ada di ENVIRONMENT PROSES di atas `.env.local`. Kalau variabel itu berisi
 * nilai yang bukan URL — pernah kejadian: yang masuk justru envelope terenkripsi
 * `{"v":"v2","c":"...","k":[...]}` sepanjang 1080 karakter, bentuk khas
 * kredensial/deploy key Convex — maka alamat itu dibekukan apa adanya ke bundel
 * browser dan aplikasi tidak pernah bisa menyambung.
 *
 * Karena itu nilainya DIVALIDASI: hanya `http(s)://` yang dipakai. Nilai yang
 * tidak sah jatuh ke deployment produksi di bawah, dan pesannya dicatat agar
 * salah setel environment ketahuan dari console, bukan berakhir layar kosong.
 */
const PRODUCTION_CONVEX_URL = "https://healthy-quail-174.convex.cloud";

const configuredConvexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const convexUrl =
  configuredConvexUrl && /^https?:\/\//.test(configuredConvexUrl)
    ? configuredConvexUrl
    : PRODUCTION_CONVEX_URL;

if (configuredConvexUrl !== convexUrl) {
  console.warn(
    `VITE_CONVEX_URL tidak berisi URL yang sah, memakai ${convexUrl}. ` +
      "Periksa Settings → Environment: nilainya harus seperti https://<deployment>.convex.cloud.",
  );
}

const convex = new ConvexReactClient(convexUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConvexProvider client={convex}>
        <ConvexAuthProvider client={convex}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ConvexAuthProvider>
      </ConvexProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
