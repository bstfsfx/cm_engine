/*
 * ChromaLab — a dependency-free static server for local development.
 *
 * Use `npm run serve` when you do not want the Vite build. Vite remains the
 * supported path for the ICC WebAssembly runtime, because it resolves and
 * fingerprints the `.wasm` asset for you.
 *
 * Usage: node scripts/serve.js [port]
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 3000);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".icc": "application/vnd.iccprofile",
  ".icm": "application/vnd.iccprofile"
};

/**
 * Resolve a request path to a file inside the project root.
 *
 * @param {string} pathname The decoded request path.
 * @returns {string | null} The absolute file path, or null if it escapes the root.
 */
function resolvePath(pathname) {
  const relative = normalize(pathname === "/" ? "/index.html" : pathname).replace(
    /^(\.\.[/\\])+/,
    ""
  );
  const filePath = join(ROOT, relative);
  return filePath.startsWith(ROOT) ? filePath : null;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const filePath = resolvePath(decodeURIComponent(url.pathname));

    if (!filePath) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    let target = filePath;
    const info = await stat(target).catch(() => null);

    if (info?.isDirectory()) {
      target = join(target, "index.html");
    }

    const data = await readFile(target);

    res.writeHead(200, {
      "Content-Type": MIME_TYPES[extname(target).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-cache"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
});

server.listen(PORT, () => {
  console.log(`ChromaLab serving ${ROOT}`);
  console.log(`Open http://localhost:${PORT}`);
});
