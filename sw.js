// That Last Page, installed: the pages and fonts are kept so the daily puzzles open without
// signal; anything live (rooms, tests, the board) always goes to the network.
const CACHE = "lastpage-v8";
const META = "lastpage-meta";   // this browser's test address, for the push handler
const KEEP = ["/", "/games/", "/test/sudoku.html", "/test/dots.html", "/test/trail.html", "/test/test.css", "/test/dare.js",
  "/test/sudoku.js", "/test/dots.js", "/test/trail.js", "/play/", "/play/play.js", "/play/room.js", "/play/live.js", "/homework/", "/homework/homework.js",
  "/board/", "/hangman/", "/hangman/hangman.js", "/hangman/hangman.css", "/hangman/rules.js", "/style.css", "/site.css", "/site.js", "/push.js", "/manifest.json",
  "/flames/fonts/Kalam-Regular.ttf", "/flames/fonts/Kalam-Bold.ttf", "/flames/fonts/Caveat-Variable.ttf"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(KEEP.map((u) => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== META).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
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

// ---------- notifications ----------
// The server sends an empty push (nothing to decrypt); the inbox says what it was about.
const API = "https://lastpage-api.akkikhanna.workers.dev";
const GAMES = { noughtsCrosses: "noughts & crosses", bookCricket: "book cricket", dotsBoxes: "dots & boxes", hangman: "hangman",
  bollywood: "Bollywood", hollywood: "Hollywood", namePlace: "name place animal thing" };
function describe(e) {
  if (e.kind === "room") return { title: `${e.from} wants to play ${GAMES[e.game] || "a game"} ✏️`, body: "tap to join them", url: `/play/#r-${e.code}` };
  if (e.kind === "dare") { const page = { sudoku: "sudoku", dots: "dots", trail: "trail" }[e.puzzle] || "sudoku";
    const clock = `${Math.floor(e.secs / 60)}:${String(e.secs % 60).padStart(2, "0")}`;
    return { title: `${e.from} challenges you to today's ${{ sudoku: "mini sudoku", dots: "dot to dot", trail: "word trail" }[e.puzzle] || "puzzle"} ✏️`, body: `beat ${clock}`,
      url: `/test/${page}.html#${e.day + 1}-${e.secs}-${encodeURIComponent(e.from)}` }; }
  if (e.kind === "family") return { title: `${e.from} joined the family ✏️`, body: "set them a test, or ask them to play", url: "/board/" };
  if (e.stage === "answered") return { title: `${e.from} has handed in their paper`, body: "tap to mark it", url: `/homework/#${e.code}` };
  if (e.stage === "marked") return { title: `Your paper is back from ${e.from}`, body: "tap to see your marks", url: `/homework/#${e.code}` };
  return { title: `A test from ${e.from} ✏️`, body: "tap to do it", url: `/homework/#${e.code}` };
}
async function latest() {
  const hit = await (await caches.open(META)).match("/__addr");
  const addr = hit ? (await hit.text()).trim() : "";
  if (!addr) return null;
  const list = await (await fetch(`${API}/a/${addr}`, { cache: "no-store" })).json();
  return Array.isArray(list) && list.length ? list.slice().sort((a, b) => (b.at || 0) - (a.at || 0))[0] : null;
}
self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let n = { title: "Something new in That Last Page ✏️", body: "tap to see", url: "/homework/" }, tag = "lastpage";
    try { const item = await latest(); if (item) { n = describe(item); tag = `${item.kind || "test"}-${item.code}-${item.stage}`; } } catch {}
    await self.registration.showNotification(n.title, { body: n.body, tag, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: n.url } });
  })());
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/homework/", self.location.origin).href;
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = tabs.find((c) => new URL(c.url).origin === self.location.origin);
    if (same) { await same.focus(); return same.navigate(url); }
    return self.clients.openWindow(url);
  })());
});
