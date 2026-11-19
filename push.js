// Notifications on the website: a bell in the header of every page. Crossed out = off; tap it
// to turn them on (for tests, marks, game invites, challenges and family news, like the
// iPhone app). If this browser can't do it, it stays crossed and says why in one line.
(function () {
  const API = "https://lastpage-api.akkikhanna.workers.dev";
  const KEY = "BOtULxBZnGuQc8dm9xKTsKKvK5htXlf51TCwgdzzPDdeNiwGSjUKzKW09VdvAiHqG4tmuyqVtFS0AwCcAwNjvQw";
  const recall = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const remember = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const keyBytes = () => { const s = atob(KEY.replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
  const iOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // Links tapped inside WhatsApp, Instagram or Facebook open in that app's own browser, which can't notify.
  const inAppBrowser = /; wv\)|WhatsApp|FBAN|FBAV|Instagram|Line\//.test(navigator.userAgent);
  const families = () => { try { return JSON.parse(recall("lp.families") || "[]"); } catch { return []; } };

  // This browser's address (the same one Test papers and the family use), made if there isn't one.
  function address() {
    let a = recall("lp.address");
    if (a) return a;
    const L = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    const stem = (recall("lp.from") || "ME").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10) || "ME";
    let tail = ""; for (let i = 0; i < 4; i++) tail += L[Math.floor(Math.random() * L.length)];
    a = stem + "-" + tail; remember("lp.address", a); return a;
  }
  async function register(sub) {
    const addr = address();
    try { await (await caches.open("lastpage-meta")).put("/__addr", new Response(addr)); } catch {}
    const r = await fetch(`${API}/a/${addr}/token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ web: sub.endpoint }) });
    if (!r.ok) throw new Error("server said " + r.status);
  }
  async function current() {
    if (!supported || Notification.permission !== "granted") return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  // The families this browser remembers, checked against the server: members are refreshed, and a
  // family this browser has been removed from (or that's now empty) is forgotten, with a note.
  async function checkFamilies() {
    const addr = recall("lp.address"), saved = families();
    if (!addr || !saved.length) return;
    const mine = (m) => m.addr === addr || (m.addrs || []).includes(addr);
    const kept = [], gone = [];
    for (const f of saved) {
      let fresh;
      try { const r = await fetch(`${API}/f/${f.code}`); if (r.status === 404) { gone.push(f); continue; } if (!r.ok) { kept.push(f); continue; } fresh = await r.json(); }
      catch { kept.push(f); continue; }   // offline: keep what we have
      if ((fresh.members || []).some(mine)) kept.push({ ...f, name: fresh.name, members: fresh.members }); else gone.push(f);
    }
    remember("lp.families", JSON.stringify(kept));
    if (!gone.length) return;
    say(`You're no longer in ${gone.map((f) => `${esc(f.name)} (${f.code})`).join(", ")} on this browser. <a href="/homework/#join">Join with a code</a>`);
    dispatchEvent(new CustomEvent("lp-families", { detail: { gone: gone.map((f) => f.code) } }));
  }

  // ---------- the bell ----------
  const BELL = '<path d="M12 3a6 6 0 0 0-6 6v3.6L4.5 16h15L18 12.6V9a6 6 0 0 0-6-6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.5 19a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  const SLASH = '<path d="M4 3.5 20 20.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
  let btn, tip, on = false;
  function paint() {
    if (!btn) return;
    btn.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${BELL}${on ? "" : SLASH}</svg><span class="bell-label">${on ? "Notifications on" : "Notifications off"}</span>`;
    btn.style.color = on ? "var(--red)" : "var(--muted)";
    btn.setAttribute("aria-pressed", String(on));
    btn.title = on ? "Notifications are on" : "Notifications are off (tap to turn on)";
    btn.setAttribute("aria-label", btn.title);
  }
  // A highlighter note that fades by itself (a little longer when it has a link to tap).
  function say(html) {
    if (!tip) return;
    tip.innerHTML = html;
    tip.style.opacity = "1"; tip.style.transform = "none"; tip.style.pointerEvents = "auto";
    clearTimeout(say.t);
    say.t = setTimeout(hide, html.includes("<a ") ? 7000 : 3500);
  }
  function hide() { if (tip) { tip.style.opacity = "0"; tip.style.transform = "translateY(6px)"; tip.style.pointerEvents = "none"; } }

  // Who this browser is in the family, and which other devices of theirs get the same notifications.
  async function whoGets() {
    const addr = recall("lp.address");
    const fams = families().filter((f) => (f.members || []).some((m) => m.addr === addr || (m.addrs || []).includes(addr)));
    if (!fams.length) return `🔔 On, but only for this browser. Join your family here so they can reach you: <a href="/homework/#join">Join with a code</a>`;
    const m = fams[0].members.find((m) => m.addr === addr || (m.addrs || []).includes(addr));
    let linked = 0;
    try { linked = ((await (await fetch(`${API}/a/${addr}/devices`)).json()).linked || []).length; } catch {}
    const where = fams.map((f) => f.name).join(", ");
    return `🔔 On. You're <b>${esc(m.name)}</b> in ${esc(where)}` + (linked ? ` · your ${linked === 1 ? "phone gets" : linked + " other devices get"} them too` : "");
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function toggle() {
    if (on) return say(await whoGets() + ` · <a href="#" data-off>turn off</a>`);
    if (inAppBrowser && !iOS) return say(`This is WhatsApp's built-in browser, which can't notify. Tap ⋮ at the top, then <b>Open in Chrome</b>, and tap the bell there.`);
    if (!supported) return say(iOS && !installed
      ? `On iPhone: tap Share, then <b>Add to Home Screen</b>, open the site from the new icon, and tap the bell there.`
      : `This browser can't do notifications. Try Chrome.`);
    if (Notification.permission === "denied") return say(`Notifications are blocked for this site. Tap the icon left of the address, then <b>Permissions › Notifications › Allow</b>, and tap the bell again.`);
    try {
      if (await Notification.requestPermission() !== "granted") return say("Notifications weren't allowed, so the bell stays off.");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes() });
      await register(sub);
      on = true; paint();
      say(await whoGets());
    } catch (e) { on = false; paint(); say("Couldn't turn them on: " + e.message); }
  }
  async function mount() {
    const nav = document.querySelector(".site-nav");
    if (!nav || document.getElementById("lpBell")) return;
    btn = document.createElement("button");
    btn.id = "lpBell"; btn.type = "button";
    btn.style.cssText = "background:none;border:0;padding:8px;min-width:44px;min-height:44px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;border-radius:6px;font:inherit;font-size:14px;font-weight:700";
    btn.onclick = () => toggle().catch(() => {});
    nav.appendChild(btn);
    tip = document.createElement("p");
    tip.setAttribute("role", "status");
    tip.style.cssText = "position:fixed;bottom:calc(16px + env(safe-area-inset-bottom));left:12px;right:12px;margin:0 auto;box-sizing:border-box;transform:translateY(6px);z-index:50;max-width:460px;white-space:normal;padding:9px 14px;border-radius:4px;background:#fff3a8;box-shadow:0 2px 10px rgba(0,0,0,.12);font-size:14px;line-height:1.4;color:var(--ink);opacity:0;pointer-events:none;transition:opacity .25s,transform .25s";
    tip.onclick = async (e) => {
      if (e.target.hasAttribute("data-off")) {
        e.preventDefault();
        const sub = await current(); if (sub) await sub.unsubscribe();   // the server drops it on its next send
        on = false; paint(); say("🔕 Off for this browser."); return;
      }
      if (e.target.tagName !== "A") hide();
    };
    document.body.appendChild(tip);
    paint();
    checkFamilies().catch(() => {});
    try { const sub = await current(); if (sub) { on = true; paint(); register(sub).catch(() => {}); } } catch {}
  }
  // On a page where the reason is plain (waiting for a friend): one line offering notifications.
  async function offer(box) {
    if (!box || inAppBrowser || !supported || Notification.permission === "denied") return;
    if (await current().catch(() => null)) return;
    box.innerHTML = `<button class="text-button" type="button">🔔 Turn on notifications, so friends can invite you next time</button>`;
    box.querySelector("button").onclick = async () => { await toggle().catch(() => {}); if (on) box.textContent = "🔔 Notifications on."; };
  }
  // Safari clears a site's storage after a week without a visit; asking for it to be kept
  // protects this browser's families and address (granted for Home Screen sites and the like).
  if (families().length && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  window.LPPush = { render() {}, offer };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", mount); else mount();
})();
