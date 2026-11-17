// Homework from the family, no server: the questions, then the answers, then the marks all
// travel in the part of the link after "#", as base64url JSON. The app (Homework.swift)
// reads and writes the same JSON with the same short keys:
//   v, id, from, to?, note?, mins?, qs:[{q, k:"t"|"n"|"c", c?:[]}], by?, a?, secs?, m?:[bool], remark?
(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_Q = 10, MAX_C = 4;

  // JSON → raw deflate (so the link stays short enough for WhatsApp to make it tappable) →
  // base64url, with "z" in front. Links without the "z" are plain JSON (older ones).
  const b64 = (bytes) => { let bin = ""; bytes.forEach((x) => (bin += String.fromCharCode(x))); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const unb64 = (s) => { const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : ""; return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0)); };
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  async function encode(obj) {
    const plain = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === "undefined") return b64(plain);
    return "z" + b64(await pipe(plain, new CompressionStream("deflate-raw")));
  }
  function check(o) {
    if (!o || typeof o.id !== "string" || typeof o.from !== "string" || !Array.isArray(o.qs)) return null;
    if (o.qs.length > MAX_Q || !o.qs.every((q) => q && typeof q.q === "string" && q.q)) return null;
    if (o.a && o.a.length !== o.qs.length) return null;
    if (o.m && o.m.length !== o.qs.length) return null;
    return o;
  }
  async function decode(s) {
    try {
      let bytes = unb64(s.startsWith("z") ? s.slice(1) : s);
      if (s.startsWith("z")) bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
      return check(JSON.parse(new TextDecoder().decode(bytes)));
    } catch { return null; }
  }
  const linkFor = async (o) => o.code ? location.origin + "/h/#" + o.code : location.origin + location.pathname + "#" + (await encode(o));

  // ---------- the server: homework by code, delivered to addresses ----------
  const API = "https://lastpage-api.akkikhanna.workers.dev";
  const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/, ADDR_RE = /^[A-Z]{1,10}-[A-HJ-NP-Z2-9]{4}$/;
  async function api(method, path, body) {
    const r = await fetch(API + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ("server said " + r.status));
    return j;
  }
  const isCode = (s) => CODE_RE.test((s || "").trim().toUpperCase());
  const cleanAddr = (s) => { const u = (s || "").trim().toUpperCase(); return ADDR_RE.test(u) ? u : null; };
  // ---------- families: joined once, then names instead of addresses ----------
  const families = () => { try { return JSON.parse(localStorage.getItem("lp.families") || "[]"); } catch { return []; } };
  const saveFamily = (f) => { const all = families().filter((x) => x.code !== f.code); all.push(f); remember("lp.families", JSON.stringify(all)); };
  const dropFamily = (code) => remember("lp.families", JSON.stringify(families().filter((x) => x.code !== code)));
  const me = () => ({ name: (recall("lp.from") || "Someone").slice(0, 20), addr: myAddress() });
  const isMe = (m) => m.addr === myAddress() || (m.addrs || []).includes(myAddress());
  const others = () => { const seen = new Set(); return families().flatMap((f) => f.members).filter((m) => !isMe(m) && !seen.has(m.addr) && seen.add(m.addr)).sort((a, b) => a.name.localeCompare(b.name)); };
  async function refreshFamilies() { for (const f of families()) { try { saveFamily(await api("GET", "/f/" + f.code)); } catch {} } }

  // This browser's homework address: made once from the name, kept here.
  function myAddress() {
    let a = recall("lp.address");
    if (a) return a;
    const L = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let stem = (recall("lp.from") || "ME").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10) || "ME";
    let tail = ""; for (let i = 0; i < 4; i++) tail += L[Math.floor(Math.random() * L.length)];
    a = stem + "-" + tail; remember("lp.address", a); return a;
  }
  const stage = (o) => (o.m ? "marked" : o.a ? "answered" : o.qs.length ? "set" : "asked");
  const newID = () => { const L = "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < 6; i++) s += L[Math.floor(Math.random() * L.length)]; return s; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const score = (o) => [(o.m || []).filter(Boolean).length, o.qs.length];
  function message(o) {
    const s = stage(o), n = o.qs.length;
    if (s === "asked") return `${o.from} wants a test${o.note ? " on " + o.note : ""}! ✏️ Set one here:`;
    if (s === "set") return `${o.to ? o.to + ", " : ""}${o.from} has set you a test ✏️ (${n} question${n === 1 ? "" : "s"}${o.mins ? ", " + o.mins + " min" : ""}). Open it in That Last Page:`;
    if (s === "answered") return `${o.by ? o.by + " has" : "I've"} handed in ${o.from}'s test paper ✏️ Please mark it:`;
    const [r, t] = score(o); return `${o.from} has marked ${o.by || "the"}'s paper: ${r}/${t}${o.remark ? " — " + o.remark : ""} ✏️`;
  }

  // Browsers only open the share sheet in the instant of a tap, so after a server call we show
  // buttons instead: a WhatsApp link (a plain link, always allowed) and "copy".
  function shareRow(el, text, url, code) {
    const both = text + "\n" + url + (code ? "\n(or type the code " + code + " in the app)" : "");
    el.hidden = false;
    el.innerHTML = `<a class="go" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(both)}">send on WhatsApp →</a>
      <button class="small" data-copy>copy the message</button> <span class="pencil" data-copied hidden>copied!!</span>`;
    el.querySelector("[data-copy]").onclick = async () => {
      try { await navigator.clipboard.writeText(both); el.querySelector("[data-copied]").hidden = false; }
      catch { prompt("Copy this:", both); }
    };
  }
  async function share(text, url, copiedId, code) {
    const both = text + "\n" + url + (code ? "\n(or type the code " + code + " in the app)" : "");
    if (navigator.share) {
      try { await navigator.share({ text: both }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(both); }
    catch { prompt("Copy this:", both); return; }
    $(copiedId).hidden = false; setTimeout(() => ($(copiedId).hidden = true), 2500);
  }
  const remember = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const recall = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  function show(id) { ["hub", "set", "ask", "paper"].forEach((s) => ($(s).hidden = s !== id)); }

  // ---------- set ----------
  let qs = [{ q: "", k: "t" }], mins = 0, askedBy = null;
  function renderChips() {
    const list = others();
    $("chips").hidden = !list.length;
    const picked = cleanAddr($("to").value);
    $("chips").innerHTML = list.map((m) => `<button class="choice ${picked === m.addr ? "on" : ""}" data-addr="${esc(m.addr)}">${esc(m.name)}</button>`).join("");
  }
  $("chips").addEventListener("click", (e) => { const b = e.target.closest("[data-addr]"); if (!b) return; $("to").value = cleanAddr($("to").value) === b.dataset.addr ? "" : b.dataset.addr; renderChips(); updateSend(); });
  $("to").addEventListener("input", renderChips);
  function renderSet() {
    renderChips();
    $("qs").innerHTML = qs.map((q, i) => `
      <div class="q">
        <div class="row q1"><b>${i + 1}.</b>
          <textarea rows="1" data-q="${i}" placeholder="question" maxlength="200">${esc(q.q)}</textarea>
          ${qs.length > 1 ? `<button class="x" data-rm="${i}" aria-label="remove question ${i + 1}">✕</button>` : ""}
        </div>
        <div class="kinds">${[["t", "written"], ["n", "a number"], ["c", "choices"]].map(([k, t]) =>
          `<button data-kind="${i}:${k}" class="${q.k === k ? "on" : ""}">${t}</button>`).join("")}</div>
        ${q.k === "c" ? (q.c || []).map((c, j) => `<label class="cedit"><input data-c="${i}:${j}" value="${esc(c)}" placeholder="choice ${j + 1}" maxlength="40"></label>`).join("")
          + ((q.c || []).length < MAX_C ? `<button class="small" data-addc="${i}" style="padding-left:26px">+ a choice</button>` : "") : ""}
      </div>`).join("");
    $("addQ").hidden = qs.length >= MAX_Q;
    $("minsRow").innerHTML = [0, 5, 10, 15, 30].map((m) => `<button data-mins="${m}" class="${mins === m ? "on" : ""}">${m ? m + " min" : "none"}</button>`).join(" ");
    $("qs").querySelectorAll("textarea").forEach((t) => { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; });
    updateSend();
  }
  function ready() {
    const from = $("from").value.trim();
    const good = qs.map((q) => ({ q: q.q.trim(), k: q.k, c: q.k === "c" ? (q.c || []).map((c) => c.trim()).filter(Boolean) : undefined }))
      .filter((q) => q.q && (q.k !== "c" || q.c.length >= 2))
      .map((q) => { const o = { q: q.q, k: q.k }; if (q.c) o.c = q.c; return o; });
    if (!from || !good.length) return null;
    const o = { v: 1, id: askedBy ? askedBy.id : newID(), from: from.slice(0, 20), qs: good };
    const to = $("to").value.trim(), note = $("noteIn").value.trim();
    if (to) o.to = to.slice(0, 20); if (note) o.note = note.slice(0, 120); if (mins) o.mins = mins;
    return o;
  }
  function updateSend() { const o = ready(); $("sendSet").disabled = !o; $("setHint").hidden = !!o; }
  $("qs").addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.q !== undefined) { qs[+t.dataset.q].q = t.value; t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
    if (t.dataset.c) { const [i, j] = t.dataset.c.split(":").map(Number); qs[i].c[j] = t.value; }
    updateSend();
  });
  $("qs").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.rm !== undefined) { qs.splice(+b.dataset.rm, 1); renderSet(); }
    if (b.dataset.kind) { const [i, k] = b.dataset.kind.split(":"); qs[+i].k = k; if (k === "c" && !qs[+i].c) qs[+i].c = ["", ""]; renderSet(); }
    if (b.dataset.addc !== undefined) { qs[+b.dataset.addc].c.push(""); renderSet(); }
  });
  $("minsRow").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { mins = +b.dataset.mins; renderSet(); } });
  $("addQ").addEventListener("click", () => { qs.push({ q: "", k: "t" }); renderSet(); $("qs").querySelector(`[data-q="${qs.length - 1}"]`).focus(); });
  ["from", "to", "noteIn"].forEach((id) => $(id).addEventListener("input", updateSend));
  $("sendSet").addEventListener("click", async () => {
    const o = ready(); if (!o) return;
    remember("lp.from", o.from);
    const addr = cleanAddr($("to").value);
    if (addr) { o.ta = addr; o.to = addr.split("-")[0]; }
    o.fa = myAddress();   // the answers come back here
    $("sendSet").disabled = true; $("sendSet").textContent = "sending…";
    try {
      const { code } = await api("POST", "/h", o);
      o.code = code;
      $("codeOut").hidden = false;
      $("codeOut").innerHTML = `code: <b>${code}</b>` + (addr ? `<br><span class="pencil">delivered to ${addr} ✓ it'll land on their last page.</span>` : "");
      $("sendSet").hidden = true;
      shareRow($("shareSet"), message(o), await linkFor(o), code);
    } catch (e) {
      $("sendSet").hidden = true;
      $("setHint").hidden = false; $("setHint").textContent = "couldn't reach the server (" + e.message + "): here's a long link instead.";
      shareRow($("shareSet"), message(o), await linkFor(o));
    }
  });

  // ---------- ask ----------
  $("sendAsk").addEventListener("click", async () => {
    const from = $("askFrom").value.trim().slice(0, 20) || "Someone";
    const subject = $("askSubject").value.trim().slice(0, 60);
    remember("lp.from", from);
    const o = { v: 1, id: newID(), from, qs: [] }; if (subject) o.note = subject;
    share(message(o), await linkFor(o), "copiedAsk");
  });

  // ---------- do / mark / marked ----------
  let hw = null, answers = [], marks = [], startedAt = 0, handedIn = false, clockTimer = null;
  function openPaper(o) {
    hw = o; const s = stage(o);
    answers = o.a ? o.a.slice() : o.qs.map(() => "");
    marks = o.m ? o.m.slice() : o.qs.map(() => null);
    startedAt = Date.now(); handedIn = false;
    show("paper");
    $("mrsT").hidden = s !== "set";
    $("mrsT").textContent = `Mrs T.: "A test from ${o.from}. No talking."`;
    $("title").textContent = s === "answered" ? `MARKING: ${(o.by || "").toUpperCase()}'S PAPER` : s === "marked" ? "your paper is back!" : `TEST from ${o.from}`;
    const who = s === "set" ? (o.to || "_______") : (o.by || "_______");
    $("printed").textContent = `Name: ${who}   Questions: ${o.qs.length}` + (o.mins ? `   Time: ${o.mins} min` : "");
    $("noteOut").hidden = !o.note || s === "marked"; $("noteOut").textContent = o.note ? `"${o.note}"` : "";
    $("doFoot").hidden = s !== "set"; $("sentFoot").hidden = true;
    $("markFoot").hidden = s !== "answered"; $("markedFoot").hidden = s !== "marked";
    $("score").hidden = s !== "marked";
    if (s === "set") { $("by").value = o.to || recall("lp.from"); if (o.mins) startClock(o.mins); }
    if (s === "marked") {
      const [r, t] = score(o); $("score").textContent = `${r}/${t}`;
      $("remarkOut").textContent = o.remark || ""; $("remarkOut").hidden = !o.remark;
      $("signed").textContent = `— ${o.from}`;
    }
    renderPaper();
  }
  function startClock(minutes) {
    clearInterval(clockTimer);
    const el = document.createElement("span"); el.className = "clock"; el.id = "clock"; $("printed").append(" ", el);
    const tick = () => {
      const left = Math.max(0, Math.round((startedAt + minutes * 60000 - Date.now()) / 1000));
      el.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
      el.classList.toggle("low", left <= 30);
      if (left === 0) { clearInterval(clockTimer); handIn(); }
    };
    tick(); clockTimer = setInterval(tick, 1000);
  }
  function renderPaper() {
    const s = stage(hw), doing = s === "set" && !handedIn;
    $("paperQs").innerHTML = hw.qs.map((q, i) => {
      let ans;
      if (doing && q.k === "c") ans = `<div class="choices">${(q.c || []).map((c) => `<button class="choice ${answers[i] === c ? "on" : ""}" data-pick="${i}:${esc(c)}">${esc(c)}</button>`).join("")}</div>`;
      else if (doing) ans = `<div class="ans"><input class="line" data-a="${i}" value="${esc(answers[i])}" placeholder="${q.k === "n" ? "number" : "your answer"}" ${q.k === "n" ? 'inputmode="decimal"' : ""} maxlength="120"></div>`;
      else ans = `<div class="pencilans">${esc(answers[i] || "—")}${s === "answered" ? ` <span class="tickx ${marks[i] === true ? "on" : ""}" data-mark="${i}:1" role="button">✓</span><span class="tickx ${marks[i] === false ? "on" : ""}" data-mark="${i}:0" role="button">✗</span>` : ""}</div>`;
      const mark = s === "marked" ? `<span class="mark">${hw.m[i] ? "✓" : "✗"}</span>` : "";
      return `<div class="q"><div class="row"><b>${i + 1}.</b><span>${esc(q.q)}</span>${mark}</div>${ans}</div>`;
    }).join("");
    if (s === "set") $("handIn").disabled = !answers.some((a) => a.trim());
    if (s === "answered") { const all = marks.every((m) => m !== null); $("sendMarked").hidden = !all; $("markHint").hidden = all; }
  }
  $("paperQs").addEventListener("input", (e) => { const t = e.target; if (t.dataset.a !== undefined) { answers[+t.dataset.a] = t.value; $("handIn").disabled = !answers.some((a) => a.trim()); } });
  $("paperQs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick],[data-mark]"); if (!b) return;
    if (b.dataset.pick) { const i = +b.dataset.pick.split(":")[0]; answers[i] = b.dataset.pick.slice(b.dataset.pick.indexOf(":") + 1); renderPaper(); }
    if (b.dataset.mark) { const [i, v] = b.dataset.mark.split(":"); marks[+i] = v === "1"; renderPaper(); }
  });
  function answered() {
    const o = { ...hw, by: ($("by").value.trim() || "Someone").slice(0, 20), a: answers.map((a) => a.slice(0, 120)), secs: Math.round((Date.now() - startedAt) / 1000) };
    return o;
  }
  async function handIn() {
    if (handedIn) return; handedIn = true; clearInterval(clockTimer);
    remember("lp.from", $("by").value.trim());
    $("doFoot").hidden = true; $("sentFoot").hidden = false; renderPaper();
    if (!hw.code) return;
    // On the server: the answers go straight to whoever set it; the marks come back here.
    const o = answered(); if (!o.ta) o.ta = myAddress();
    $("sentNote").textContent = "sending to " + hw.from + "…";
    try { await api("PUT", "/h/" + hw.code, o); hw.ta = o.ta; $("sentNote").textContent = "sent to " + hw.from + " ✓ it comes back marked."; }
    catch (e) { $("sentNote").textContent = "couldn't send (" + e.message + "): share the link instead."; }
    $("sendAnswers").hidden = true;
    shareRow($("shareAns"), message(o), await linkFor(o), hw.code);
  }
  $("handIn").addEventListener("click", handIn);
  $("sendAnswers").addEventListener("click", async () => { const o = answered(); shareRow($("shareAns"), message(o), await linkFor(o), hw.code); });
  $("sendMarked").addEventListener("click", async () => {
    const remark = $("remarkIn").value.trim().slice(0, 60);
    const o = { ...hw, m: marks.map(Boolean) }; if (remark) o.remark = remark;
    if (hw.code) {
      if (!o.fa) o.fa = myAddress();
      $("sendMarked").disabled = true; $("sendMarked").textContent = "sending…";
      try { await api("PUT", "/h/" + hw.code, o); $("markHint").hidden = false; $("markHint").textContent = "sent to " + (hw.by || "them") + " ✓ it'll land on their last page."; }
      catch (e) { $("markHint").hidden = false; $("markHint").textContent = "couldn't send (" + e.message + "): share the link instead."; }
      $("sendMarked").hidden = true;
    }
    shareRow($("shareMarked"), message(o), await linkFor(o), hw.code);
  });

  // ---------- routing ----------
  function renderFamilies() {
    const all = families();
    // One line when settled ("my family: Khanna · Papa (me), Vihaan"); the forms only when there's none, or on tap.
    $("famLine").innerHTML = all.length
      ? `my family: ${all.map((f) => `<b>${esc(f.name)}</b> · ${f.members.map((m) => m.addr === myAddress() ? esc(m.name) + " (me)" : esc(m.name)).join(", ")}`).join(" · ")} <button class="small" id="famMore" style="color:var(--red)">manage →</button>`
      : `no family yet: <button class="small" id="famMore" style="color:var(--red);font-weight:700">join or start one →</button> <span class="small">(then tests go to a name, not a code)</span>`;
    $("famJoin").hidden = all.length > 0 && $("famList").hidden;
    $("famList").innerHTML = all.map((f) => `<p><b>${esc(f.name)}</b> <span class="pencil">code ${f.code}</span><br><span class="pencil">${f.members.map((m) => isMe(m) ? esc(m.name) + " (me)" : esc(m.name) + ((m.addrs || []).length > 1 ? ` (${m.addrs.length} devices)` : "")).join(" · ")}</span><br>
      ${f.members.some((m) => !isMe(m)) ? `<span class="small pencil">that's me: ${f.members.filter((m) => !isMe(m)).map((m) => `<button class="small" data-me="${f.code}:${esc(m.name)}" style="color:var(--ink);font-weight:700">${esc(m.name)}</button>`).join(" ")}</span><br>` : ""}
      <button class="small" data-invite="${f.code}" style="color:var(--red);font-weight:700">invite someone →</button> <button class="small" data-leave="${f.code}">leave</button></p>`).join("");
  }
  $("famLine").addEventListener("click", (e) => {
    if (!e.target.closest("#famMore")) return;
    const open = $("famList").hidden;
    $("famList").hidden = !open; $("famJoin").hidden = !open;
  });
  $("moreBtn").addEventListener("click", () => { $("more").hidden = !$("more").hidden; });
  $("famList").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-invite],[data-leave],[data-me]"); if (!b) return;
    if (b.dataset.me) { const [code, name] = [b.dataset.me.slice(0, 6), b.dataset.me.slice(7)]; try { remember("lp.from", name); saveFamily(await api("POST", "/f/" + code + "/join", { name, addr: myAddress() })); renderFamilies(); } catch (err) { alert(err.message); } return; }
    if (b.dataset.invite) { const f = families().find((x) => x.code === b.dataset.invite); share(`Join our family "${f.name}" in That Last Page ✏️ then tests and games find you by name:`, location.origin + "/f/#" + f.code, "copiedFam", f.code); }
    if (b.dataset.leave) { try { await api("POST", "/f/" + b.dataset.leave + "/leave", { addr: myAddress() }); } catch {} dropFamily(b.dataset.leave); renderFamilies(); }
  });
  $("startFam").addEventListener("click", async () => {
    const name = $("famName").value.trim().slice(0, 20); if (!name) return;
    if (!recall("lp.from")) { const n = prompt("Your name, as the family will see it:"); if (n) remember("lp.from", n.trim().slice(0, 20)); }
    try { saveFamily(await api("POST", "/f", { name, member: me() })); $("famName").value = ""; renderFamilies(); }
    catch (e) { $("hubNote").hidden = false; $("hubNote").textContent = e.message; }
  });
  $("joinFam").addEventListener("click", () => joinFamily($("famCode").value));
  async function joinFamily(code) {
    code = (code || "").trim().toUpperCase(); if (!isCode(code)) return;
    if (!recall("lp.from")) { const n = prompt("Your name, as the family will see it:"); if (n) remember("lp.from", n.trim().slice(0, 20)); }
    try { saveFamily(await api("POST", "/f/" + code + "/join", me())); $("famCode").value = ""; renderFamilies(); }
    catch (e) { $("hubNote").hidden = false; $("hubNote").textContent = "family " + code + ": " + e.message; }
  }
  async function showHub() {
    show("hub");
    $("myAddr").textContent = myAddress();
    renderFamilies(); refreshFamilies().then(renderFamilies);
    $("inboxList").innerHTML = "";
    try {
      const list = await api("GET", "/a/" + myAddress());
      $("inboxList").innerHTML = list.slice(0, 6).map((e) => {
        const what = e.stage === "set" ? `✏️ a test from ${esc(e.from)}` : e.stage === "answered" ? `📝 ${esc(e.from)}'s paper to mark` : `✓ your paper is back from ${esc(e.from)}`;
        return `<p><button class="small" data-open="${e.code}" style="color:var(--ink);font:400 20px/30px Kalam,cursive">${what} →</button></p>`;
      }).join("") || "";
    } catch {}
  }
  $("inboxList").addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) location.hash = b.dataset.open; });
  $("openCode").addEventListener("click", () => { const c = $("codeIn").value.trim().toUpperCase(); if (isCode(c)) location.hash = c; });
  $("codeIn").addEventListener("input", () => { $("openCode").disabled = !isCode($("codeIn").value); });
  $("codeIn").addEventListener("keydown", (e) => { if (e.key === "Enter") $("openCode").click(); });
  $("shareAddr").addEventListener("click", () => share(`My test address in That Last Page is ${myAddress()} ✏️ Set me a test at`, location.origin + "/homework/", "copiedAddr"));
  $("toSet").addEventListener("click", () => { askedBy = null; $("askedNote").hidden = true; show("set"); renderSet(); $("from").focus(); });
  $("toAsk").addEventListener("click", () => { show("ask"); $("askFrom").value = recall("lp.from"); });
  $("own").addEventListener("click", () => { history.replaceState(null, "", location.pathname); askedBy = null; $("askedNote").hidden = true; show("set"); renderSet(); });
  addEventListener("hashchange", () => location.reload());

  (async () => {
  const raw = location.hash.slice(1);
  $("from").value = recall("lp.from");
  if (raw.startsWith("f-") && isCode(raw.slice(2))) {
    await showHub(); await joinFamily(raw.slice(2)); history.replaceState(null, "", location.pathname); return;
  }
  if (isCode(raw)) {
    try { openPaper(await api("GET", "/h/" + raw.toUpperCase())); }
    catch (e) { await showHub(); $("hubNote").hidden = false; $("hubNote").textContent = "code " + raw.toUpperCase() + ": " + e.message; }
    return;
  }
  const o = await decode(raw);
  if (o && stage(o) === "asked") {
    askedBy = o; show("set");
    $("askedNote").hidden = false; $("askedNote").textContent = `${o.from} asked for some${o.note ? " on " + o.note : ""}!`;
    $("to").value = o.from; if (o.note) $("noteIn").value = "on " + o.note;
    renderSet();
  } else if (o) {
    openPaper(o);
  } else {
    await showHub();
  }
  })();
})();
