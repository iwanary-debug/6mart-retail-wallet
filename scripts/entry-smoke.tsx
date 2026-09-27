/**
 * Entry sementara untuk mendeteksi exception saat render.
 *
 * Vite membundel berkas ini menjadi satu chunk yang bisa dieksekusi Node,
 * sehingga alias `@/`, transform TSX, dan semua import ter-resolve persis
 * seperti di browser. DOM disuplai oleh happy-dom, bukan tiruan sederhana,
 * supaya react-dom bisa benar-benar mount.
 */

import { Window } from "happy-dom";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import App from "@/App";

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

// Pakai URL deployment sungguhan supaya WebSocket benar-benar tersambung,
// persis seperti di browser.
const client = new ConvexReactClient(
  "https://vibrant-puffin-745.convex.cloud" as string,
);

const container = win.document.createElement("div");
win.document.body.appendChild(container);

const root = createRoot(container);

root.render(
  <StrictMode>
    <ConvexProvider client={client}>
      <ConvexAuthProvider client={client}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ConvexAuthProvider>
    </ConvexProvider>
  </StrictMode>,
);

// createRoot().render() bersifat async: tanpa jeda, isinya belum masuk DOM
// dan pengecekan apa pun hanya membandingkan kondisi awal.
setTimeout(() => {
  const html = container.innerHTML;
  console.log("DOM_LENGTH", html.length);
  if (html.length === 0) {
    console.log("DOM_KOSONG — inilah penyebab layar putih");
  } else {
    console.log("DOM_SNIPPET", html.slice(0, 200).replace(/\s+/g, " "));
  }
  process.exit(0);
}, 1500);
