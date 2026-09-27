/**
 * Meng crawl graf impor yang disajikan Vite, mulai dari index.html, dan
 * melaporkan modul yang gagal dimuat.
 *
 * Tujuannya mencari penyebab layar putih: modul yang balas 404/500 tidak
 * akan sampai ke browser, dan browser hanya menampilkan error di console.
 *
 * Pemakaian:  node scripts/crawl-imports.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? "http://127.0.0.1:5173";

const seen = new Set();
const failed = [];

/** Ikuti import relatif/alias dari BODY modul yang sudah ditransformasi Vite. */
function extractImports(body) {
  const specifiers = new Set();
  const patterns = [
    /\bfrom\s*"([^"]+)"/g,
    /\bimport\s*"([^"]+)"/g,
    /\bimport\(\s*"([^"]+)"\s*\)/g,
  ];
  for (const re of patterns) {
    for (const match of body.matchAll(re)) specifiers.add(match[1]);
  }
  return [...specifiers];
}

/** Ubah specifier modul Vite menjadi URL absolut yang bisa di-fetch. */
function toUrl(specifier) {
  if (specifier.startsWith("/")) return BASE + specifier;
  if (specifier.startsWith(".") || specifier.startsWith("@/")) {
    // Alias `@/` sudah di-resolve Vite sebelum sampai ke browser, sehingga
    // di graf Vite specifier selalu berupa path absolut.
    return null;
  }
  return null; // bare specifier sudah jadi chunk /node_modules/.vite/deps
}

async function crawl(url, depth = 0) {
  if (seen.has(url) || depth > 12) return;
  seen.add(url);

  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    failed.push({ url, status: "network", detail: String(error) });
    return;
  }

  if (!response.ok) {
    failed.push({ url, status: response.status, detail: "" });
    return;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("javascript")) return;

  const body = await response.text();
  for (const specifier of extractImports(body)) {
    const next = toUrl(specifier);
    if (next) await crawl(next, depth + 1);
  }
}

const html = await (await fetch(BASE + "/")).text();
for (const match of html.matchAll(/<script[^>]*src="([^"]+)"/g)) {
  await crawl(BASE + match[1]);
}

console.log(`Modul diperiksa: ${seen.size}`);
if (failed.length === 0) {
  console.log("Semua modul terbaca. Layar putih bukan karena modul gagal dimuat.");
} else {
  console.log(`\n${failed.length} modul gagal:`);
  for (const f of failed) console.log(`  [${f.status}] ${f.url} ${f.detail}`);
}
process.exitCode = failed.length === 0 ? 0 : 1;
