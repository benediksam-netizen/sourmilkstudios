// Builds one HTML document per page of the site from index.html, so every page has its own address,
// title, description and canonical link, and only that page's content (good for Google and AdSense).
const fs = require("fs");
const path = require("path");
const SITE = "https://sourmilkstudioos.com";
const GAMES_DESC = "Play Dino Rampage, Ocean Bound, Sour Milk Logistics and Cook & Serve free in your browser.";
const PAGES = {
  "/": { id: "home", title: "Sour Milk Studios · Free browser games", desc: "Sour Milk Studios is an independent game studio. " + GAMES_DESC },
  "/games": { id: "games", title: "Our Games · Sour Milk Studios", desc: "All Sour Milk Studios games: Dino Rampage, Ocean Bound, Sour Milk Logistics and Cook & Serve, free in your browser, plus the games coming soon." },
  "/games/dino-rampage": { id: "dino-rampage", title: "Dino Rampage: Eat & Grow! · How to play · Sour Milk Studios", desc: "Dino Rampage is a free 3D dinosaur game in your browser. Controls, all 15 dinosaurs, the island areas, Hide & Seek and tips to grow fast." },
  "/games/ocean-bound": { id: "ocean-bound", title: "Ocean Bound · Fishing game guide · Sour Milk Studios", desc: "Ocean Bound is a free fishing and island adventure in your browser. Controls, how the fishing fight works, where to sail, pearls, levels and legendary bosses." },
  "/games/sour-milk-logistics": { id: "sour-milk-logistics", title: "Sour Milk Logistics · Shipping and trade game · Sour Milk Studios", desc: "Run a shipping company in a living world economy. Getting started, game modes, the ten screens and a free tutorial and finance study guide." },
  "/games/cook-and-serve": { id: "cook-and-serve", title: "Cook & Serve · Restaurant cooking game · Sour Milk Studios", desc: "Shop around a seaside town, cook 36 dishes from six cuisines and run your own restaurant, alone or with friends. Free in your browser." },
  "/about": { id: "about", title: "About Sour Milk Studios", desc: "Sour Milk Studios makes free games you can play in any web browser, alone or with friends. Our games, what we value and what is coming next." },
  "/news": { id: "news", title: "News · Sour Milk Studios", desc: "Game launches, updates and announcements from Sour Milk Studios." },
  "/careers": { id: "careers", title: "Careers · Sour Milk Studios", desc: "Want to make games with Sour Milk Studios? Send us your portfolio." },
  "/contact": { id: "contact", title: "Contact · Sour Milk Studios", desc: "Get in touch with Sour Milk Studios by email or on Instagram." },
  "/privacy": { id: "privacy", title: "Privacy Policy · Sour Milk Studios", desc: "How the Sour Milk Studios website and games handle your data, cookies and ads." },
};
const esc = (t) => t.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
let cache = null;
function load() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const starts = [...html.matchAll(/<!-- =+ [^\n]*=+ -->\n<div class="page"|<div class="page"/g)];
  // split into: head part, page blocks, tail part
  const blocks = [], re = /<div class="page" data-page="([a-z-]+)"( hidden)?>/g;
  let m; const found = [];
  while ((m = re.exec(html))) found.push({ id: m[1], start: m.index });
  const mainEnd = html.indexOf("</main>");
  found.forEach((f, i) => {
    let end = i + 1 < found.length ? found[i + 1].start : mainEnd;
    // a page's own comment banner sits just before it: leave it with the next page
    const banner = html.lastIndexOf("<!-- ", end);
    if (banner > f.start) end = banner;
    blocks.push({ id: f.id, start: f.start, end });
  });
  return { html, blocks, starts };
}
function render(urlPath) {
  if (!cache || process.env.NODE_ENV === "development") cache = load();
  const page = PAGES[urlPath];
  if (!page) return null;
  const { html, blocks } = cache;
  let out = "", pos = 0;
  for (const b of blocks) {
    out += html.slice(pos, b.start);
    if (b.id === page.id) out += html.slice(b.start, b.end).replace(/(<div class="page" data-page="[a-z-]+")( hidden)?>/, "$1>");
    pos = b.end;
  }
  out += html.slice(pos);
  const url = SITE + urlPath;
  out = out
    .replace(/<title>[^<]*<\/title>/, "<title>" + esc(page.title) + "</title>")
    .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="' + esc(page.desc) + '">')
    .replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + url + '">')
    .replace(/<meta property="og:url" content="[^"]*">/, '<meta property="og:url" content="' + url + '">')
    .replace(/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="' + esc(page.title) + '">')
    .replace(/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="' + esc(page.desc) + '">')
    .replace(/<meta name="twitter:title" content="[^"]*">/, '<meta name="twitter:title" content="' + esc(page.title) + '">')
    .replace(/<meta name="twitter:description" content="[^"]*">/, '<meta name="twitter:description" content="' + esc(page.desc) + '">');
  // the game data (JSON-LD) belongs on the home page only
  if (page.id !== "home") out = out.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\n?/, "");
  return out;
}
function sitemap() {
  const today = new Date().toISOString().slice(0, 10);
  const pri = (p) => (p === "/" ? "1.0" : p.startsWith("/games") ? "0.9" : p === "/news" || p === "/about" ? "0.7" : "0.4");
  const urls = Object.keys(PAGES).map((p) => `  <url>\n    <loc>${SITE}${p}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${pri(p)}</priority>\n  </url>`);
  urls.push(`  <url>\n    <loc>${SITE}/media/sour-milk-logistics-guide.pdf</loc>\n    <priority>0.6</priority>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}
module.exports = { PAGES, render, sitemap };
