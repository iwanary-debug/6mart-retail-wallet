/**
 * Orkestrator dev 6Mart.
 *
 * Backend 6Mart berada di Convex Cloud pada deployment `vibrant-puffin-745`
 * (lihat `VITE_CONVEX_URL` di .env.local). Karena itu preview HANYA perlu
 * menjalankan Vite — tidak ada `convex dev` lokal.
 *
 * Dulu orkestrator ini ikut menjalankan `bunx convex dev`. Perintah tersebut
 * menyalakan `convex-local-backend` ANONIM (port 3210) yang tidak terhubung ke
 * project Convex mana pun: data demo tidak ada di sana, dan token yang
 * diterbitkan memakai issuer lokal sehingga `ctx.auth.getUserIdentity()` gagal.
 * Proses-proses itu sudah dihentikan; logika stale-backend juga dibuang.
 *
 * Untuk mendorong perubahan backend ke Convex Cloud, jalankan dari terminal:
 *   bunx convex dev --once
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const children = [];
let shuttingDown = false;

/**
 * Memuat .env.local dan .env ke process.env.
 *
 * Berguna saat `bun run dev` dijalankan di terminal biasa (bukan lewat preview
 * Freebuff, yang sudah memuat sendiri). Nilai yang sudah ada di environment
 * tidak ditimpa.
 */
function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (key.startsWith("export ")) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
        (value.startsWith("'") && value.endsWith("'") && value.length > 1)
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill("SIGTERM");
      } catch {
        /* proses sudah mati */
      }
    }
  }
  process.exit(code);
}

function start(name, command, args) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
    shell: process.platform === "win32",
  });
  children.push(child);

  const prefix = `[${name}] `;
  const pipe = (stream, target) => {
    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) target.write(prefix + line + "\n");
    });
    stream.on("end", () => {
      if (buffer.trim()) target.write(prefix + buffer + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on("error", (error) => {
    if (shuttingDown) return;
    process.stderr.write(`${prefix}gagal dijalankan: ${error.message}\n`);
    shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    process.stderr.write(`${prefix}proses berhenti (code=${code}, signal=${signal})\n`);
    shutdown(code ?? 1);
  });

  return child;
}

loadEnvFiles();
start("vite", "bunx", ["vite", "--host", "0.0.0.0"]);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}
process.on("exit", () => shutdown(0));
