// Mini serveur statique, sans dépendance, pour jouer en local ou depuis un téléphone sur le même Wi-Fi.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const PORT = Number(process.env.PORT || 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png" };

http
  .createServer((req, res) => {
    let file = path.normalize(path.join(root, decodeURIComponent(req.url.split("?")[0])));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (err, data) => {
      if (err) return res.writeHead(404).end("Introuvable");
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(data);
    });
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log(`\n  Écho : http://localhost:${PORT}`);
    for (const nets of Object.values(os.networkInterfaces()))
      for (const n of nets || []) if (n.family === "IPv4" && !n.internal) console.log(`  Depuis ton téléphone (même Wi-Fi) : http://${n.address}:${PORT}`);
    console.log("");
  });
