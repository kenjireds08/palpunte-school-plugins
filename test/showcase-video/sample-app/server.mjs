// 見本アプリ「ヨヤクル」（架空の料理教室の予約アプリ）を手元で動かすだけの小さなサーバー。
// データはブラウザの localStorage だけに入る（サーバーには何も保存しない）。
//   node test/showcase-video/sample-app/server.mjs [--port 4173]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const i = process.argv.indexOf("--port");
const PORT = i >= 0 ? Number(process.argv[i + 1]) : 4173;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
const ROUTES = { "/": "index.html", "/admin": "admin.html" };

http
  .createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method !== "GET") {
      res.writeHead(405).end();
      return;
    }
    const rel = ROUTES[u.pathname] ?? u.pathname.replace(/^\/+/, "");
    const file = path.resolve(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || file.includes(`${path.sep}promo-video${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, "127.0.0.1", () => console.log(`ヨヤクル: http://127.0.0.1:${PORT}/ （管理: /admin）`));
