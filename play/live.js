// Live rooms, the rest of the games: dots & boxes, hangman / Bollywood / Hollywood, and name
// place animal thing, against the app or another browser. Each speaks the app's own messages
// (NearbyMessage JSON) over the room, with the same rules as the app (DotsBoxes.swift,
// Hangman.swift / rules.js, NPAT.swift). The host is "first" / sets the first word / picks the letter.
(function (root) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const on = (el, id, f) => { const x = el.querySelector("#" + id); if (x) x.addEventListener("click", f); return x; };
  const leftNote = (el, ctx, m) => { el.innerHTML = `<p class="big">${esc(ctx.them())} ${m.bye.caught ? "got caught by Mrs T.!! 😂" : "left the game"}</p>` + el.innerHTML; };

  // ---------- dots & boxes (4 boxes a side) ----------
  function dots(el, ctx) {
    const N = 4, iAmFirst = ctx.me === ctx.host;
    const me = iAmFirst ? "first" : "second", them = iAmFirst ? "second" : "first";
    let lines = {}, boxes = [], toMove = "first", starter = "first", caught = null;
    const key = (a, r, c) => `${a ? "a" : "d"}:${r}:${c}`;
    const reset = () => { lines = {}; boxes = Array.from({ length: N }, () => Array(N).fill(null)); toMove = starter; caught = null; };
    reset();
    const sides = (r, c) => [key(1, r, c), key(1, r + 1, c), key(0, r, c), key(0, r, c + 1)].filter((k) => lines[k]).length;
    const beside = (a, r, c) => a ? [[r - 1, c], [r, c]].filter(([br]) => br >= 0 && br < N) : [[r, c - 1], [r, c]].filter(([, bc]) => bc >= 0 && bc < N);
    const total = 2 * N * (N + 1);
    const over = () => Object.keys(lines).length === total || !!caught;
    const score = (p) => boxes.flat().filter((b) => b === p).length;
    function play(a, r, c) {
      const k = key(a, r, c); if (lines[k]) return false;
      lines[k] = toMove;
      const closed = beside(a, r, c).filter(([br, bc]) => sides(br, bc) === 4);
      for (const [br, bc] of closed) boxes[br][bc] = toMove;
      if (!closed.length) toMove = toMove === "first" ? "second" : "first";
      render(closed.length > 0);
      return true;
    }
    function render(justClosed) {
      const their = ctx.them(), firstName = iAmFirst ? ctx.name : their, secondName = iAmFirst ? their : ctx.name;
      const a = score("first"), b = score("second"), done = over();
      let status;
      if (caught) status = caught === "me" ? `caught by Mrs T.! ${esc(their)} wins this one` : `${esc(their)} got caught! you win this one`;
      else if (done) status = a === b ? "draw!" : (score(me) > score(them) ? "you won!!" : `${esc(their)} won`);
      else status = toMove === me ? `${justClosed ? "box!! go again · " : ""}your turn: join two dots` : `${esc(their)}'s turn`;
      const S = 56, pad = 18, W = pad * 2 + N * S;
      let svg = `<svg viewBox="0 0 ${W} ${W}" style="width:100%;max-width:300px;display:block;margin:8px 0" aria-label="dots and boxes">`;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (boxes[r][c])
        svg += `<rect x="${pad + c * S + 3}" y="${pad + r * S + 3}" width="${S - 6}" height="${S - 6}" fill="${boxes[r][c] === "first" ? "rgba(36,55,126,.15)" : "rgba(184,50,42,.15)"}"/>
          <text x="${pad + c * S + S / 2}" y="${pad + r * S + S / 2 + 8}" text-anchor="middle" font-family="Kalam" font-size="22" fill="${boxes[r][c] === "first" ? "#24377e" : "#b8322a"}">${boxes[r][c] === "first" ? esc(firstName[0]) : esc(secondName[0])}</text>`;
      const edge = (isA, r, c) => {
        const k = key(isA, r, c), drawn = lines[k];
        const x1 = pad + c * S, y1 = pad + r * S, x2 = isA ? x1 + S : x1, y2 = isA ? y1 : y1 + S;
        return `<line data-e="${isA ? 1 : 0}:${r}:${c}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${drawn ? (drawn === "first" ? "#24377e" : "#b8322a") : "rgba(95,95,95,.12)"}" stroke-width="${drawn ? 4 : 10}" stroke-linecap="round" style="cursor:pointer"/>`;
      };
      for (let r = 0; r <= N; r++) for (let c = 0; c < N; c++) svg += edge(true, r, c);
      for (let r = 0; r < N; r++) for (let c = 0; c <= N; c++) svg += edge(false, r, c);
      for (let r = 0; r <= N; r++) for (let c = 0; c <= N; c++) svg += `<circle cx="${pad + c * S}" cy="${pad + r * S}" r="4" fill="#24377e"/>`;
      svg += "</svg>";
      el.innerHTML = `<p class="status">${status}</p>${svg}<p class="scoreline">${esc(firstName)} ${a} · ${esc(secondName)} ${b}</p><p class="note" id="rnote"></p><div id="acts">${done ? '<button class="go" id="again">again →</button>' : ""}</div>`;
      el.querySelectorAll("[data-e]").forEach((l) => l.addEventListener("click", () => {
        if (over() || toMove !== me) return;
        const [a, r, c] = l.dataset.e.split(":").map(Number);
        if (play(!!a, r, c)) ctx.send({ line: { across: !!a, row: r, col: c } });
      }));
      on(el, "again", () => { starter = starter === "first" ? "second" : "first"; reset(); render(); ctx.send({ again: {} }); });
    }
    ctx.on((m) => {
      if (m.line) { if (!over() && toMove === them) play(m.line.across, m.line.row, m.line.col); }
      else if (m.again) { starter = starter === "first" ? "second" : "first"; reset(); render(); }
      else if (m.lostRound) { caught = "them"; render(); }
      else if (m.status) ctx.note(m.status._0 || "");
      else if (m.bye) leftNote(el, ctx, m);
    }, () => render());
    render();
  }

  // ---------- hangman, Bollywood, Hollywood ----------
  function hangmanFor(kind) {
    const mode = kind === "bollywood" ? "b" : kind === "hollywood" ? "y" : "h";
    return function (el, ctx) {
      const H = root.Hangman, M = H.MODES[mode];
      let iSet = ctx.me === ctx.host, game = null, secret = "", hint = "";
      const ROWS = ["ABCDEFG", "HIJKLMN", "OPQRSTU", "VWXYZ"];
      function render() {
        const their = ctx.them();
        if (!game) {
          if (iSet) {
            el.innerHTML = `<p class="status">write a ${M.thing} for ${esc(their)} to guess:</p>
              <p><input id="secret" maxlength="40" placeholder="secret ${M.thing}" value="${esc(secret)}" style="width:260px;text-transform:uppercase"></p>
              ${mode === "h" ? `<p><input id="hint" maxlength="20" placeholder="a hint (optional)" value="${esc(hint)}" style="width:200px;text-transform:none;font-weight:400"></p>` : ""}
              <button class="go" id="sendWord">send it to ${esc(their)} →</button><p class="note" id="rnote"></p>`;
            on(el, "sendWord", () => {
              const w = H.cleanWord(el.querySelector("#secret").value);
              if (w.replace(/ /g, "").length < 2) return;
              const h = mode === "h" ? (el.querySelector("#hint").value.trim().slice(0, 20) || null) : null;
              secret = w; hint = h || "";
              game = H.game(w, mode);
              ctx.send({ secret: { word: w, hint: h } });
              render();
            });
          } else {
            el.innerHTML = `<p class="status">${esc(their)} is writing a ${M.thing} for you… no peeking!</p><p class="note" id="rnote"></p>`;
          }
          return;
        }
        const rev = game.revealed(), wrong = game.wrong(), over = game.over();
        const slots = rev.map((c) => c === " " ? '<span style="display:inline-block;width:14px"></span>' : `<span style="display:inline-block;width:26px;border-bottom:2px solid #5f5f5f;text-align:center;font:700 26px Kalam;margin:0 2px">${c || (iSet ? `<span style="color:#aaa">${""}</span>` : "")}</span>`).join("");
        const banner = M.banner ? `<p style="font:700 28px Kalam;letter-spacing:.1em;margin:4px 0">${[...M.banner].map((c, i) => i < wrong ? `<s style="color:#b8322a">${c}</s>` : c).join("")}</p>` : `<p class="note">${wrong} of ${M.chances} wrong</p>`;
        let status = iSet ? (over ? (game.won() ? `${esc(their)} got it!!` : `${esc(their)} is hanged!! it was ${esc(game.word)}`) : `${esc(their)} is guessing… (${esc(game.word)})`)
                          : (over ? (game.won() ? (M.banner ? "got it!!" : "saved him!!") : `${M.banner ? M.banner + "!!" : "hanged!!"} it was ${esc(game.word)}`) : `guess a letter · ${M.chances - wrong} chance${M.chances - wrong === 1 ? "" : "s"} left`);
        let keys = "";
        if (!iSet && !over) keys = `<div style="margin:8px 0">${ROWS.map((row) => `<div>${[...row].map((L) => { const used = game.guessed.has(L) || game.given.has(L); return `<button class="word" data-l="${L}" ${used ? "disabled" : ""} style="min-width:36px;padding:2px 6px;${used ? "color:#bbb" : ""}">${L}</button>`; }).join("")}</div>`).join("")}</div>`;
        el.innerHTML = `<p class="status">${status}</p>${game.mode.banner ? banner : ""}${hint && !iSet ? `<p class="note">hint: ${esc(hint)}</p>` : ""}<p>${slots}</p>${!game.mode.banner ? banner : ""}${keys}<p class="note" id="rnote"></p>${over ? '<button class="go" id="again">again →</button>' : ""}`;
        el.querySelectorAll("[data-l]").forEach((b) => b.addEventListener("click", () => { game.guess(b.dataset.l); ctx.send({ guess: { _0: b.dataset.l } }); render(); }));
        on(el, "again", () => { ctx.send({ again: {} }); swap(); });
      }
      function swap() { iSet = !iSet; game = null; secret = ""; hint = ""; render(); }
      ctx.on((m) => {
        if (m.secret) { if (!iSet && !game) { game = H.game(m.secret.word, mode); hint = m.secret.hint || ""; render(); } }
        else if (m.guess) { if (iSet && game) { game.guess(m.guess._0); render(); } }
        else if (m.again) { if (game && game.over()) swap(); }
        else if (m.status) ctx.note(m.status._0 || "");
        else if (m.bye) leftNote(el, ctx, m);
      }, () => render());
      render();
    };
  }

  // ---------- name place animal thing ----------
  function npat(el, ctx) {
    const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWYZ"];
    const COLS = { name: "NAME", place: "PLACE", animal: "ANIMAL", thing: "THING", film: "FILM", food: "FOOD" };
    const inCharge = ctx.me === ctx.host;
    let stage = "pick", letter = "A", columns = ["name", "place", "animal", "thing"], seconds = 60, used = [];
    let mine = {}, others = {}, judged = {}, stoppedBy = null, countdown = null, startedAt = 0, timer = null, points = null, totals = {};
    const key = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
    const valid = (s) => key(s).length >= 2 && key(s)[0] === letter;
    const mult = letter === "Q" || letter === "Z" ? 2 : 1;
    function beginRound(l, s, cols) {
      letter = l; seconds = s; columns = cols; mine = {}; others = {}; judged = {}; stoppedBy = null; countdown = null; points = null;
      for (const c of columns) mine[c] = letter;
      startedAt = Date.now(); stage = "writing";
      clearInterval(timer);
      timer = setInterval(() => { if (stage !== "writing") return clearInterval(timer); const left = seconds - (Date.now() - startedAt) / 1000; const t = el.querySelector("#clk"); if (t) t.textContent = fmt(left); if (left <= 0 && countdown === null) penDown(); }, 250);
      render();
    }
    const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
    const allFilled = () => columns.every((c) => key(mine[c]).length >= 2);
    function stop(by) {
      if (stage !== "writing" || stoppedBy) return;
      stoppedBy = by;
      if (by === ctx.me) ctx.send({ npatStop: { player: ctx.me } });
      let n = 3; countdown = n; render();
      const tick = setInterval(() => { n--; if (n <= 0) { clearInterval(tick); penDown(); } else { countdown = n; const t = el.querySelector("#clk"); if (t) t.textContent = `pens down in ${n}…`; } }, 1000);
    }
    function penDown() {
      if (stage !== "writing") return;
      clearInterval(timer); countdown = null; used.push(letter);
      const answers = {}; for (const c of columns) answers[c] = (mine[c] || "").toUpperCase();
      mine = answers;
      ctx.send({ npatSheet: { player: ctx.me, answers } });
      stage = "marking"; render();
    }
    // Everyone judges everyone else: a tick goes out for each readable answer as a sheet
    // arrives (so the app can add up), and a tap turns it into a cross.
    function judgeSheet(player) {
      for (const c of columns) { const ok = valid(others[player][c]); if (ok) { setJudged(player, c, true); ctx.send({ npatJudge: { player, column: c, ok: true } }); } }
    }
    function setJudged(player, c, ok) { (judged[player] = judged[player] || {})[c] = ok; }
    const counts = (player, c) => { const a = player === ctx.me ? mine[c] : (others[player] || {})[c]; if (!valid(a)) return false; const j = (judged[player] || {})[c]; return j !== false; };
    function addUp() {
      if (stage !== "marking") return;
      const players = [ctx.me, ...Object.keys(others)];
      points = {};
      for (const p of players) { points[p] = {}; for (const c of columns) {
        if (!counts(p, c)) { points[p][c] = 0; continue; }
        const mineK = key(p === ctx.me ? mine[c] : others[p][c]);
        const shared = players.some((q) => q !== p && counts(q, c) && key(q === ctx.me ? mine[c] : others[q][c]) === mineK);
        points[p][c] = (shared ? 5 : 10) * mult;
      } }
      for (const p of players) totals[p] = (totals[p] || 0) + Object.values(points[p]).reduce((a, b) => a + b, 0);
      stage = "added"; render();
    }
    const waitingFor = () => ctx.members.filter((m) => m !== ctx.me && !others[m]);
    const canAddUp = () => waitingFor().length === 0;
    function render() {
      const their = ctx.members.filter((m) => m !== ctx.me);
      const circled = `<span style="display:inline-block;border:2.5px solid #b8322a;border-radius:50%;width:44px;height:44px;line-height:40px;text-align:center;font:700 28px Kalam;color:#b8322a">${letter}</span>`;
      const totalsLine = Object.keys(totals).length ? `<p class="scoreline">${[ctx.me, ...their].map((p) => `${esc(p === ctx.me ? "me" : p)} ${totals[p] || 0}`).join(" · ")}</p>` : "";
      if (stage === "pick") {
        if (inCharge) {
          const avail = LETTERS.filter((l) => !used.includes(l));
          el.innerHTML = `${totalsLine}<p class="status">pick the letter:</p><p>${circled} <button class="go" id="spin">spin →</button></p>
            <p class="note">time: <select id="secs">${[60, 90, 120, 180].map((s) => `<option value="${s}" ${s === seconds ? "selected" : ""}>${s / 60 >= 1 ? (s % 60 ? s + " s" : s / 60 + " min") : s + " s"}</option>`).join("")}</select>
            · columns: ${["film", "food"].map((c) => `<label><input type="checkbox" data-col="${c}" ${columns.includes(c) ? "checked" : ""}> ${c}</label>`).join(" ")}</p>
            <p class="note">${their.length ? esc(their.join(", ")) + " waiting" : "waiting for the others…"}</p><p class="note" id="rnote"></p>`;
          on(el, "spin", () => {
            seconds = parseInt(el.querySelector("#secs").value, 10);
            const extra = [...el.querySelectorAll("[data-col]:checked")].map((x) => x.dataset.col);
            const cols = ["name", "place", "animal", "thing", ...extra];
            let n = 0; const spin = setInterval(() => { letter = avail[Math.floor(Math.random() * avail.length)]; const c = el.querySelector("#spin"); if (c) c.previousSibling.textContent = letter; if (++n > 12) { clearInterval(spin); ctx.send({ npatRound: { letter, seconds, columns: cols } }); beginRound(letter, seconds, cols); } }, 90);
          });
        } else el.innerHTML = `${totalsLine}<p class="status">${esc(ctx.host)} is picking the letter… get ready!</p><p class="note" id="rnote"></p>`;
        return;
      }
      if (stage === "writing") {
        el.innerHTML = `<p class="status">${circled} <b id="clk" style="font-size:26px;margin-left:10px">${countdown !== null ? `pens down in ${countdown}…` : fmt(seconds - (Date.now() - startedAt) / 1000)}</b></p>
          <p class="note">${stoppedBy ? esc(stoppedBy) + " said STOP!!" : (their.length ? esc(their.join(", ")) + " writing too…" : "just you now")}</p>
          ${columns.map((c) => `<p><label><span class="pencil" style="display:inline-block;width:80px">${COLS[c]}</span><input data-a="${c}" value="${esc(mine[c] || "")}" maxlength="30" style="width:200px;text-transform:uppercase;font-weight:400"></label></p>`).join("")}
          <button class="go" id="stop" ${allFilled() && !stoppedBy ? "" : "disabled"}>STOP!</button><p class="note" id="rnote"></p>`;
        el.querySelectorAll("[data-a]").forEach((i) => i.addEventListener("input", () => { mine[i.dataset.a] = i.value.toUpperCase(); const s = el.querySelector("#stop"); if (s) s.disabled = !(allFilled() && !stoppedBy); }));
        on(el, "stop", () => stop(ctx.me));
        return;
      }
      // marking / added
      const players = [ctx.me, ...Object.keys(others)];
      let html = `<p class="status">${circled} ${stage === "added" ? "added up!" : canAddUp() ? (inCharge ? "cross anything that isn't right, then add up" : `cross anything that isn't right · ${esc(ctx.host)} adds up`) : `waiting for ${esc(waitingFor().join(", "))}'s sheet…`}</p>`;
      html += `<table class="card"><tr><td></td>${players.map((p) => `<td><b>${esc(p === ctx.me ? "me" : p)}</b></td>`).join("")}</tr>`;
      for (const c of columns) html += `<tr><td class="note">${COLS[c]}</td>${players.map((p) => { const a = p === ctx.me ? mine[c] : others[p][c]; const ok = counts(p, c); const bad = !valid(a); const pt = points ? points[p][c] : null;
        return `<td>${bad ? `<s style="color:#999">${esc(a || "–")}</s>` : ok ? esc(a) : `<s style="color:#b8322a">${esc(a)}</s>`}${p !== ctx.me && stage === "marking" && !bad ? ` <button class="small" data-j="${esc(p)}:${c}" style="padding:0 6px">${ok ? "✓" : "✗"}</button>` : ""}${pt !== null ? ` <span class="note">${pt}</span>` : ""}</td>`; }).join("")}</tr>`;
      if (points) html += `<tr><td><b>total</b></td>${players.map((p) => `<td><b style="color:#b8322a">${Object.values(points[p]).reduce((a, b) => a + b, 0)}</b></td>`).join("")}</tr>`;
      html += `</table>${totalsLine}`;
      if (stage === "marking") html += inCharge ? `<button class="go" id="addup" ${canAddUp() ? "" : "disabled"}>add up →</button>` : "";
      else html += inCharge ? `<button class="go" id="next">next letter →</button>` : `<p class="note">next letter: ${esc(ctx.host)} picks it</p>`;
      html += `<p class="note">letters: ${used.join(", ")}</p><p class="note" id="rnote"></p>`;
      el.innerHTML = html;
      el.querySelectorAll("[data-j]").forEach((b) => b.addEventListener("click", () => { const [p, c] = b.dataset.j.split(":"); const now = !counts(p, c); setJudged(p, c, now); ctx.send({ npatJudge: { player: p, column: c, ok: now } }); render(); }));
      on(el, "addup", () => { ctx.send({ npatAddUp: {} }); addUp(); });
      on(el, "next", () => { stage = "pick"; render(); });
    }
    ctx.on((m) => {
      if (m.npatRound) beginRound(m.npatRound.letter, m.npatRound.seconds, m.npatRound.columns);
      else if (m.npatStop) stop(m.npatStop.player);
      else if (m.npatSheet) { if (m.npatSheet.player !== ctx.me) { others[m.npatSheet.player] = m.npatSheet.answers; judgeSheet(m.npatSheet.player); render(); } }
      else if (m.npatJudge) { setJudged(m.npatJudge.player, m.npatJudge.column, m.npatJudge.ok); render(); }
      else if (m.npatAddUp) addUp();
      else if (m.gone) { delete others[m.gone._0]; render(); }
      else if (m.status) ctx.note(m.status._0 || "");
      else if (m.bye) leftNote(el, ctx, m);
    }, () => { if (stage === "pick") render(); });
    render();
  }

  root.Live = { dotsBoxes: dots, hangman: hangmanFor("hangman"), bollywood: hangmanFor("bollywood"), hollywood: hangmanFor("hollywood"), namePlace: npat };
})(window);
