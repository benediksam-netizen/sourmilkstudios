// Cook & Serve online services: chef accounts (name + PIN), cloud saves, and friend servers whose world stays saved.
// Data lives in DATA_DIR (default /data when a Railway volume is mounted there, else ./data next to this file).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA = process.env.DATA_DIR || (fs.existsSync("/data") ? "/data" : path.join(__dirname, "data"));
for (const d of ["", "saves", "worlds"]) fs.mkdirSync(path.join(DATA, d), { recursive: true });
const NAME_RE = /^[\p{L}\p{N} _.'-]{2,14}$/u, PIN_RE = /^\d{4}$/, CODE_RE = /^[A-Z0-9]{4}$/;
const CODE_CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", MAX_BODY = 256 * 1024, LEASE_MS = 15000;

function readJSON(file, dflt) { try { return JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8")); } catch (e) { return dflt; } }
function writeJSON(file, obj) { const f = path.join(DATA, file), tmp = f + "." + process.pid + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, f); }
const accounts = readJSON("accounts.json", {});   // key -> { name, salt, pin, tok, created, look }
const servers = readJSON("servers.json", {});     // code -> { code, name, owner, created, day, members: {key: lastSeen} }
const leases = {};                                 // code -> { key, peer, until }
let dirtyA = false, dirtyS = false;
setInterval(() => { if (dirtyA) { dirtyA = false; writeJSON("accounts.json", accounts); } if (dirtyS) { dirtyS = false; writeJSON("servers.json", servers); } }, 2000).unref();

const keyOf = (name) => String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
const hash = (s, salt) => crypto.scryptSync(String(s), salt, 32).toString("hex");
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
function who(req, body) {
  const auth = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || (body && body.token) || "";
  if (!auth || auth.length > 100) return null;
  const k = auth.split(".")[0], a = accounts[k];
  return a && a.tok === sha(auth) ? Object.assign({ key: k }, a) : null;
}
// a few requests per minute per address for sign-ups and PIN guesses
const hits = new Map();
function limited(req, n) { const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim(), now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < 60000); h.push(now); hits.set(ip, h); return h.length > n; }
setInterval(() => hits.clear(), 10 * 60000).unref();

function send(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(obj)); }
function readBody(req, cb) {
  let n = 0; const chunks = [];
  req.on("data", (c) => { n += c.length; if (n > MAX_BODY) { req.destroy(); return; } chunks.push(c); });
  req.on("end", () => { let b = {}; try { b = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; } catch (e) { b = null; } cb(b); });
}
const pubServer = (s, me) => ({ code: s.code, name: s.name, owner: s.ownerName, day: s.day || 1, money: s.money || 0, mine: !!(me && s.members && s.members[me]), online: s.online || 0 });

// returns true when it handled the request
function handle(req, res, url) {
  if (!url.startsWith("/api/")) return false;
  const m = req.method;
  if (url === "/api/ping") { send(res, 200, { ok: 1 }); return true; }
  readBody(req, (b) => {
    if (b === null) return send(res, 400, { error: "bad json" });
    try { route(req, res, url, m, b); } catch (e) { console.error(e); send(res, 500, { error: "server" }); }
  });
  return true;
}
function route(req, res, url, m, b) {
  // sign up or sign in with a chef name + 4-digit PIN
  if (url === "/api/account" && m === "POST") {
    if (limited(req, 12)) return send(res, 429, { error: "slow down" });
    const name = String(b.name || "").trim(), pin = String(b.pin || ""), k = keyOf(name);
    if (!NAME_RE.test(name)) return send(res, 400, { error: "name", message: "Names are 2–14 letters or numbers" });
    if (!PIN_RE.test(pin)) return send(res, 400, { error: "pin", message: "The PIN is 4 numbers" });
    let a = accounts[k], created = false;
    if (!a) { const salt = crypto.randomBytes(12).toString("hex"); a = accounts[k] = { name, salt, pin: hash(pin, salt), created: Date.now() }; created = true; }
    else if (a.pin !== hash(pin, a.salt)) return send(res, 403, { error: "taken", message: "That name is taken — wrong PIN" });
    const tok = k + "." + crypto.randomBytes(18).toString("hex"); a.tok = sha(tok); dirtyA = true;
    return send(res, 200, { token: tok, name: a.name, created, look: a.look || null });
  }
  const me = who(req, b);
  if (url === "/api/me") return me ? send(res, 200, { name: me.name, look: me.look || null }) : send(res, 401, { error: "auth" });
  if (!me) return send(res, 401, { error: "auth", message: "Sign in first" });
  if (url === "/api/look" && m === "POST") { if (b.look && typeof b.look === "object") { accounts[me.key].look = { g: b.look.g | 0, s: b.look.s | 0, h: b.look.h | 0, c: b.look.c | 0 }; dirtyA = true; } return send(res, 200, { ok: 1 }); }
  // the player's own single-player restaurant
  if (url === "/api/save") {
    const f = "saves/" + sha(me.key).slice(0, 24) + ".json";
    if (m === "GET") return send(res, 200, { save: readJSON(f, null) });
    if (m === "PUT" || m === "POST") { if (!b.save || typeof b.save !== "object") return send(res, 400, { error: "save" }); b.save.t = Date.now(); writeJSON(f, b.save); return send(res, 200, { ok: 1, t: b.save.t }); }
  }
  // friend servers: a named kitchen that stays saved
  if (url === "/api/servers" && m === "GET") {
    const list = Object.values(servers).sort((x, y) => (y.seen || 0) - (x.seen || 0)).slice(0, 40).map((s) => pubServer(s, me.key));
    return send(res, 200, { servers: list });
  }
  if (url === "/api/servers" && m === "POST") {
    if (limited(req, 8)) return send(res, 429, { error: "slow down" });
    const name = String(b.name || "").trim().slice(0, 24) || me.name + "'s Kitchen";
    if (Object.values(servers).filter((s) => s.owner === me.key).length >= 5) return send(res, 400, { error: "max", message: "You can own 5 servers" });
    let code; do { code = Array.from({ length: 4 }, () => CODE_CH[crypto.randomInt(CODE_CH.length)]).join(""); } while (servers[code]);
    servers[code] = { code, name: name.replace(/[<>]/g, ""), owner: me.key, ownerName: me.name, created: Date.now(), seen: Date.now(), members: { [me.key]: Date.now() } }; dirtyS = true;
    return send(res, 200, { server: pubServer(servers[code], me.key) });
  }
  const sm = /^\/api\/servers\/([A-Z0-9]{4})\/(world|claim|leave|join)$/.exec(url);
  if (sm) {
    const code = sm[1], s = servers[code]; if (!s) return send(res, 404, { error: "none", message: "No server with that code" });
    const L = leases[code], now = Date.now();
    if (sm[2] === "join") { s.members = s.members || {}; s.members[me.key] = now; s.seen = now; dirtyS = true; return send(res, 200, { server: pubServer(s, me.key), host: L && L.until > now ? L.name : null }); }
    // only one player runs the kitchen at a time: the host holds a short lease and renews it
    if (sm[2] === "claim") {
      if (L && L.until > now && !(L.key === me.key && L.peer === b.peer)) return send(res, 200, { granted: false, host: L.name });
      leases[code] = { key: me.key, name: me.name, peer: String(b.peer || "").slice(0, 40), until: now + LEASE_MS };
      return send(res, 200, { granted: true, world: readJSON("worlds/" + code + ".json", null) });
    }
    if (sm[2] === "leave") { if (L && L.key === me.key && L.peer === b.peer) delete leases[code]; return send(res, 200, { ok: 1 }); }
    if (sm[2] === "world") {
      if (m === "GET") return send(res, 200, { world: readJSON("worlds/" + code + ".json", null) });
      if (!L || L.key !== me.key || L.peer !== b.peer) return send(res, 409, { error: "not host" });
      L.until = now + LEASE_MS;
      if (b.world && typeof b.world === "object") { b.world.t = now; writeJSON("worlds/" + code + ".json", b.world); s.day = +b.world.day || s.day; s.money = +b.world.money || 0; }
      s.online = Math.max(1, Math.min(4, b.online | 0)); s.seen = now; dirtyS = true;
      return send(res, 200, { ok: 1 });
    }
  }
  send(res, 404, { error: "not found" });
}
module.exports = { handle, DATA };
