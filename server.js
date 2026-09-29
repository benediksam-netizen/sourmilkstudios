// Sour Milk Studios website: a tiny static server for Railway.
// Run: npm start   (PORT env var sets the port, default 3000)
const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = Number(process.env.PORT) || 3000;
const FILES = { "/": ["index.html", "text/html; charset=utf-8"], "/index.html": ["index.html", "text/html; charset=utf-8"] };
http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  if (url === "/robots.txt") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("User-agent: *\nAllow: /\n\nSitemap: https://sourmilkstudioos.com/sitemap.xml\n"); }
  if (url === "/sitemap.xml") {
    return fs.readFile(path.join(__dirname, "sitemap.xml"), (err, data) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" }); res.end(data);
    });
  }
  const f = FILES[url] || FILES["/"];   // every path shows the site (e.g. /games/dino-rampage)
  fs.readFile(path.join(__dirname, f[0]), (err, data) => {
    if (err) { res.writeHead(500); return res.end("Server error"); }
    res.writeHead(200, { "Content-Type": f[1], "Cache-Control": "public, max-age=300" });
    res.end(data);
  });
}).listen(PORT, () => console.log("Sour Milk Studios site on port " + PORT));
