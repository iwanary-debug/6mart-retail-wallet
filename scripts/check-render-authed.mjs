/**
 * Check render terautentikasi.
 *
 * Merender halaman asli dengan `convex/react` dan `@convex-dev/auth/react`
 * diganti stub, sehingga halaman yang punya args query tidak stabil
 * terdeteksi sebagai "Too many re-renders" tanpa perlu browser sungguhan.
 *
 * Pemakaian:  node scripts/check-render-authed.mjs
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import { spawnSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const stubs = path.resolve(root, "scripts/stubs");

const apiStubPlugin = {
  name: "stub-convex-generated-api",
  enforce: "pre",
  resolveId(source, importer) {
    if (!/[\\/]_generated[\\/]api(\.[jt]s)?$/.test(source)) return null;
    const resolved = importer
      ? path.resolve(path.dirname(importer), source)
      : path.resolve(root, source);
    // Import tanpa ekstensi, jadi ekstensi harus ditambahkan — bukan
    // mengganti yang sudah ada. Berkas hasil codegen adalah `api.js`.
    const withoutExt = resolved.replace(/\.[jt]sx?$/, "");
    const found = [".ts", ".tsx", ".js", ".jsx"]
      .map((ext) => `${withoutExt}${ext}`)
      .some((p) => existsSync(p));
    if (process.env.STUB_DEBUG) {
      console.error("STUB_API?", source, resolved, found);
    }
    // Reference asli buram dan tidak bisa dibaca namanya, jadi query tidak
    // bisa dibedakan tanpa diganti seluruh modul `_generated/api`.
    return found ? path.join(stubs, "api.ts") : null;
  },
};

const result = await build({
  root,
  logLevel: "error",
  plugins: [apiStubPlugin, react()],
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(root, "src") },
      { find: "convex/react", replacement: path.join(stubs, "convex-react.ts") },
      {
        find: "@convex-dev/auth/react",
        replacement: path.join(stubs, "auth-react.tsx"),
      },
    ],
  },
  build: {
    ssr: true,
    write: false,
    rollupOptions: { input: path.resolve(root, "scripts/entry-authed.tsx") },
  },
});

const chunk = result.output?.find((o) => o.type === "chunk");
if (!chunk) {
  console.error("GAGAL: Vite tidak menghasilkan bundle.");
  process.exit(1);
}

const bundlePath = path.join(root, ".render-authed.mjs");
writeFileSync(bundlePath, chunk.code);

const run = spawnSync(process.execPath, [bundlePath], {
  cwd: root,
  encoding: "utf8",
  timeout: 120_000,
});

const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
const noisy = output
  .split("\n")
  .filter(
    (line) =>
      line.trim() &&
      !line.includes("React Router Future Flag") &&
      !line.includes("reactrouter.com") &&
      !line.includes("at "),
  );

for (const line of noisy) console.log(line);

process.exitCode = /HASIL: OK/.test(output) && run.status === 0 ? 0 : 1;
