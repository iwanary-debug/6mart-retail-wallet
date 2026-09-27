/**
 * Memeriksa halaman benar-benar ter-render, bukan sekadar tidak melempar.
 *
 * Vite membundel `scripts/entry-smoke.tsx` menjadi satu chunk yang dieksekusi
 * di Node dengan DOM dari happy-dom. Ini menangkap kegagalan yang tidak bisa
 * terlihat dari HTML: React yang melepas pohon karena error, atau DOM yang
 * tetap kosong.
 *
 * Pemakaian:  node scripts/check-render.mjs
 */

import { build } from "vite";
import react from "@vitejs/plugin-react";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = process.cwd();
const outDir = mkdtempSync(path.join(tmpdir(), "6mart-render-"));

const result = await build({
  root,
  logLevel: "error",
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(root, "src") } },
  build: {
    ssr: true,
    write: false,
    rollupOptions: { input: path.resolve(root, "scripts/entry-smoke.tsx") },
  },
});

const chunk = result.output?.find((o) => o.type === "chunk");
if (!chunk) {
  console.error("GAGAL: Vite tidak menghasilkan bundle.");
  process.exit(1);
}

const bundlePath = path.join(root, ".render-check.mjs");
writeFileSync(bundlePath, chunk.code);

const run = spawnSync(process.execPath, [bundlePath], {
  cwd: root,
  encoding: "utf8",
  timeout: 60_000,
});

const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
const noisy = output
  .split("\n")
  .filter(
    (line) =>
      line.trim() &&
      !line.includes("React Router Future Flag") &&
      !line.includes("reactrouter.com"),
  );

for (const line of noisy) console.log(line);

const length = Number(/DOM_LENGTH (\d+)/.exec(output)?.[1] ?? "0");
const snippet = /DOM_SNIPPET (.*)/.exec(output)?.[1] ?? "";

if (run.status !== 0 || length === 0) {
  console.log("\nHASIL: GAGAL — root DOM kosong atau render melempar.");
  process.exitCode = 1;
} else {
  console.log(`\nHASIL: OK — root terisi ${length} karakter.`);
  console.log(`Cuplikan: ${snippet.slice(0, 160)}`);
}
