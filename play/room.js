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
  // No "bye" when the page is hidden or the browser switches apps (Android does that for WhatsApp):
  // the friend would think we'd quit and stop sending moves. A real drop shows as "gone" from the
  // server, and the socket reconnects and catches up by itself.
  addEventListener("pageshow", (e) => { if (e.persisted && wantOpen && (!ws || ws.readyState > 1)) connect(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && wantOpen && (!ws || ws.readyState > 1)) connect(); });

  const app = { name: "", note: () => {} };
  const ctx = {
    get me() { return me; }, get host() { return host; }, get members() { return members; }, get name() { return app.name; },
    them() { return members.find((x) => x !== me) || "your friend"; },
    send, note: (t) => app.note(t),
    on(message, membersChanged) { onMessage = message; onMembers = membersChanged; },
    ended() { wantOpen = false; },
  };
  const TITLES = { noughtsCrosses: "Noughts & crosses", bookCricket: "Book cricket", dotsBoxes: "Dots & boxes", hangman: "Hangman", bollywood: "Bollywood", hollywood: "Hollywood", namePlace: "Name Place Animal Thing" };
  function begin(el) {
    if (game === "noughtsCrosses") noughts(el, ctx);
    else if (game === "bookCricket") cricket(el, ctx);
    else if (root.Live && root.Live[game]) root.Live[game](el, ctx);
    else el.innerHTML = `<p class="status">${esc(TITLES[game] || game)} isn't playable in a browser yet: open the link in the app.</p>`;
  }

  // ---------- noughts & crosses ----------
  function noughts(el, c) {
    const iAmTick = c.me === c.host;   // the host is ✓ and goes first in round one
    const mine = iAmTick ? "t" : "x", theirs = iAmTick ? "x" : "t";
    let b = ".........", starter = "t", k = [0, 0, 0], caught = null, their = c.them();
    const sym = (m) => (m === "t" ? "✓" : "✗");
    const tickName = iAmTick ? c.name : their, crossName = iAmTick ? their : c.name;
    function render() {
      their = c.them() === "your friend" ? their : c.them();
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
      [...b].forEach((cell, i) => {
        const btn = document.createElement("button");
        btn.textContent = cell === "." ? "" : sym(cell); if (cell !== ".") btn.classList.add(cell);
        if (line && line.includes(i)) btn.classList.add("win");
        btn.addEventListener("click", () => {
          if (over || turn !== mine || b[i] !== ".") return;
          play(i); c.send({ mark: { _0: i } });
        });
        board.appendChild(btn);
      });
      P.strike(board, line);
      const acts = el.querySelector("#acts");
      if (over) acts.innerHTML = `<button class="go" id="again">again →</button>`;
      const again = el.querySelector("#again"); if (again) again.addEventListener("click", () => { if (!roundOver()) return; nextRound(); c.send({ again: {} }); });
    }
    function play(i) {
      b = b.slice(0, i) + P.toMove(b, starter) + b.slice(i + 1);
      const w = P.winLine(b);
      if (w) k[b[w[0]] === "t" ? 0 : 1]++; else if (!b.includes(".")) k[2]++;
      render();
    }
    // "again" from either side starts the next round once: a second "again" for a round that's
    // already been restarted is ignored, as in the app (both pressing must not swap the starter twice).
    const roundOver = () => P.ncOver(b) || !!caught;
    function nextRound() { starter = starter === "t" ? "x" : "t"; b = "........."; caught = null; render(); }
    c.on((m) => {
      if (m.mark) { const i = m.mark._0; if (b[i] === "." && P.toMove(b, starter) === theirs && !P.ncOver(b)) play(i); }
      else if (m.again) { if (roundOver()) nextRound(); }
      else if (m.lostRound) { caught = "them"; k[iAmTick ? 0 : 1]++; render(); }
      else if (m.status) { c.note(m.status._0 || ""); }
      else if (m.bye) { el.innerHTML = `<p class="big">${esc(their)} ${m.bye.caught ? "got caught by Mrs T.!! 😂" : "left the game"}</p>` + el.innerHTML; c.ended(); }
    }, () => render());
    render();
  }

  // ---------- book cricket ----------
  function cricket(el, c) {
    // The one in charge bats first; "again" swaps sides for the next match (as in the app).
    let hostBatsFirst = true;
    let iBatFirst = (c.me === c.host) === hostBatsFirst;
    let p = [], q = null, lastPage = null, flipping = false, their = c.them();
    function render() {
      their = c.them() === "your friend" ? their : c.them();
      const t0 = (iBatFirst ? c.name : their) + " XI", t1 = (iBatFirst ? their : c.name) + " XI";
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
      html += `<p class="note"><b>${esc(curTeam)}</b></p>` + card(cur);
      if (first.over && !chase) {
        html += `<p class="big" style="font-size:22px">innings over!! target ${target}</p>`;
        html += iBatFirst ? `<p class="note">${esc(t1)} to bat, on their side…</p>` : `<button class="go" id="bat">our turn to bat →</button>`;
      }
      if (chase && chase.over) {
        if (chase.runs > first.runs) { const w = 3 - chase.wickets; html += `<p class="big">${iBatFirst ? esc(t1) + " won by " + w + " wkt" + (w === 1 ? "" : "s") : "WON!! by " + w + " wkt" + (w === 1 ? "" : "s")}</p>`; }
        else if (chase.runs === first.runs) html += `<p class="big">TIE!!</p>`;
        else { const r = first.runs - chase.runs; html += `<p class="big">${iBatFirst ? "WON!! by " + r + " run" + (r === 1 ? "" : "s") : esc(t0) + " won by " + r + " run" + (r === 1 ? "" : "s")}</p>`; }
        html += `<button class="go" id="newMatch">${c.restart ? "play again →" : "again →"}</button>`;
      }
      html += `<p class="note" id="rnote"></p>`;
      el.innerHTML = html;
      const flipEl = el.querySelector("#flip"); if (flipEl) flipEl.addEventListener("click", flip);
      const again = el.querySelector("#newMatch"); if (again) again.addEventListener("click", () => {
        if (c.restart) return c.restart();
        c.send({ again: {} }); rematch();
      });
      const bat = el.querySelector("#bat"); if (bat) bat.addEventListener("click", () => { q = []; lastPage = null; c.send({ chase: {} }); render(); });
    }
    // The page counts the moment it's flipped (a friend may already be batting on it); the
    // flicker of page numbers is only for show.
    async function flip() {
      if (flipping) return; flipping = true;
      const page = (Math.floor(Math.random() * 100) + 1) * 2;
      c.send({ page: { _0: page } });
      if (q) q.push(page); else p.push(page);
      const pg = el.querySelector("#pg");
      for (let i = 0; i < 7 && pg; i++) { pg.textContent = (Math.floor(Math.random() * 100) + 1) * 2; await new Promise((r) => setTimeout(r, 60)); }
      lastPage = page; flipping = false; render();
    }
    function land(page) { if (q) q.push(page); else p.push(page); lastPage = page; startChase(); render(); }
    let chaseAsked = false;
    function rematch() { hostBatsFirst = !hostBatsFirst; iBatFirst = (c.me === c.host) === hostBatsFirst; p = []; q = null; lastPage = null; chaseAsked = false; render(); }
    function startChase() { if (chaseAsked && P.innings(p).over && !q) { q = []; lastPage = null; chaseAsked = false; } }
    c.on((m) => {
      if (m.again) { if (q && P.innings(q, P.innings(p).runs + 1).over) rematch(); }   // once per match
      else if (m.page) land(m.page._0);
      else if (m.chase) { chaseAsked = true; startChase(); render(); }
      else if (m.status) c.note(m.status._0 || "");
      else if (m.bye) { el.innerHTML = `<p class="big">${esc(their)} ${m.bye.caught ? "got caught by Mrs T.!! 😂" : "left the game"}</p>` + el.innerHTML; c.ended(); }
    }, () => render());
    render();
  }

  // ---------- joining and starting ----------
  // The lobby lives in the panel's "waiting" section (#liveWaiting) while the name form hides;
  // once everyone's here the game replaces the whole panel.
  function lobby(el) {
    const form = el.querySelector("#liveForm"); if (form) form.hidden = true;
    const w = el.querySelector("#liveWaiting") || el;
    w.hidden = false;
    return w;
  }
  const change = `<button class="text-button" type="button" id="liveEdit">Change name</button>`;
  function run(el, roomCode, name) {
    code = roomCode.toUpperCase(); app.name = name;
    const w = lobby(el);
    app.note = (t) => { const n = document.getElementById("rnote"); if (n) n.textContent = t; };
    w.innerHTML = `<h2>Joining…</h2><p class="live-hint">Room <span class="live-code">${esc(code)}</span> · joining as ${esc(name)}</p><p class="live-hint" id="rnote"></p>${change}`;
    onReady = () => begin(el);
    onMembers = () => {
      if (started) return;
      const waiting = playersWanted - members.length;
      const here = members.filter((m) => m !== me);
      w.innerHTML = `<h2>Waiting for ${waiting === 1 ? "another player" : waiting + " more players"}</h2>
        <p class="live-hint">${esc(TITLES[game] || "The game")} · joining as ${esc(name)}${here.length ? " · here: " + here.map(esc).join(", ") : ""}</p>
        <p class="live-hint" id="rnote"></p>${change}`;
    };
    connect();
  }
  async function start(el, gameKind, name, players) {
    players = Math.min(Math.max(players || 2, 2), 8);
    const w = lobby(el);
    w.innerHTML = `<h2>Making the room…</h2>`;
    const { code: c } = await api("POST", "/r", { game: gameKind, players, host: { id: myId(), name } });
    const link = `${location.origin}/r/#${c}`;
    const fam = others();
    const text = `Play ${TITLES[gameKind]} with me on That Last Page ✏️ Tap to join (app or browser):\n${link}`;
    w.innerHTML = `<h2>Waiting for ${players === 2 ? "another player" : players - 1 + " more players"}</h2>
      <p class="live-hint">${esc(TITLES[gameKind])} · room <span class="live-code">${esc(c)}</span> · you're ${esc(name)}</p>
      ${fam.length ? `<div class="live-chips"><span class="live-hint">Invite:</span>${fam.map((m) => `<button class="text-button" type="button" data-inv="${esc(m.addr)}">${esc(m.name)}</button>`).join("")}</div>` : ""}
      <div class="live-actions"><a class="button primary" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(text)}">Send on WhatsApp</a><button class="button" type="button" id="copyLink">Copy the link</button></div>
      <p class="live-hint" id="rnote">They join in the app or any browser, by link or by name.</p><p class="live-hint" id="pushOffer"></p>${change}`;
    w.querySelectorAll("[data-inv]").forEach((b) => b.addEventListener("click", async () => { try { await api("POST", `/r/${c}/invite`, { addr: b.dataset.inv, from: name }); b.textContent = b.textContent.replace(/ ✓ asked$/, "") + " ✓ asked"; } catch (e) { alert(e.message); } }));
    if (root.LPPush) root.LPPush.offer(w.querySelector("#pushOffer"));
    const copy = w.querySelector("#copyLink"); if (copy) copy.addEventListener("click", async () => { try { await navigator.clipboard.writeText(link); copy.textContent = "Copied"; } catch { prompt("Copy this:", link); } });
    code = c; app.name = name;
    app.note = (t) => { const n = document.getElementById("rnote"); if (n) n.textContent = t; };
    onReady = () => begin(el);
    onMembers = () => {
      if (started) return;
      const n = w.querySelector("#rnote"); if (n) n.textContent = members.length > 1 ? `${members.filter((m) => m !== me).join(", ")} here${members.length < playersWanted ? " · waiting for " + (playersWanted - members.length) + " more" : "!"}` : "Waiting for them…";
    };
    connect();
  }
  root.Room = { run, start, leave, TITLES, api, games: { noughtsCrosses: noughts, bookCricket: cricket } };
})(window);
