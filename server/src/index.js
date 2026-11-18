// Homework by code and by address, nothing else stored. A "Box" is one Durable Object per
// code (holding one piece of homework as it goes set → answered → marked) or per address
// (holding a short inbox of codes for that notebook). Everything expires on its own:
// homework 30 days after the last change, inboxes 60 days after the last delivery.
//
//   POST /h            body: homework JSON (+ optional ta/fa addresses) → { code }
//   GET  /h/CODE       → homework JSON (latest stage)
//   PUT  /h/CODE       body: homework JSON, same id, a later stage → { ok }
//   GET  /a/ADDRESS    → [{ code, stage, from, at }]  newest first
//
// Notifications: a phone registers its push token against its address; every delivery to
// that address also sends a push through Apple (APNs), so homework arrives with a knock.
//   POST /a/ADDRESS/token   body: { token, env: "prod"|"sandbox" }  → { ok }
//
// Rooms: a live game between phones and browsers. One Durable Object per room keeps the
// ordered log of game messages and relays them over WebSockets; anyone who drops out
// reconnects with the same id and replays what they missed. Rooms expire a day after the
// last message. The messages themselves are the app's NearbyMessage JSON, untouched.
//   POST /r                 body: { game, players, host: { id, name } }  → { code }
//   GET  /r/CODE            → { code, game, players, members: [{ id, name, label }] }
//   WS   /r/CODE?id=…&name=…&since=N   (a WebSocket; see Room below for the frames)
//   POST /r/CODE/invite     body: { addr, from }  → delivers "come and play" to an address (+ push)
//
// Family board: each notebook posts its daily puzzle times against its address; a family's
// board gathers its members' last few weeks.
//   POST /a/ADDRESS/result   body: { day, puzzle: "sudoku"|"dots"|"trail", seconds, hints }  → { ok }
//   GET  /f/CODE/board?day=N → { day, members: [{ name, addr, days: { "N": { sudoku: {s,h}, … }, … } }] }
//
// Families: a named group of notebooks, joined once by link, so homework can be sent to
// "Vihaan" rather than to an address. Expire 180 days after the last change.
//   POST /f                 body: { name, member: { name, addr } }   → { code }
//   GET  /f/CODE            → { code, name, members: [{ name, addr, at }] }
//   POST /f/CODE/join       body: { name, addr }                    → family
//   POST /f/CODE/leave      body: { addr }                          → family
//
// Addresses look like VIHAAN-7K2M (made on the phone; no account). Codes are 6 letters.

const CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const ADDRESS = /^[A-Z]{1,10}-[A-HJ-NP-Z2-9]{4}$/;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_BODY = 16 * 1024;
const STAGES = ["set", "answered", "marked"];
const HOMEWORK_DAYS = 30, INBOX_DAYS = 60, FAMILY_DAYS = 180, MAX_MEMBERS = 30;
const ROOM_HOURS = 24, ROOM_LOG_MAX = 3000, ROOM_MSG_MAX = 8 * 1024;
const GAMES = new Set(["bookCricket", "noughtsCrosses", "dotsBoxes", "hangman", "bollywood", "hollywood", "namePlace"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...CORS } });
const fail = (status, message) => json({ error: message }, status);

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);
    try {
      if (parts[0] === "h" && parts.length === 1 && request.method === "POST") return await createHomework(request, env);
      if (parts[0] === "h" && parts.length === 2) {
        const code = parts[1].toUpperCase();
        if (!CODE.test(code)) return fail(400, "not a code");
        if (request.method === "GET") return await box(env, "h:" + code).fetch("https://box/get");
        if (request.method === "PUT") return await updateHomework(request, env, code);
      }
      if (parts[0] === "a" && parts.length >= 2) {
        const addr = parts[1].toUpperCase();
        if (!ADDRESS.test(addr)) return fail(400, "not an address");
        if (parts.length === 2 && request.method === "GET") return await box(env, "a:" + addr).fetch("https://box/inbox-get");
        if (parts.length === 3 && parts[2] === "result" && request.method === "POST") {
          const body = await request.text();
          if (body.length > 512) return fail(400, "too big");
          let r; try { r = JSON.parse(body); } catch { return fail(400, "not JSON"); }
          const day = parseInt(r.day, 10), seconds = parseInt(r.seconds, 10), hints = parseInt(r.hints, 10) || 0;
          if (!["sudoku", "dots", "trail"].includes(r.puzzle) || !(day >= 0 && day < 100000) || !(seconds > 0 && seconds < 86400)) return fail(400, "bad result");
          return await box(env, "a:" + addr).fetch("https://box/result-add", { method: "POST", body: JSON.stringify({ day, puzzle: r.puzzle, s: seconds, h: hints }) });
        }
        if (parts.length === 3 && parts[2] === "devices" && request.method === "GET") {
          const r = await box(env, "a:" + addr).fetch("https://box/token-list");
          const list = r.status === 200 ? await r.json() : [];
          const aliases = await (await box(env, "a:" + addr).fetch("https://box/alias-get")).json().catch(() => []);
          return json({ push: list.map((t) => ({ kind: t.env, since: t.at })), linked: aliases });
        }
        if (parts.length === 3 && parts[2] === "dare" && request.method === "POST") return await dareTo(request, env, addr);
        if (parts.length === 3 && parts[2] === "token" && request.method === "POST") {
          const body = await request.text();
          if (body.length > 1024) return fail(400, "too big");
          let t; try { t = JSON.parse(body); } catch { return fail(400, "not JSON"); }
          if (t.web) {
            // A browser's Web Push endpoint (Chrome on Android, Safari on a home-screen iPhone, …).
            let u; try { u = new URL(String(t.web)); } catch { return fail(400, "bad endpoint"); }
            if (u.protocol !== "https:" || String(t.web).length > 900) return fail(400, "bad endpoint");
            return await box(env, "a:" + addr).fetch("https://box/token-add", { method: "POST", body: JSON.stringify({ token: String(t.web), env: "web" }) });
          }
          if (!/^[0-9a-f]{32,200}$/i.test(t.token || "")) return fail(400, "bad token");
          const envName = t.env === "sandbox" ? "sandbox" : "prod";
          return await box(env, "a:" + addr).fetch("https://box/token-add", { method: "POST", body: JSON.stringify({ token: t.token.toLowerCase(), env: envName }) });
        }
      }
      if (parts[0] === "r" && parts.length === 1 && request.method === "POST") return await createRoom(request, env);
      if (parts[0] === "r" && parts.length >= 2) {
        const code = parts[1].toUpperCase();
        if (!CODE.test(code)) return fail(400, "not a code");
        const room = env.ROOM.get(env.ROOM.idFromName(code));
        if (parts.length === 2) return await room.fetch(request);   // GET info, or the WebSocket upgrade
        if (parts.length === 3 && parts[2] === "invite" && request.method === "POST") return await inviteToRoom(request, env, code, room);
      }
      if (parts[0] === "f" && parts.length === 1 && request.method === "POST") return await createFamily(request, env);
      if (parts[0] === "f" && parts.length >= 2) {
        const code = parts[1].toUpperCase();
        if (!CODE.test(code)) return fail(400, "not a code");
        const fam = box(env, "f:" + code);
        if (parts.length === 2 && request.method === "GET") return await fam.fetch("https://box/family-get");
        if (parts.length === 3 && parts[2] === "board" && request.method === "GET") return await familyBoard(env, fam, url);
        if (parts.length === 3 && request.method === "POST" && (parts[2] === "join" || parts[2] === "leave")) {
          const body = await request.text();
          if (body.length > 2048) return fail(400, "too big");
          const r = await fam.fetch("https://box/family-" + parts[2], { method: "POST", body });
          if (r.status !== 200) return r;
          const f = await r.json();
          // The person's devices now know about each other, so deliveries reach all of them.
          const linked = f.linked || [];
          for (const a of linked) await box(env, "a:" + a).fetch("https://box/alias-set", { method: "POST", body: JSON.stringify({ code, addrs: linked.filter((x) => x !== a) }) });
          if (parts[2] === "leave") { const addr = String((JSON.parse(body) || {}).addr || "").toUpperCase(); if (ADDRESS.test(addr)) await box(env, "a:" + addr).fetch("https://box/alias-set", { method: "POST", body: JSON.stringify({ code, addrs: [] }) }); }
          // Joining again from a device that's already in (the same person, same name) tells nobody.
          if (parts[2] === "join" && !f.rejoined) { const b = JSON.parse(body) || {}; await notifyJoin(env, f, cleanName(b.name), String(b.addr || "").toUpperCase(), linked.length); }
          delete f.linked; delete f.rejoined;
          return json(f);
        }
      }
      if (parts.length === 0) return json({ ok: true, what: "That Last Page: homework by code" });
      return fail(404, "nothing here");
    } catch (e) {
      return fail(500, String(e && e.message || e));
    }
  },
};

const box = (env, name) => env.BOX.get(env.BOX.idFromName(name));

async function readHomework(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) return [null, "too big"];
  let hw;
  try { hw = JSON.parse(text); } catch { return [null, "not JSON"]; }
  if (!hw || typeof hw.id !== "string" || !hw.id || hw.id.length > 12) return [null, "no id"];
  if (typeof hw.from !== "string" || !hw.from || hw.from.length > 20) return [null, "no from"];
  if (!Array.isArray(hw.qs) || hw.qs.length < 1 || hw.qs.length > 10) return [null, "1 to 10 questions"];
  if (!hw.qs.every((q) => q && typeof q.q === "string" && q.q && q.q.length <= 200)) return [null, "bad question"];
  if (hw.a && (!Array.isArray(hw.a) || hw.a.length !== hw.qs.length)) return [null, "bad answers"];
  if (hw.m && (!Array.isArray(hw.m) || hw.m.length !== hw.qs.length)) return [null, "bad marks"];
  for (const k of ["ta", "fa"]) if (hw[k] != null) {
    hw[k] = String(hw[k]).toUpperCase();
    if (!ADDRESS.test(hw[k])) return [null, "bad " + k];
  }
  return [hw, null];
}
const stageOf = (hw) => (hw.m ? "marked" : hw.a ? "answered" : "set");

async function createHomework(request, env) {
  const [hw, why] = await readHomework(request);
  if (!hw) return fail(400, why);
  if (stageOf(hw) !== "set") return fail(400, "new homework has no answers yet");
  // A code nobody's using (the odds of a clash are tiny; checked anyway).
  let code;
  for (let i = 0; i < 5; i++) {
    const c = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join("");
    const r = await box(env, "h:" + c).fetch("https://box/get");
    if (r.status === 404) { code = c; break; }
  }
  if (!code) return fail(503, "try again");
  hw.code = code;
  hw.at = Date.now();
  await box(env, "h:" + code).fetch("https://box/put", { method: "POST", body: JSON.stringify(hw) });
  if (hw.ta) await deliver(env, hw.ta, hw);
  return json({ code });
}

async function updateHomework(request, env, code) {
  const [hw, why] = await readHomework(request);
  if (!hw) return fail(400, why);
  const r = await box(env, "h:" + code).fetch("https://box/get");
  if (r.status === 404) return fail(404, "no such code");
  const old = await r.json();
  if (old.id !== hw.id) return fail(409, "different homework");
  if (STAGES.indexOf(stageOf(hw)) <= STAGES.indexOf(stageOf(old))) return fail(409, "already " + stageOf(old));
  // The questions and who set it never change after setting; addresses stay unless added.
  hw.qs = old.qs; hw.from = old.from; hw.to = hw.to ?? old.to; hw.note = old.note; hw.mins = old.mins;
  hw.ta = hw.ta ?? old.ta; hw.fa = hw.fa ?? old.fa;
  hw.code = code;
  hw.at = Date.now();
  await box(env, "h:" + code).fetch("https://box/put", { method: "POST", body: JSON.stringify(hw) });
  // Answers go to whoever set it; marks go to whoever did it.
  const to = stageOf(hw) === "answered" ? hw.fa : hw.ta;
  if (to) await deliver(env, to, hw);
  return json({ ok: true });
}

const cleanName = (n) => String(n || "").trim().slice(0, 20);

/// The family's puzzle times for the last 30 days up to `day`, member by member.
async function familyBoard(env, fam, url) {
  const r = await fam.fetch("https://box/family-get");
  if (r.status !== 200) return fail(404, "no such family");
  const family = await r.json();
  const day = parseInt(url.searchParams.get("day") || "0", 10) || 0;
  const members = await Promise.all(family.members.map(async (m) => {
    const days = {};
    for (const a of m.addrs || [m.addr]) {
      const rr = await box(env, "a:" + a).fetch(`https://box/result-get?from=${day - 29}&to=${day}`);
      if (rr.status !== 200) continue;
      for (const [d, puzzles] of Object.entries(await rr.json())) {
        days[d] = days[d] || {};
        for (const [p, r] of Object.entries(puzzles)) if (!days[d][p] || r.s < days[d][p].s) days[d][p] = r;
      }
    }
    return { name: m.name, addr: m.addr, addrs: m.addrs || [m.addr], days };
  }));
  return json({ code: family.code, name: family.name, day, members });
}

// ---------- rooms ----------
async function createRoom(request, env) {
  const text = await request.text();
  if (text.length > 2048) return fail(400, "too big");
  let body; try { body = JSON.parse(text); } catch { return fail(400, "not JSON"); }
  if (!GAMES.has(body.game)) return fail(400, "which game?");
  const players = Math.min(Math.max(parseInt(body.players, 10) || 2, 2), 8);
  const host = body.host && typeof body.host.id === "string" && body.host.id ? { id: String(body.host.id).slice(0, 40), name: cleanName(body.host.name) || "Someone" } : null;
  if (!host) return fail(400, "who's hosting?");
  let code;
  for (let i = 0; i < 5; i++) {
    const c = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join("");
    const r = await env.ROOM.get(env.ROOM.idFromName(c)).fetch("https://room/");
    if (r.status === 404) { code = c; break; }
  }
  if (!code) return fail(503, "try again");
  const room = env.ROOM.get(env.ROOM.idFromName(code));
  await room.fetch("https://room/create", { method: "POST", body: JSON.stringify({ code, game: body.game, players, host }) });
  return json({ code });
}

async function inviteToRoom(request, env, code, room) {
  const text = await request.text();
  if (text.length > 1024) return fail(400, "too big");
  let body; try { body = JSON.parse(text); } catch { return fail(400, "not JSON"); }
  const addr = String(body.addr || "").toUpperCase();
  if (!ADDRESS.test(addr)) return fail(400, "bad address");
  const r = await room.fetch("https://room/");
  if (r.status !== 200) return fail(404, "no such room");
  const info = await r.json();
  const from = cleanName(body.from) || "Someone";
  const entry = { kind: "room", code, stage: "set", from, game: info.game, at: Date.now() };
  const tokens = await inboxAll(env, addr, entry);
  const title = `${from} wants to play ${GAME_NAMES[info.game] || "a game"} ✏️`;
  for (const t of tokens) {
    const status = await pushAPNs(env, t, { aps: { alert: { title, body: "tap to join them" }, sound: "default" }, room: code, game: info.game });
    if (status === 410 || status === 400 || status === 404) await box(env, "a:" + t.addr).fetch("https://box/token-drop", { method: "POST", body: JSON.stringify([t.token]) });
  }
  return json({ ok: true, devices: tokens.length });
}
const GAME_NAMES = { bookCricket: "book cricket", noughtsCrosses: "noughts & crosses", dotsBoxes: "dots & boxes", hangman: "hangman", bollywood: "Bollywood", hollywood: "Hollywood", namePlace: "name place animal thing" };
function cleanMember(m) {
  if (!m) return null;
  const name = cleanName(m.name), addr = String(m.addr || "").toUpperCase();
  return name && ADDRESS.test(addr) ? { name, addr } : null;
}

async function createFamily(request, env) {
  const text = await request.text();
  if (text.length > 2048) return fail(400, "too big");
  let body; try { body = JSON.parse(text); } catch { return fail(400, "not JSON"); }
  const name = cleanName(body.name), member = cleanMember(body.member);
  if (!name) return fail(400, "no name");
  if (!member) return fail(400, "bad member");
  let code;
  for (let i = 0; i < 5; i++) {
    const c = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHABET[b % ALPHABET.length]).join("");
    const r = await box(env, "f:" + c).fetch("https://box/family-get");
    if (r.status === 404) { code = c; break; }
  }
  if (!code) return fail(503, "try again");
  const family = { code, name, members: [{ ...member, at: Date.now() }], at: Date.now() };
  await box(env, "f:" + code).fetch("https://box/family-put", { method: "POST", body: JSON.stringify(family) });
  return json(family);
}

/// The same person's other devices (a phone and a browser that joined a family under one name).
async function devicesOf(env, address) {
  const r = await box(env, "a:" + address).fetch("https://box/alias-get");
  const aliases = r.status === 200 ? await r.json() : [];
  return [address, ...aliases.filter((a) => a !== address)];
}

/// Puts an entry in the inbox of every device of this person; returns their push tokens.
async function inboxAll(env, address, entry) {
  const tokens = [];
  for (const a of await devicesOf(env, address)) {
    const r = await box(env, "a:" + a).fetch("https://box/inbox-add", { method: "POST", body: JSON.stringify(entry) });
    const j = await r.json();
    for (const t of j.tokens || []) if (!tokens.some((x) => x.token === t.token)) tokens.push({ ...t, addr: a });
  }
  return tokens;
}

/// "Beat my 1:12": a family member challenged to today's puzzle. Lands in every device's inbox
/// and buzzes wherever there's a push token; the puzzle opens with their time to beat.
const PUZZLE_NAMES = { sudoku: "mini sudoku", dots: "dot to dot", trail: "word trail" };
async function dareTo(request, env, addr) {
  const text = await request.text();
  if (text.length > 512) return fail(400, "too big");
  let b; try { b = JSON.parse(text); } catch { return fail(400, "not JSON"); }
  const day = parseInt(b.day, 10), secs = parseInt(b.secs, 10), from = cleanName(b.from);
  if (!PUZZLE_NAMES[b.puzzle] || !(day >= 0 && day < 100000) || !(secs > 0 && secs < 86400) || !from) return fail(400, "bad challenge");
  const entry = { kind: "dare", code: `${b.puzzle}-${day}-${from.toUpperCase()}`, stage: "set", from, puzzle: b.puzzle, day, secs, at: Date.now() };
  const tokens = await inboxAll(env, addr, entry);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const title = `${from} challenges you to today's ${PUZZLE_NAMES[b.puzzle]} ✏️`;
  const dead = [];
  for (const t of tokens) {
    const status = await pushAPNs(env, t, { aps: { alert: { title, body: `beat ${clock}` }, sound: "default" }, dare: { puzzle: b.puzzle, day, secs, name: from } });
    if (status === 410 || status === 400 || status === 404) dead.push(t.token);
  }
  for (const t of tokens) if (dead.includes(t.token)) await box(env, "a:" + t.addr).fetch("https://box/token-drop", { method: "POST", body: JSON.stringify([t.token]) });
  return json({ ok: true, devices: tokens.length });
}

/// "Vihaan is in Khannas": everyone already in the family hears a new member (or a member's
/// new phone) arrived, so they know tests and invites now reach them.
async function notifyJoin(env, f, typed, addr, devices) {
  const member = f.members.find((m) => (m.addrs || [m.addr]).includes(addr));
  const name = member ? member.name : typed;
  if (!name) return;
  const entry = { kind: "family", code: f.code, stage: "joined-" + addr, from: name, at: Date.now() };
  const tokens = [];
  for (const m of f.members) {
    if ((m.addrs || [m.addr]).includes(addr)) continue;
    for (const t of await inboxAll(env, m.addr, entry)) if (!tokens.some((x) => x.token === t.token)) tokens.push(t);
  }
  if (!tokens.length) return;
  const text = devices > 1 ? { title: `${name}'s phone is in ${f.name} too ✏️`, body: "tests and game invites reach it now" }
    : { title: `${name} is in ${f.name} ✏️`, body: "set them a test, or ask them to play" };
  const dead = [];
  for (const t of tokens) {
    const status = await pushAPNs(env, t, { aps: { alert: text, sound: "default" }, family: f.code });
    if (status === 410 || status === 400 || status === 404) dead.push(t.token);
  }
  for (const t of tokens) if (dead.includes(t.token)) await box(env, "a:" + t.addr).fetch("https://box/token-drop", { method: "POST", body: JSON.stringify([t.token]) });
}

async function deliver(env, address, hw) {
  const stage = stageOf(hw);
  const entry = { code: hw.code, stage, from: stage === "answered" ? (hw.by || "") : hw.from, at: hw.at };
  const tokens = await inboxAll(env, address, entry);
  if (!tokens.length) return;
  const n = hw.qs.length;
  const text = stage === "set" ? { title: `A test from ${hw.from} ✏️`, body: `${n} question${n === 1 ? "" : "s"}${hw.mins ? ", " + hw.mins + " min" : ""}${hw.note ? ". \"" + hw.note + "\"" : ""}` }
    : stage === "answered" ? { title: `${hw.by || "Someone"} has handed in their paper`, body: `${n} answer${n === 1 ? "" : "s"} to mark` }
    : { title: `${hw.from} has marked your paper`, body: `${(hw.m || []).filter(Boolean).length}/${n}${hw.remark ? " — " + hw.remark : ""}` };
  const dead = [];
  for (const t of tokens) {
    const status = await pushAPNs(env, t, { aps: { alert: text, sound: "default" }, code: hw.code, stage });
    if (status === 410 || status === 400 || status === 404) dead.push(t.token);
  }
  for (const t of tokens) if (dead.includes(t.token)) await box(env, "a:" + t.addr).fetch("https://box/token-drop", { method: "POST", body: JSON.stringify([t.token]) });
}

// ---------- Apple push (APNs over HTTP/2, signed with the team's .p8 key) ----------
// Two keys: one for the App Store / TestFlight (production), one for Xcode builds (sandbox).
let apnsJWT = { prod: { value: null, at: 0 }, sandbox: { value: null, at: 0 } };
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/// Web Push (RFC 8030 + VAPID, RFC 8292), sent without a payload so nothing needs encrypting:
/// the browser's service worker wakes, fetches this address's inbox and shows the newest item.
const vapidJWT = {};
async function vapidToken(env, audience) {
  const cached = vapidJWT[audience];
  if (cached && Date.now() - cached.at < 6 * 3600e3) return cached.value;
  const key = await crypto.subtle.importKey("jwk", JSON.parse(env.VAPID_PRIVATE), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://thatlastpage.vercel.app" })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(header + "." + claims));
  vapidJWT[audience] = { value: header + "." + claims + "." + b64url(sig), at: Date.now() };
  return vapidJWT[audience].value;
}
async function pushWeb(env, t) {
  if (!env.VAPID_PRIVATE || !env.VAPID_PUBLIC) return 0;
  try {
    const audience = new URL(t.token).origin;
    const r = await fetch(t.token, {
      method: "POST",
      headers: { authorization: `vapid t=${await vapidToken(env, audience)}, k=${env.VAPID_PUBLIC}`, ttl: "86400", urgency: "high", "content-length": "0" },
    });
    if (r.status >= 300) console.log("webpush", r.status, await r.text());
    return r.status;
  } catch (e) {
    console.log("webpush failed", String(e));
    return 0;
  }
}

async function apnsToken(env, which) {
  // Apple wants a fresh token at least hourly, and not more often than every 20 minutes.
  const cached = apnsJWT[which];
  if (cached.value && Date.now() - cached.at < 50 * 60e3) return cached.value;
  const keyPem = which === "sandbox" ? (env.APNS_KEY_SANDBOX || env.APNS_KEY) : env.APNS_KEY;
  const keyID = which === "sandbox" ? (env.APNS_KEY_ID_SANDBOX || env.APNS_KEY_ID) : env.APNS_KEY_ID;
  const pem = keyPem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid: keyID })));
  const claims = b64url(enc.encode(JSON.stringify({ iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(header + "." + claims));
  apnsJWT[which] = { value: header + "." + claims + "." + b64url(sig), at: Date.now() };
  return apnsJWT[which].value;
}
async function pushAPNs(env, t, payload) {
  if (t.env === "web") return pushWeb(env, t);
  if (!env.APNS_KEY) return 0;
  const host = t.env === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  try {
    const r = await fetch(`${host}/3/device/${t.token}`, {
      method: "POST",
      headers: {
        authorization: "bearer " + (await apnsToken(env, t.env === "sandbox" ? "sandbox" : "prod")),
        "apns-topic": env.APNS_TOPIC || "com.akashkhanna.thelastpage",
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 86400),
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (r.status !== 200) console.log("apns", r.status, await r.text());
    return r.status;
  } catch (e) {
    console.log("apns failed", String(e));
    return 0;
  }
}

export class Box {
  constructor(state) { this.storage = state.storage; }

  async fetch(request) {
    const url = new URL(request.url);
    const op = url.pathname;
    if (op === "/get") {
      const hw = await this.storage.get("hw");
      return hw ? json(hw) : fail(404, "no such code");
    }
    if (op === "/put") {
      await this.storage.put("hw", await request.json());
      await this.storage.setAlarm(Date.now() + HOMEWORK_DAYS * 86400e3);
      return json({ ok: true });
    }
    if (op === "/inbox-add") {
      const entry = await request.json();
      let list = (await this.storage.get("inbox")) || [];
      list = list.filter((e) => e.code !== entry.code || (entry.kind === "family" && e.stage !== entry.stage));
      list.unshift(entry);
      await this.storage.put("inbox", list.slice(0, 50));
      await this.storage.setAlarm(Date.now() + INBOX_DAYS * 86400e3);
      return json({ ok: true, tokens: (await this.storage.get("tokens")) || [] });
    }
    if (op === "/token-add") {
      const t = await request.json();
      let tokens = ((await this.storage.get("tokens")) || []).filter((x) => x.token !== t.token);
      tokens.unshift({ token: t.token, env: t.env, at: Date.now() });
      await this.storage.put("tokens", tokens.slice(0, 5));   // a few phones per address at most
      await this.storage.setAlarm(Date.now() + INBOX_DAYS * 86400e3);
      return json({ ok: true });
    }
    if (op === "/token-list") return json((await this.storage.get("tokens")) || []);
    if (op === "/token-drop") {
      const dead = new Set(await request.json());
      const tokens = ((await this.storage.get("tokens")) || []).filter((x) => !dead.has(x.token));
      await this.storage.put("tokens", tokens);
      return json({ ok: true });
    }
    if (op === "/inbox-get") return json((await this.storage.get("inbox")) || []);
    if (op === "/result-add") {
      const r = await request.json();
      const all = (await this.storage.get("results")) || {};
      const d = all[r.day] || (all[r.day] = {});
      if (!d[r.puzzle] || r.s < d[r.puzzle].s) d[r.puzzle] = { s: r.s, h: r.h };   // the best go of the day stands
      for (const k of Object.keys(all)) if (parseInt(k, 10) < r.day - 90) delete all[k];
      await this.storage.put("results", all);
      await this.storage.setAlarm(Date.now() + INBOX_DAYS * 86400e3);
      return json({ ok: true });
    }
    if (op === "/result-get") {
      const from = parseInt(url.searchParams.get("from") || "0", 10), to = parseInt(url.searchParams.get("to") || "0", 10);
      const all = (await this.storage.get("results")) || {};
      const out = {};
      for (const k of Object.keys(all)) { const d = parseInt(k, 10); if (d >= from && d <= to) out[k] = all[k]; }
      return json(out);
    }
    if (op === "/family-get") {
      const f = await this.storage.get("family");
      return f ? json(f) : fail(404, "no such family");
    }
    if (op === "/family-put") {
      await this.storage.put("family", await request.json());
      await this.storage.setAlarm(Date.now() + FAMILY_DAYS * 86400e3);
      return json({ ok: true });
    }
    if (op === "/family-join" || op === "/family-leave") {
      const f = await this.storage.get("family");
      if (!f) return fail(404, "no such family");
      let body; try { body = await request.json(); } catch { return fail(400, "not JSON"); }
      const addr = String(body.addr || "").toUpperCase();
      if (!ADDRESS.test(addr)) return fail(400, "bad address");
      // Every member keeps all their devices (addrs); `addr` is the first one.
      for (const m of f.members) if (!m.addrs) m.addrs = [m.addr];
      let changed = null;
      const before = f.members.find((m) => m.addrs.includes(addr));
      for (const m of f.members) if (m.addrs.includes(addr)) { m.addrs = m.addrs.filter((a) => a !== addr); changed = m; }
      f.members = f.members.filter((m) => m.addrs.length);
      for (const m of f.members) m.addr = m.addrs[0];
      if (op === "/family-join") {
        const name = cleanName(body.name);
        if (!name) return fail(400, "no name");
        // The same person on another device (a phone after a browser, or the other way round).
        const same = f.members.find((m) => m.name.toLowerCase() === name.toLowerCase());
        if (same) { same.addrs.push(addr); changed = same; }
        else {
          if (f.members.length >= MAX_MEMBERS) return fail(409, "family's full");
          changed = { name, addr, addrs: [addr], at: Date.now() };
          f.members.push(changed);
        }
      }
      f.at = Date.now();
      await this.storage.put("family", f);
      await this.storage.setAlarm(Date.now() + FAMILY_DAYS * 86400e3);
      return json({ ...f, linked: changed ? changed.addrs : [], rejoined: op === "/family-join" && !!before && before.name.toLowerCase() === cleanName(body.name).toLowerCase() });
    }
    // This device's other devices, per family code (a person can be in several families,
    // under a different name in each). Older boxes kept one plain list: it stays, as "_".
    const aliasMap = async () => { const a = (await this.storage.get("aliases")) || {}; return Array.isArray(a) ? { _: a } : a; };
    if (op === "/alias-get") return json([...new Set(Object.values(await aliasMap()).flat())]);
    if (op === "/alias-set") {
      const b = await request.json(), map = await aliasMap();
      if (Array.isArray(b)) map._ = b; else if (b && typeof b.code === "string" && Array.isArray(b.addrs)) { if (b.addrs.length) map[b.code] = b.addrs; else delete map[b.code]; }
      await this.storage.put("aliases", map);
      return json({ ok: true });
    }
    return fail(404, "?");
  }

  /// Nothing's touched it for a long while: gone.
  async alarm() { await this.storage.deleteAll(); }
}


/// One live game. Members are known by an id the phone/browser keeps (its homework address,
/// or a random one), so a dropped connection comes back to the same seat. Frames (JSON text):
///   client → room: { t: "msg", m: <NearbyMessage> }   |   { t: "since", n }   |   { t: "ping" }
///   room → client: { t: "welcome", code, game, players, you, host, members: [labels], seq }
///                  { t: "members", members, host, joined }      (someone joined or went; joined: who just connected)
///                  { t: "msg", seq, from: label, m }    (everyone but the sender)
///                  { t: "log", msgs: [{ seq, from, m }] }   (replay after "since")
///                  { t: "gone", label }
export class Room {
  constructor(state) { this.state = state; this.storage = state.storage; }

  async meta() { return this.storage.get("meta"); }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/create" && request.method === "POST") {
      const body = await request.json();
      const meta = { code: body.code, game: body.game, players: body.players, hostID: body.host.id, members: [], seq: 0, at: Date.now() };
      await this.storage.put("meta", meta);
      await this.storage.put("log", []);
      await this.storage.setAlarm(Date.now() + ROOM_HOURS * 3600e3);
      return json({ ok: true });
    }
    const meta = await this.meta();
    if (!meta) return fail(404, "no such room");
    if (request.headers.get("Upgrade") === "websocket") return this.join(request, meta);
    return json({ code: meta.code, game: meta.game, players: meta.players,
                  members: meta.members.map((m) => ({ label: m.label, here: this.isHere(m.id) })), host: this.labelOf(meta, meta.hostID) });
  }

  labelOf(meta, id) { const m = meta.members.find((x) => x.id === id); return m ? m.label : null; }
  isHere(id) { return this.state.getWebSockets(id).length > 0; }
  sockets() { return this.state.getWebSockets(); }

  async join(request, meta) {
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").slice(0, 40);
    const name = cleanName(url.searchParams.get("name")) || "Someone";
    const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;
    if (!id) return fail(400, "who are you?");
    let member = meta.members.find((m) => m.id === id);
    if (!member) {
      if (meta.members.length >= meta.players) return fail(409, "room's full");
      // Two RAHULs: the second becomes "RAHUL (2)" (same rule as the app).
      let label = name, n = 2;
      while (meta.members.some((m) => m.label.toLowerCase() === label.toLowerCase())) label = `${name} (${n++})`;
      member = { id, name, label, at: Date.now() };
      meta.members.push(member);
      meta.at = Date.now();
      await this.storage.put("meta", meta);
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.state.acceptWebSocket(server, [id]);
    console.log("room join", member.label, "now", this.sockets().length, "socket(s)");
    server.serializeAttachment({ id, label: member.label });
    const members = meta.members.map((m) => m.label);
    server.send(JSON.stringify({ t: "welcome", code: meta.code, game: meta.game, players: meta.players, you: member.label,
                                 host: this.labelOf(meta, meta.hostID), members, seq: meta.seq }));
    if (since < meta.seq) {
      const log = (await this.storage.get("log")) || [];
      server.send(JSON.stringify({ t: "log", msgs: log.filter((e) => e.seq > since && e.from !== member.label) }));
    }
    this.broadcast({ t: "members", members, host: this.labelOf(meta, meta.hostID), joined: member.label }, null);
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(obj, exceptID) {
    const text = JSON.stringify(obj);
    console.log("room broadcast", obj.t, "to", this.sockets().length, "socket(s)", this.sockets().map((w) => (w.deserializeAttachment() || {}).label).join(","));
    for (const ws of this.sockets()) {
      const a = ws.deserializeAttachment();
      if (exceptID && a && a.id === exceptID) continue;
      try { ws.send(text); } catch {}
    }
  }

  async webSocketMessage(ws, data) {
    const a = ws.deserializeAttachment();
    if (typeof data !== "string" || data.length > ROOM_MSG_MAX) return;
    let f; try { f = JSON.parse(data); } catch { return; }
    if (f.t === "ping") { ws.send('{"t":"pong"}'); return; }
    const meta = await this.meta();
    if (!meta) return;
    if (f.t === "since") {
      const log = (await this.storage.get("log")) || [];
      ws.send(JSON.stringify({ t: "log", msgs: log.filter((e) => e.seq > (f.n || 0) && e.from !== a.label) }));
      return;
    }
    if (f.t === "msg" && f.m && typeof f.m === "object") {
      meta.seq += 1;
      meta.at = Date.now();
      const entry = { seq: meta.seq, from: a.label, m: f.m };
      const log = (await this.storage.get("log")) || [];
      log.push(entry);
      if (log.length > ROOM_LOG_MAX) log.splice(0, log.length - ROOM_LOG_MAX);
      await this.storage.put("log", log);
      await this.storage.put("meta", meta);
      await this.storage.setAlarm(Date.now() + ROOM_HOURS * 3600e3);
      this.broadcast({ t: "msg", seq: entry.seq, from: a.label, m: f.m }, a.id);
      ws.send(JSON.stringify({ t: "ack", seq: entry.seq }));
    }
  }

  async webSocketClose(ws, code, reason) { console.log("room close", (ws.deserializeAttachment() || {}).label, code, reason); await this.left(ws); }
  async webSocketError(ws, error) { console.log("room error", (ws.deserializeAttachment() || {}).label, String(error)); await this.left(ws); }

  /// A connection dropped. The seat stays (they may be back); the others are only told once
  /// every connection of that member is gone.
  async left(ws) {
    const a = ws.deserializeAttachment();
    try { ws.close(); } catch {}
    if (!a || this.state.getWebSockets(a.id).length > 0) return;
    const meta = await this.meta();
    if (!meta) return;
    this.broadcast({ t: "gone", label: a.label, members: meta.members.map((m) => m.label) }, a.id);
  }

  async alarm() {
    for (const ws of this.sockets()) { try { ws.close(1000, "room closed"); } catch {} }
    await this.storage.deleteAll();
  }
}
