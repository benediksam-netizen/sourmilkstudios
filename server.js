// Sour Milk Studios website: a tiny static server for Railway.
// Run: npm start   (PORT env var sets the port, default 3000)
const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = Number(process.env.PORT) || 3000;
const MEDIA_TYPES = { ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };
const FILES = { "/": ["index.html", "text/html; charset=utf-8"], "/index.html": ["index.html", "text/html; charset=utf-8"] };
http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  // Send www.sourmilkstudioos.com visitors to the main address.
  const host = String(req.headers.host || "").toLowerCase();
  if (host.startsWith("www.")) {
    res.writeHead(301, { Location: "https://" + host.slice(4) + req.url });
    return res.end();
  }
  // Google AdSense: authorised seller list (https://sourmilkstudioos.com/ads.txt)
  if (url === "/ads.txt") { res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }); return res.end("google.com, pub-7155198025153354, DIRECT, f08c47fec0942fa0\n"); }
  if (url === "/robots.txt") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("User-agent: *\nAllow: /\n\nSitemap: https://sourmilkstudioos.com/sitemap.xml\n"); }
  if (url === "/sitemap.xml") {
    return fs.readFile(path.join(__dirname, "sitemap.xml"), (err, data) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" }); res.end(data);
    });
  }
  // Videos, images and PDF guides in /media (supports seeking, which phones need to play video).
  if (url.startsWith("/media/")) {
    const name = path.basename(url);
    const type = MEDIA_TYPES[path.extname(name).toLowerCase()];
    const file = path.join(__dirname, "media", name);
    if (!type || !/^[a-z0-9._-]+$/i.test(name)) { res.writeHead(404); return res.end("Not found"); }
    return fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end("Not found"); }
      const head = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400" };
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
      if (m && (m[1] || m[2])) {
        let start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
        let end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
        if (start > end || start >= st.size) { res.writeHead(416, { "Content-Range": "bytes */" + st.size }); return res.end(); }
        res.writeHead(206, Object.assign(head, { "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 }));
        if (req.method === "HEAD") return res.end();
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, Object.assign(head, { "Content-Length": st.size }));
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }
  const f = FILES[url] || FILES["/"];   // every path shows the site (e.g. /games/dino-rampage)
  fs.readFile(path.join(__dirname, f[0]), (err, data) => {
    if (err) { res.writeHead(500); return res.end("Server error"); }
    res.writeHead(200, { "Content-Type": f[1], "Cache-Control": "public, max-age=300" });
    res.end(data);
  });
}).listen(PORT, () => console.log("Sour Milk Studios site on port " + PORT));
