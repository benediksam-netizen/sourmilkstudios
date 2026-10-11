# Sour Milk Studios website

The official site for Sour Milk Studios: Dino Rampage and Ocean Bound.

- `index.html` is the whole site (images are built in).
- `server.js` serves it on Railway. Start command: `npm start`.

## Cook & Serve

- `games/cook-and-serve/index.html` is the whole game (built from the Cook & Serve project).
- `server.js` serves it on `cookandserve.sourmilkstudioos.com` (and at `/cook-and-serve`), and runs the
  co-op relay at `/ws` (needs the `ws` package, installed by `npm install`).
- `cookserve-api.js` adds chef accounts (name + PIN), cloud saves and friend servers at `/api/...`.
  They are stored in `DATA_DIR` (default `/data` when a Railway volume is mounted there, otherwise `./data`).
  **Mount a Railway volume at `/data`** or the accounts and servers are wiped on every deploy.
