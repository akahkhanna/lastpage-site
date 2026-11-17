// Notifications on the website: a browser turns them on once, and gets a buzz for a test, a
// marked paper, a game invite or someone joining the family, like the iPhone app. Shows a
// line in any element with id="pushLine". Chrome on Android, and Safari on an iPhone once the
// site is on the home screen; elsewhere it says what to do, or stays quiet.
(function () {
  const API = "https://lastpage-api.akkikhanna.workers.dev";
  const KEY = "BOtULxBZnGuQc8dm9xKTsKKvK5htXlf51TCwgdzzPDdeNiwGSjUKzKW09VdvAiHqG4tmuyqVtFS0AwCcAwNjvQw";
  const recall = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const keyBytes = () => { const s = atob(KEY.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  async function remember(addr) {
    try { await (await caches.open("lastpage-meta")).put("/__addr", new Response(addr)); } catch {}
  }
  async function register(sub) {
    const addr = recall("lp.address");
    if (!addr) return false;
    await remember(addr);
    const r = await fetch(`${API}/a/${addr}/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ web: sub.endpoint }) });
    return r.ok;
  }
  async function current() {
    if (!supported) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }
  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return render();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes() });
    await register(sub);
    render();
  }
  async function render() {
    const el = document.getElementById("pushLine");
    if (!el) return;
    const line = (html) => { el.hidden = false; el.innerHTML = html; };
    if (!recall("lp.address")) { el.hidden = true; return; }   // nothing can be sent here yet
    if (!supported) {
      if (iOS && !installed) line(`On iPhone, get notifications by adding this site to your Home Screen (Share → Add to Home Screen) and opening it from there.`);
      else el.hidden = true;
      return;
    }
    if (Notification.permission === "denied") { line(`Notifications are blocked for this site. Turn them on in your browser's site settings.`); return; }
    const sub = Notification.permission === "granted" ? await current() : null;
    if (sub) { register(sub).catch(() => {}); line(`🔔 Notifications are on for this browser.`); return; }
    line(`<button class="text-button" id="pushOn">🔔 Turn on notifications</button> <span class="board-note">for tests, game invites and family news</span>`);
    document.getElementById("pushOn").onclick = () => enable().catch((e) => line(`Couldn't turn them on: ${e.message}`));
  }
  window.LPPush = { render };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", render); else render();
})();
