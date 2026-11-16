// Live games in a room on our server: noughts & crosses and book cricket against the app or
// another browser. The room (server/src/index.js, Room) relays the app's own game messages
// (NearbyMessage JSON) in order and replays them to anyone who reconnects. The phone in
// charge (host) is ticks / bats first, as in the app.
(function (root) {
  const API = "https://lastpage-api.akkikhanna.workers.dev";
  const WS = API.replace(/^http/, "ws");
  const P = root.Play;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const recall = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
  const remember = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  function myId() {
    let a = recall("lp.address");
    if (a) return a;
    const L = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let stem = (recall("lp.name") || recall("lp.from") || "ME").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 10) || "ME";
    let tail = ""; for (let i = 0; i < 4; i++) tail += L[Math.floor(Math.random() * L.length)];
    a = stem + "-" + tail; remember("lp.address", a); return a;
  }
  const families = () => { try { return JSON.parse(recall("lp.families") || "[]"); } catch { return []; } };
  const others = () => { const seen = new Set(); return families().flatMap((f) => f.members).filter((m) => m.addr !== myId() && !seen.has(m.addr) && seen.add(m.addr)); };

  async function api(method, path, body) {
    const r = await fetch(API + path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ("server said " + r.status));
    return j;
  }

  // ---------- the room connection ----------
  let ws = null, code = null, lastSeq = 0, wantOpen = false, tries = 0;
  let me = null, host = null, members = [], game = null, playersWanted = 2, started = false;
  let onReady = null, onMessage = null, onMembers = null;
  function connect() {
    wantOpen = true;
    ws = new WebSocket(`${WS}/r/${code}?id=${encodeURIComponent(myId())}&name=${encodeURIComponent(app.name)}&since=${lastSeq}`);
    ws.onopen = () => { tries = 0; };
    ws.onmessage = (e) => {
      let f; try { f = JSON.parse(e.data); } catch { return; }
      if (f.t === "welcome") { me = f.you; host = f.host; game = f.game; playersWanted = f.players; members = f.members; setStatus(); }
      else if (f.t === "members") { members = f.members; host = f.host; setStatus(); }
      else if (f.t === "msg") { lastSeq = Math.max(lastSeq, f.seq); onMessage && onMessage(f.m, f.from); }
      else if (f.t === "log") { for (const x of f.msgs) { lastSeq = Math.max(lastSeq, x.seq); onMessage && onMessage(x.m, x.from); } }
      else if (f.t === "gone") { app.note(`lost touch with ${f.label}… waiting`); }
    };
    ws.onclose = () => { if (!wantOpen) return; const d = Math.min(1000 * 2 ** tries++, 10000); setTimeout(() => wantOpen && connect(), d); };
    ws.onerror = () => {};
  }
  function setStatus() {
    const everyone = members.length >= playersWanted;
    if (everyone && !started) { started = true; onReady && onReady(); }
    onMembers && onMembers();
  }
  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: "msg", m })); }
  function leave() { send({ bye: { caught: false } }); wantOpen = false; setTimeout(() => ws && ws.close(), 300); }
  addEventListener("pagehide", () => { if (wantOpen) { try { ws.send(JSON.stringify({ t: "msg", m: { bye: { caught: false } } })); } catch {} } });

  const app = { name: "", note: () => {} };

  // ---------- noughts & crosses ----------
  function noughts(el) {
    const iAmTick = me === host;   // the host is ✓ and goes first in round one
    const mine = iAmTick ? "t" : "x", theirs = iAmTick ? "x" : "t";
    let b = ".........", starter = "t", k = [0, 0, 0], caught = null, their = members.find((x) => x !== me) || "your friend";
    const sym = (m) => (m === "t" ? "✓" : "✗");
    const tickName = iAmTick ? app.name : their, crossName = iAmTick ? their : app.name;
    function render() {
      their = members.find((x) => x !== me) || their;
      const turn = P.toMove(b, starter), line = P.winLine(b), over = P.ncOver(b) || !!caught;
      let status;
      if (caught) status = caught === "me" ? `caught by Mrs T.! round to ${esc(their)}` : `${esc(their)} got caught! round's yours`;
      else if (line) status = b[line[0]] === mine ? "you won!!" : `${esc(their)} won`;
      else if (over) status = "draw!";
      else status = turn === mine ? `your turn ${sym(mine)}` : `${esc(their)}'s turn ${sym(theirs)}`;
      el.innerHTML = `<p class="status">${status}</p><div id="board"></div>
        <p class="scoreline">${esc(tickName)} ✓ ${k[0]} · ${esc(crossName)} ✗ ${k[1]}${k[2] ? " · draws " + k[2] : ""}</p>
        <p class="note" id="rnote"></p><div id="acts"></div>`;
      const board = el.querySelector("#board");
      [...b].forEach((c, i) => {
        const btn = document.createElement("button");
        btn.textContent = c === "." ? "" : sym(c); if (c !== ".") btn.classList.add(c);
        if (line && line.includes(i)) btn.classList.add("win");
        btn.addEventListener("click", () => {
          if (over || turn !== mine || b[i] !== ".") return;
          play(i); send({ mark: { _0: i } });
        });
        board.appendChild(btn);
      });
      const acts = el.querySelector("#acts");
      if (over) acts.innerHTML = `<button class="go" id="again">again →</button>`;
      const again = el.querySelector("#again"); if (again) again.addEventListener("click", () => { nextRound(); send({ again: {} }); });
    }
    function play(i) {
      b = b.slice(0, i) + P.toMove(b, starter) + b.slice(i + 1);
      const w = P.winLine(b);
      if (w) k[b[w[0]] === "t" ? 0 : 1]++; else if (!b.includes(".")) k[2]++;
      render();
    }
    function nextRound() { starter = starter === "t" ? "x" : "t"; b = "........."; caught = null; render(); }
    onMessage = (m) => {
      if (m.mark) { const i = m.mark._0; if (b[i] === "." && P.toMove(b, starter) === theirs && !P.ncOver(b)) play(i); }
      else if (m.again) nextRound();
      else if (m.lostRound) { caught = "them"; k[iAmTick ? 0 : 1]++; render(); }
      else if (m.status) { app.note(m.status._0 || ""); }
      else if (m.bye) { el.innerHTML = `<p class="big">${esc(their)} ${m.bye.caught ? "got caught by Mrs T.!! 😂" : "left the game"}</p>` + el.innerHTML; wantOpen = false; }
    };
    onMembers = render;
    render();
  }

  // ---------- book cricket ----------
  function cricket(el) {
    const iBatFirst = me === host;
    let p = [], q = null, lastPage = null, flipping = false, their = members.find((x) => x !== me) || "your friend";
    function render() {
      their = members.find((x) => x !== me) || their;
      const t0 = (iBatFirst ? app.name : their) + " XI", t1 = (iBatFirst ? their : app.name) + " XI";
      const first = P.innings(p), target = first.runs + 1, chase = q ? P.innings(q, target) : null;
      const myInnings = (chase === null) === iBatFirst;
      const cur = chase || first, curTeam = chase ? t1 : t0;
      const card = (inn) => `<table class="card">${inn.batters.map((bs, i) => (!bs.length && i > inn.wickets) ? "" :
        `<tr><td class="balls">${bs.map((x) => x === "W" ? '<span style="color:var(--red)">W</span>' : x === "nb" ? "1nb" : x).join(" ") || "–"}</td></tr>`).join("")}
        <tr><td><b>${inn.runs}/${inn.wickets}</b> <span class="note">${Math.floor(inn.legal / 6)}.${inn.legal % 6} ov</span></td></tr></table>`;
      let html = `<p class="status"><b>${esc(t0)} vs ${esc(t1)}</b></p>`;
      if (chase) html += `<p class="note">${esc(t0)} ${first.runs}/${first.wickets}</p>`;
      if (!cur.over) {
        html += `<p class="note">${chase ? `${esc(t1)} need ${Math.max(target - chase.runs, 0)} off ${18 - chase.legal}` : `${esc(t0)} batting`}</p>`;
        if (myInnings) {
          const call = lastPage == null ? "" : { W: "OUT!!", nb: "no ball! +1", 6: "6!! SIXER", 4: "4!! FOUR" }[P.ball(lastPage)] ?? P.ball(lastPage);
          html += `<div><span class="page" id="flip" role="button"><small>Page No.</small><b id="pg">${lastPage ?? "?"}</b></span><span class="call">${call}</span><p class="note">tap the book to flip ↻</p></div>`;
        } else html += `<p class="note">${esc(curTeam)} flipping on their side… ${lastPage != null ? "page " + lastPage : ""}</p>`;
      }
      html += card(cur);
      if (first.over && !chase) {
        html += `<p class="big" style="font-size:22px">innings over!! target ${target}</p>`;
        html += iBatFirst ? `<p class="note">${esc(t1)} to bat, on their side…</p>` : `<button class="go" id="bat">our turn to bat →</button>`;
      }
      if (chase && chase.over) {
        if (chase.runs > first.runs) { const w = 3 - chase.wickets; html += `<p class="big">${iBatFirst ? esc(t1) + " won by " + w + " wkt" + (w === 1 ? "" : "s") : "WON!! by " + w + " wkt" + (w === 1 ? "" : "s")}</p>`; }
        else if (chase.runs === first.runs) html += `<p class="big">TIE!!</p>`;
        else { const r = first.runs - chase.runs; html += `<p class="big">${iBatFirst ? "WON!! by " + r + " run" + (r === 1 ? "" : "s") : esc(t0) + " won by " + r + " run" + (r === 1 ? "" : "s")}</p>`; }
      }
      html += `<p class="note" id="rnote"></p>`;
      el.innerHTML = html;
      const flipEl = el.querySelector("#flip"); if (flipEl) flipEl.addEventListener("click", flip);
      const bat = el.querySelector("#bat"); if (bat) bat.addEventListener("click", () => { q = []; lastPage = null; send({ chase: {} }); render(); });
    }
    async function flip() {
      if (flipping) return; flipping = true;
      const page = (Math.floor(Math.random() * 100) + 1) * 2;
      send({ page: { _0: page } });
      const pg = el.querySelector("#pg");
      for (let i = 0; i < 7 && pg; i++) { pg.textContent = (Math.floor(Math.random() * 100) + 1) * 2; await new Promise((r) => setTimeout(r, 60)); }
      land(page); flipping = false;
    }
    function land(page) { if (q) q.push(page); else p.push(page); lastPage = page; render(); }
    onMessage = (m) => {
      if (m.page) land(m.page._0);
      else if (m.chase) { if (P.innings(p).over && !q) { q = []; lastPage = null; render(); } }
      else if (m.status) app.note(m.status._0 || "");
      else if (m.bye) { el.innerHTML = `<p class="big">${esc(their)} ${m.bye.caught ? "got caught by Mrs T.!! 😂" : "left the game"}</p>` + el.innerHTML; wantOpen = false; }
    };
    onMembers = render;
    render();
  }

  // ---------- joining and starting ----------
  const TITLES = { noughtsCrosses: "Noughts & crosses", bookCricket: "Book cricket" };
  function run(el, roomCode, name) {
    code = roomCode.toUpperCase(); app.name = name;
    app.note = (t) => { const n = el.querySelector("#rnote"); if (n) n.textContent = t; };
    el.innerHTML = `<p class="status">joining room ${esc(code)}…</p>`;
    onReady = () => {
      if (game === "noughtsCrosses") noughts(el);
      else if (game === "bookCricket") cricket(el);
      else el.innerHTML = `<p class="status">${esc(TITLES[game] || game)} isn't playable in a browser yet: open the link in the app.</p>`;
    };
    onMembers = () => {
      if (started) return;
      const waiting = playersWanted - members.length;
      el.innerHTML = `<p class="status">${esc(TITLES[game] || "the game")} · ${members.map(esc).join(", ")} here · waiting for ${waiting} more…</p>
        <p class="note">code <b>${esc(code)}</b> · send the link: ${location.origin}/r/#${esc(code)}</p>`;
    };
    connect();
  }
  async function start(el, gameKind, name) {
    const { code: c } = await api("POST", "/r", { game: gameKind, players: 2, host: { id: myId(), name } });
    const link = `${location.origin}/r/#${c}`;
    const fam = others();
    el.innerHTML = `<p class="status">${esc(TITLES[gameKind])}: room <b>${esc(c)}</b></p>
      ${fam.length ? `<p class="note">play with: ${fam.map((m) => `<button class="small" data-inv="${esc(m.addr)}" style="color:var(--red);font-weight:700">${esc(m.name)} →</button>`).join(" ")}</p>` : ""}
      <p><a class="go" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Play ${TITLES[gameKind]} with me on That Last Page ✏️ Tap to join (app or browser):\n${link}`)}">send the invite on WhatsApp →</a>
      <button class="small" id="copyLink">copy the link</button></p><p class="note" id="rnote">waiting for them…</p>`;
    el.querySelectorAll("[data-inv]").forEach((b) => b.addEventListener("click", async () => { try { await api("POST", `/r/${c}/invite`, { addr: b.dataset.inv, from: name }); b.textContent = b.textContent.replace("→", "✓ asked"); } catch (e) { alert(e.message); } }));
    const copy = el.querySelector("#copyLink"); if (copy) copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); copy.textContent = "copied!!"; } catch { prompt("Copy this:", link); } });
    code = c; app.name = name;
    app.note = (t) => { const n = el.querySelector("#rnote"); if (n) n.textContent = t; };
    onReady = () => { if (gameKind === "noughtsCrosses") noughts(el); else cricket(el); };
    onMembers = () => {
      if (started) return;
      const n = el.querySelector("#rnote"); if (n) n.textContent = members.length > 1 ? `${members.filter((m) => m !== me).join(", ")} here!` : "waiting for them…";
    };
    connect();
  }
  root.Room = { run, start, leave };
})(window);
