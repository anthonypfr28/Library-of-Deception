/**
 * server.js
 * ---------
 * The Library of Deception's front desk. Pure Node.js, no dependencies
 * to install — just `node server.js`.
 *
 * Responsibilities:
 *   1. Regenerate data/files.json by running output.py (the only thing
 *      that reads docs/) whenever the server boots or a refresh is
 *      requested.
 *   2. Serve the static frontend in web/.
 *   3. Expose a small JSON API that web/scripts/main.js calls to render
 *      the repo-style file table and file viewer:
 *
 *        GET  /api/repo              -> repo metadata + file list
 *        GET  /api/files/:name       -> a single file's full record
 *        GET  /api/download/:name    -> raw file, sent as an attachment
 *        POST /api/reindex           -> re-run output.py on demand
 */

const http = require("http");
const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { URL } = require("url");

const PORT = process.env.PORT || 3000;

const ROOT = __dirname;
const DOCS_DIR = path.join(ROOT, "docs");
const DATA_FILE = path.join(ROOT, "data", "files.json");
const WEB_DIR = path.join(ROOT, "web");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/** Run output.py so data/files.json is fresh. */
function reindex() {
  const pythonBin = process.platform === "win32" ? "python" : "python3";
  execFileSync(pythonBin, ["output.py"], { cwd: ROOT, stdio: "inherit" });
}

/** Load the index output.py produced. */
function loadIndex() {
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

/** Serve a file from web/, guarding against path traversal outside WEB_DIR. */
function serveStatic(req, res, pathname) {
  let relativePath = pathname === "/" ? "/index.html" : pathname;
  let fullPath = path.normalize(path.join(WEB_DIR, relativePath));

  if (!fullPath.startsWith(WEB_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.stat(fullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("404 — not found in the archive.");
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    fs.createReadStream(fullPath).pipe(res);
  });
}

// Build the index once at startup so the first request is never empty.
try {
  reindex();
} catch (err) {
  console.error("[server.js] output.py failed on startup:", err.message);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  // -- API routes --------------------------------------------------------

  if (pathname === "/api/repo" && req.method === "GET") {
    try {
      return sendJson(res, 200, loadIndex());
    } catch (err) {
      return sendJson(res, 500, { error: "Could not load the archive index." });
    }
  }

  if (pathname.startsWith("/api/files/") && req.method === "GET") {
    const name = path.basename(pathname.replace("/api/files/", ""));
    try {
      const index = loadIndex();
      const file = index.files.find((f) => f.name === name);
      if (!file) return sendJson(res, 404, { error: "No such document in the archive." });
      return sendJson(res, 200, file);
    } catch (err) {
      return sendJson(res, 500, { error: "Could not load the archive index." });
    }
  }

  if (pathname.startsWith("/api/download/") && req.method === "GET") {
    const requested = path.basename(pathname.replace("/api/download/", ""));
    const fullPath = path.join(DOCS_DIR, requested);
    if (!fullPath.startsWith(DOCS_DIR) || !fs.existsSync(fullPath)) {
      return sendJson(res, 404, { error: "No such document in the archive." });
    }
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${requested}"`,
    });
    return fs.createReadStream(fullPath).pipe(res);
  }

  if (pathname === "/api/reindex" && req.method === "POST") {
    await readBody(req);
    try {
      reindex();
      return sendJson(res, 200, { ok: true, index: loadIndex() });
    } catch (err) {
      return sendJson(res, 500, { error: "Reindexing failed." });
    }
  }

  // -- static frontend -----------------------------------------------------

  if (req.method === "GET") {
    return serveStatic(req, res, pathname);
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`[server.js] Library of Deception is open at http://localhost:${PORT}`);
});
