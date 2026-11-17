// That Last Page, installed: the pages and fonts are kept so the daily puzzles open without
// signal; anything live (rooms, tests, the board) always goes to the network.
const CACHE = "lastpage-v3";
const KEEP = ["/", "/games/", "/test/sudoku.html", "/test/dots.html", "/test/trail.html", "/test/test.css", "/test/dare.js",
  "/test/sudoku.js", "/test/dots.js", "/test/trail.js", "/play/", "/play/play.js", "/play/room.js", "/play/live.js", "/homework/", "/homework/homework.js",
  "/board/", "/hangman/", "/hangman/hangman.js", "/hangman/hangman.css", "/hangman/rules.js", "/style.css", "/manifest.json",
  "/flames/fonts/Kalam-Regular.ttf", "/flames/fonts/Kalam-Bold.ttf", "/flames/fonts/Caveat-Variable.ttf"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(KEEP.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;   // the server, WhatsApp, the App Store: straight through
  // Network first (so a fresh deploy shows up), falling back to what's kept when offline.
  e.respondWith(fetch(e.request).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match("/games/"))));
});
