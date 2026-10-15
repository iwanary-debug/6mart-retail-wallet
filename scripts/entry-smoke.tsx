/**
 * Entry sementara untuk mendeteksi exception saat render.
 *
 * Vite membundel berkas ini menjadi satu chunk yang bisa dieksekusi Node,
 * sehingga alias `@/`, transform TSX, dan semua import ter-resolve persis
 * seperti di browser. DOM disuplai oleh happy-dom, bukan tiruan sederhana,
 * supaya react-dom bisa benar-benar mount.
 *
 * Set SMOKE_EMAIL untuk merender halaman terproteksi. Token didapat dari
 * deployment sungguhan lalu disuntikkan lewat prop `serverState` milik
 * ConvexAuthProvider, sehingga RequireAuth benar-benar thinks authenticated
 * dan router menyelesaikan ke halaman yang dimaksud — bukan ke /auth.
 */

import { Window } from "happy-dom";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import { ConvexAuthProvider, useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import App from "@/App";

const CLOUD = "https://vibrant-puffin-745.convex.cloud" as string;

const win = new Window({ url: process.env.SMOKE_URL ?? "http://localhost/" });

/**
 * Node mendefinisikan sebagian global (mis. `navigator`) sebagai accessor
 * yang hanya punya getter, sehingga penulisan biasa akan melempar. Semua
 * global dipasang lewat defineProperty agar aman untuk keduanya.
 */
function defineGlobal(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}

defineGlobal("window", win);
defineGlobal("document", win.document);
defineGlobal("localStorage", win.localStorage);
defineGlobal("navigator", win.navigator);
defineGlobal("HTMLElement", win.HTMLElement);
defineGlobal("Element", win.Element);
defineGlobal("Node", win.Node);
defineGlobal("MutationObserver", win.MutationObserver);
defineGlobal("getComputedStyle", win.getComputedStyle.bind(win));
defineGlobal("requestAnimationFrame", (cb: (t: number) => void) =>
  setTimeout(() => cb(0), 0) as unknown as number);
defineGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

interface AuthTokens {
  token: string;
  refreshToken: string;
}

async function signIn(email: string, password: string) {
  const res = await fetch(`${CLOUD}/api/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "auth:signIn",
      args: {
        provider: "password",
        params: { flow: "signIn", email, password },
      },
      format: "json",
    }),
  });
  const body = (await res.json()) as {
    value?: { tokens?: { token: string; refreshToken: string } };
  };
  return body?.value?.tokens ?? null;
}

function Probe() {
  const auth = useConvexAuth();
  const profile = useQuery(api.users.profile);
  return (
    <pre id="probe">{JSON.stringify({
      isLoading: auth.isLoading,
      isAuthenticated: auth.isAuthenticated,
      profile: profile === undefined
        ? "undefined"
        : "error" in profile
          ? { error: String(profile.error).slice(0, 160) }
          : { name: (profile as { name?: string }).name },
    })}</pre>
  );
}

function render(tokens: AuthTokens | null) {
  const client = new ConvexReactClient(CLOUD);

  // Pasang token SEBELUM mount. ConvexReactClient membuka WebSocket saat
  // provider pertama kali mount, jadi token yang baru disuntikkan setelahnya
  // bisa terlambat untuk query pembuka.
  if (tokens) {
    client.setAuth(() => Promise.resolve(tokens.token));
    // ConvexAuthProvider membaca state awal dari localStorage dengan kunci
    // ber-namespace; tulis juga di sana agar tidak menimpa dengan null.
    win.localStorage.setItem("__convexAuthJWT_", tokens.token);
    win.localStorage.setItem("__convexAuthRefreshToken_", tokens.refreshToken);
  }

  const container = win.document.createElement("div");
  win.document.body.appendChild(container);

  const root = createRoot(container);
  const url = process.env.SMOKE_URL ?? "http://localhost/";

  root.render(
    <StrictMode>
      <ConvexProvider client={client}>
        <ConvexAuthProvider
          client={client}
          serverState={
            tokens
              ? { _timeFetched: Date.now(), _state: tokens }
              : undefined
          }
        >
          <BrowserRouter initialEntries={[url]}>
            {process.env.SMOKE_PROBE ? <Probe /> : null}
            <App />
          </BrowserRouter>
        </ConvexAuthProvider>
      </ConvexProvider>
    </StrictMode>,
  );

  // createRoot().render() bersifat async: tanpa jeda, isinya belum masuk DOM
  // dan pengecekan apa pun hanya membandingkan kondisi awal. 5 detik memberi
  // ruang untuk WebSocket Convex, query profil, dan render rute terproteksi.
  setTimeout(() => {
    const html = container.innerHTML;
    const probe = win.document.getElementById("probe");
    if (probe) console.log("PROBE", probe.textContent ?? "");
    console.log("DOM_LENGTH", html.length);
    if (html.length === 0) {
      console.log("DOM_KOSONG — inilah penyebab layar putih");
    } else {
      console.log("DOM_SNIPPET", html.slice(0, 200).replace(/\s+/g, " "));
    }
    process.exit(0);
  }, 5000);
}

const email = process.env.SMOKE_EMAIL;
const password = process.env.SMOKE_PASSWORD ?? "6mart2026";

if (email) {
  signIn(email, password)
    .then((tokens) => {
      if (tokens) {
        console.log("SIGNED_IN", email);
        render(tokens);
      } else {
        console.log("SIGN_IN_GAGAL", email);
        render(null);
      }
    })
    .catch((err: unknown) => {
      console.log("SIGN_IN_ERROR", String(err).slice(0, 200));
      render(null);
    });
} else {
  render(null);
}
