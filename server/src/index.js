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
      if (parts[0] === "a" && parts.length === 2 && request.method === "GET") {
        const addr = parts[1].toUpperCase();
        if (!ADDRESS.test(addr)) return fail(400, "not an address");
        return await box(env, "a:" + addr).fetch("https://box/inbox-get");
      }
      if (parts[0] === "f" && parts.length === 1 && request.method === "POST") return await createFamily(request, env);
      if (parts[0] === "f" && parts.length >= 2) {
        const code = parts[1].toUpperCase();
        if (!CODE.test(code)) return fail(400, "not a code");
        const fam = box(env, "f:" + code);
        if (parts.length === 2 && request.method === "GET") return await fam.fetch("https://box/family-get");
        if (parts.length === 3 && request.method === "POST" && (parts[2] === "join" || parts[2] === "leave")) {
          const body = await request.text();
          if (body.length > 2048) return fail(400, "too big");
          return await fam.fetch("https://box/family-" + parts[2], { method: "POST", body });
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

async function deliver(env, address, hw) {
  const entry = { code: hw.code, stage: stageOf(hw), from: stageOf(hw) === "answered" ? (hw.by || "") : hw.from, at: hw.at };
  await box(env, "a:" + address).fetch("https://box/inbox-add", { method: "POST", body: JSON.stringify(entry) });
}

export class Box {
  constructor(state) { this.storage = state.storage; }

  async fetch(request) {
    const op = new URL(request.url).pathname;
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
      list = list.filter((e) => e.code !== entry.code);
      list.unshift(entry);
      await this.storage.put("inbox", list.slice(0, 50));
      await this.storage.setAlarm(Date.now() + INBOX_DAYS * 86400e3);
      return json({ ok: true });
    }
    if (op === "/inbox-get") return json((await this.storage.get("inbox")) || []);
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
      f.members = f.members.filter((m) => m.addr !== addr);
      if (op === "/family-join") {
        const name = cleanName(body.name);
        if (!name) return fail(400, "no name");
        if (f.members.length >= MAX_MEMBERS) return fail(409, "family's full");
        f.members.push({ name, addr, at: Date.now() });
      }
      f.at = Date.now();
      await this.storage.put("family", f);
      await this.storage.setAlarm(Date.now() + FAMILY_DAYS * 86400e3);
      return json(f);
    }
    return fail(404, "?");
  }

  /// Nothing's touched it for a long while: gone.
  async alarm() { await this.storage.deleteAll(); }
}
