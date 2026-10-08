// Sour Milk Studios website: a tiny static server for Railway.
// Run: npm start   (PORT env var sets the port, default 3000)
const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = Number(process.env.PORT) || 3000;
const MEDIA_TYPES = { ".mp4": "video/mp4", ".webm": "video/webm", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".pdf": "application/pdf" };
// Cook & Serve: the game lives in games/cook-and-serve and is served on cookandserve.sourmilkstudioos.com
// (and at sourmilkstudioos.com/cook-and-serve). Its co-op multiplayer talks to the relay at /ws below.
const COOK_HOSTS = /^(cookandserve|cook-and-serve|cook)\./;
const COOK_PAGE = path.join(__dirname, "games", "cook-and-serve", "index.html");
const FILES = { "/": ["index.html", "text/html; charset=utf-8"], "/index.html": ["index.html", "text/html; charset=utf-8"] };
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  // Send www.sourmilkstudioos.com visitors to the main address.
  const host = String(req.headers.host || "").toLowerCase();
  if (host.startsWith("www.")) {
    res.writeHead(301, { Location: "https://" + host.slice(4) + req.url });
    return res.end();
  }
  if (COOK_HOSTS.test(host) || url === "/cook-and-serve" || url.startsWith("/cook-and-serve/")) {
    if (url === "/robots.txt") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end("User-agent: *\nAllow: /\n"); }
    if (url === "/ads.txt") { res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("google.com, pub-7155198025153354, DIRECT, f08c47fec0942fa0\n"); }
    return fs.readFile(COOK_PAGE, (err, data) => {
      if (err) { res.writeHead(500); return res.end("Server error"); }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }); res.end(data);
    });
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
});

// Co-op relay for Cook & Serve: players in the same 4-letter room share their state (presence) through here.
const { WebSocketServer } = require("ws");
const crypto = require("crypto");
const ROOM_RE = /^[a-z0-9][a-z0-9_.-]{0,47}$/, MAX_ROOMS = 16, MAX_PEERS = 64;
const rooms = new Map();
const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16 * 1024 });
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
function leave(c, name) {
  const r = rooms.get(name); if (!r || !r.has(c.peer)) return;
  r.delete(c.peer); c.rooms.delete(name); delete c.pres[name];
  r.forEach((o) => send(o.ws, { t: "left", room: name, peer: c.peer }));
  if (!r.size) rooms.delete(name);
}
wss.on("connection", (ws) => {
  const c = { ws, peer: crypto.randomBytes(8).toString("hex"), rooms: new Set(), pres: {}, alive: true };
  send(ws, { t: "hello", peer: c.peer });
  ws.on("pong", () => (c.alive = true));
  ws.on("message", (data) => {
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (!m || typeof m.room !== "string" || !ROOM_RE.test(m.room)) return;
    if (m.t === "join") {
      if (c.rooms.has(m.room) || c.rooms.size >= MAX_ROOMS) return;
      const r = rooms.get(m.room) || new Map(); if (r.size >= MAX_PEERS) return; rooms.set(m.room, r);
      send(ws, { t: "peers", room: m.room, peers: Array.from(r.values()).map((o) => ({ peer: o.peer, p: o.pres[m.room] || {} })) });
      r.set(c.peer, c); c.rooms.add(m.room);
    } else if (m.t === "pres") {
      const r = rooms.get(m.room); if (!r || !r.has(c.peer) || typeof m.p !== "object" || m.p === null) return;
      c.pres[m.room] = m.p;
      r.forEach((o) => { if (o !== c) send(o.ws, { t: "pres", room: m.room, peer: c.peer, p: m.p }); });
    } else if (m.t === "leave") leave(c, m.room);
  });
  ws.on("close", () => Array.from(c.rooms).forEach((n) => leave(c, n)));
  c.ping = setInterval(() => { if (!c.alive) { clearInterval(c.ping); return ws.terminate(); } c.alive = false; try { ws.ping(); } catch (e) { /* closed */ } }, 30000);
  ws.on("close", () => clearInterval(c.ping));
});

server.listen(PORT, () => console.log("Sour Milk Studios site on port " + PORT));
