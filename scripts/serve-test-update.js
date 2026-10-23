#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist-release");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

const MIME_TYPES = {
  ".json": "application/json",
  ".sig": "text/plain",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".msi": "application/x-msi",
  ".appimage": "application/octet-stream",
  ".deb": "application/vnd.debian.binary-package",
  ".rpm": "application/x-rpm",
  ".txt": "text/plain",
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS, HEAD");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Parse path and strip query string
  const cleanUrl = (req.url || "/").split("?")[0];
  let decodedUrl = cleanUrl;
  try {
    decodedUrl = decodeURIComponent(cleanUrl);
  } catch {
    // Keep raw if decoding fails
  }

  const relativePath = decodedUrl === "/" ? "latest.json" : decodedUrl.replace(/^\/+/, "");
  const filePath = path.resolve(distDir, relativePath);

  // Security check: ensure path is strictly within distDir
  const relFromDist = path.relative(distDir, filePath);
  if (relFromDist.startsWith("..") || path.isAbsolute(relFromDist)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const stat = fs.statSync(filePath);

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
    });

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = fs.createReadStream(filePath);
    stream.on("error", (err) => {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" });
      }
      res.end("Stream error: " + err.message);
    });
    stream.pipe(res);
    console.log(`[200] Serving: ${relativePath} (${(stat.size / 1024).toFixed(1)} KB)`);
  } else {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(`File not found: ${cleanUrl}\nServing directory: ${distDir}\n`);
    console.warn(`[404] Not Found: ${cleanUrl}`);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n======================================================`);
  console.log(`📡 Omnis Local Update Test Server`);
  console.log(`======================================================`);
  console.log(`URL:            http://127.0.0.1:${PORT}`);
  console.log(`Endpoint:       http://127.0.0.1:${PORT}/latest.json`);
  console.log(`Serving from:   ${distDir}`);
  console.log(`======================================================\n`);
  if (!fs.existsSync(distDir)) {
    console.log(`⚠️  Warning: Directory "${distDir}" does not exist yet.`);
    console.log(`   Create it and place "latest.json" and update bundles there.\n`);
  }
});
