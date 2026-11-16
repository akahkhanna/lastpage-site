// Homework from the family, no server: the questions, then the answers, then the marks all
// travel in the part of the link after "#", as base64url JSON. The app (Homework.swift)
// reads and writes the same JSON with the same short keys:
//   v, id, from, to?, note?, mins?, qs:[{q, k:"t"|"n"|"c", c?:[]}], by?, a?, secs?, m?:[bool], remark?
(function () {
  const $ = (id) => document.getElementById(id);
  const MAX_Q = 10, MAX_C = 4;

  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let bin = ""; bytes.forEach((x) => (bin += String.fromCharCode(x)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(s) {
    try {
      const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
      const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
      const o = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      if (!o || typeof o.id !== "string" || typeof o.from !== "string" || !Array.isArray(o.qs)) return null;
      if (o.qs.length > MAX_Q || !o.qs.every((q) => q && typeof q.q === "string" && q.q)) return null;
      if (o.a && o.a.length !== o.qs.length) return null;
      if (o.m && o.m.length !== o.qs.length) return null;
      return o;
    } catch { return null; }
  }
  const linkFor = (o) => location.origin + location.pathname + "#" + encode(o);
  const stage = (o) => (o.m ? "marked" : o.a ? "answered" : o.qs.length ? "set" : "asked");
  const newID = () => { const L = "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (let i = 0; i < 6; i++) s += L[Math.floor(Math.random() * L.length)]; return s; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const score = (o) => [(o.m || []).filter(Boolean).length, o.qs.length];
  function message(o) {
    const s = stage(o), n = o.qs.length;
    if (s === "asked") return `${o.from} wants some homework${o.note ? " on " + o.note : ""}! ✏️ Set it here:`;
    if (s === "set") return `${o.to ? o.to + ", " : ""}${o.from} has set you homework ✏️ (${n} question${n === 1 ? "" : "s"}${o.mins ? ", " + o.mins + " min" : ""}). Open it in That Last Page:`;
    if (s === "answered") return `${o.by ? o.by + " has" : "I've"} done ${o.from}'s homework ✏️ Please mark it:`;
    const [r, t] = score(o); return `${o.from} has marked ${o.by || "the"}'s homework: ${r}/${t}${o.remark ? " — " + o.remark : ""} ✏️`;
  }

  async function share(text, url, copiedId) {
    if (navigator.share) {
      try { await navigator.share({ text, url }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text + " " + url); }
    catch { prompt("Copy this:", text + " " + url); return; }
    $(copiedId).hidden = false; setTimeout(() => ($(copiedId).hidden = true), 2500);
  }
  const remember = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const recall = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  function show(id) { ["hub", "set", "ask", "paper"].forEach((s) => ($(s).hidden = s !== id)); }

  // ---------- set ----------
  let qs = [{ q: "", k: "t" }], mins = 0, askedBy = null;
  function renderSet() {
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
  $("sendSet").addEventListener("click", () => {
    const o = ready(); if (!o) return;
    remember("lp.from", o.from);
    share(message(o), linkFor(o), "copiedSet");
  });

  // ---------- ask ----------
  $("sendAsk").addEventListener("click", () => {
    const from = $("askFrom").value.trim().slice(0, 20) || "Someone";
    const subject = $("askSubject").value.trim().slice(0, 60);
    remember("lp.from", from);
    const o = { v: 1, id: newID(), from, qs: [] }; if (subject) o.note = subject;
    share(message(o), linkFor(o), "copiedAsk");
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
    $("mrsT").textContent = `Mrs T.: "${o.from} has sent homework. No talking."`;
    $("title").textContent = s === "answered" ? `MARKING: ${(o.by || "").toUpperCase()}'S HOMEWORK` : `HOMEWORK from ${o.from}`;
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
  function handIn() {
    if (handedIn) return; handedIn = true; clearInterval(clockTimer);
    remember("lp.from", $("by").value.trim());
    $("doFoot").hidden = true; $("sentFoot").hidden = false; renderPaper();
  }
  $("handIn").addEventListener("click", handIn);
  $("sendAnswers").addEventListener("click", () => { const o = answered(); share(message(o), linkFor(o), "copiedAns"); });
  $("sendMarked").addEventListener("click", () => {
    const remark = $("remarkIn").value.trim().slice(0, 60);
    const o = { ...hw, m: marks.map(Boolean) }; if (remark) o.remark = remark;
    share(message(o), linkFor(o), "copiedMarked");
  });

  // ---------- routing ----------
  $("toSet").addEventListener("click", () => { askedBy = null; $("askedNote").hidden = true; show("set"); renderSet(); $("from").focus(); });
  $("toAsk").addEventListener("click", () => { show("ask"); $("askFrom").value = recall("lp.from"); });
  $("own").addEventListener("click", () => { history.replaceState(null, "", location.pathname); askedBy = null; $("askedNote").hidden = true; show("set"); renderSet(); });
  addEventListener("hashchange", () => location.reload());

  const o = decode(location.hash.slice(1));
  $("from").value = recall("lp.from");
  if (o && stage(o) === "asked") {
    askedBy = o; show("set");
    $("askedNote").hidden = false; $("askedNote").textContent = `${o.from} asked for some${o.note ? " on " + o.note : ""}!`;
    $("to").value = o.from; if (o.note) $("noteIn").value = "on " + o.note;
    renderSet();
  } else if (o) {
    openPaper(o);
  } else {
    show("hub");
  }
})();
