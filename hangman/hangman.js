// Guess-my-word challenges, no server: the word travels in the part of the link after
// "#" (lightly scrambled so it isn't readable in the chat), and everyone who opens the
// link plays it in their own browser. Rules match the app (rules.js).
(function () {
  const $ = (id) => document.getElementById(id);
  const ROWS = ["ABCDEFG", "HIJKLMN", "OPQRSTU", "VWXYZ"];
  const KEY = [7, 41, 13, 99, 2, 77, 23, 58];

  // Challenge <-> link: JSON → bytes → XOR with a short key → base64url.
  function encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj)).map((b, i) => b ^ KEY[i % KEY.length]);
    let bin = ""; bytes.forEach((x) => (bin += String.fromCharCode(x)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(s) {
    try {
      const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ KEY[i % KEY.length]);
      const o = JSON.parse(new TextDecoder().decode(bytes));
      return o && typeof o.w === "string" && Hangman.cleanWord(o.w).replace(/ /g, "").length >= 2 ? o : null;
    } catch { return null; }
  }
  const linkFor = (o) => location.origin + location.pathname + "#" + encode(o);

  async function share(text, url, copiedId) {
    if (navigator.share) {
      try { await navigator.share({ text, url }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url ? text + " " + url : text); }
    catch { prompt("Copy this:", url || text); return; }
    $(copiedId).hidden = false; setTimeout(() => ($(copiedId).hidden = true), 2500);
  }

  // ---------- make a challenge ----------
  let mode = "h";
  function setMode(m) {
    mode = m;
    document.querySelectorAll(".mode").forEach((b) => {
      const on = b.dataset.mode === m; b.classList.toggle("on", on); b.setAttribute("aria-checked", on);
    });
    const M = Hangman.MODES[m];
    $("secretLabel").textContent = `secret ${M.thing} (they won't see it)`;
    $("hintRow").hidden = m !== "h";
    updateMake();
  }
  function slotsHTML(word, given, showLetters) {
    return [...word].map((c) => c === " " ? '<span class="slot space"></span>'
      : `<span class="slot${given.has(c) ? " given" : ""}">${given.has(c) || showLetters ? c : ""}</span>`).join("");
  }
  function updateMake() {
    const w = Hangman.cleanWord($("secret").value);
    const M = Hangman.MODES[mode];
    const given = new Set(M.given);
    $("preview").innerHTML = w ? slotsHTML(w, given, false) : "";
    const guessable = [...w].filter((c) => c !== " " && !given.has(c)).length;
    $("makeLink").disabled = w.replace(/ /g, "").length < 2 || guessable < 1;
  }
  document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  ["secret", "hint"].forEach((id) => $(id).addEventListener("input", updateMake));
  $("peek").addEventListener("click", () => {
    const show = $("secret").type === "password";
    $("secret").type = show ? "text" : "password"; $("peek").textContent = show ? "hide" : "show";
  });
  $("makeLink").addEventListener("click", () => {
    const o = { m: mode, w: Hangman.cleanWord($("secret").value) };
    const hint = $("hint").value.trim().slice(0, 20);
    const from = $("from").value.trim().slice(0, 20);
    if (mode === "h" && hint) o.c = hint;
    if (from) o.f = from;
    try { localStorage.setItem("lp.from", from); } catch {}
    const M = Hangman.MODES[mode];
    const what = mode === "h" ? "my word" : `my ${M.title} film`;
    share(`Can you guess ${what}? 🤔 ${mode === "h" ? "6 chances" : "9 chances"} — no app needed`, linkFor(o), "copied");
  });

  // ---------- play a challenge ----------
  function gallows() {
    // Gallows drawn; the man is six strokes, one per wrong guess.
    return `<svg viewBox="0 0 130 170" aria-hidden="true">
      <path class="frame" d="M10 162 H90 M30 162 V10 H92 V30 M30 40 L58 10"/>
      <circle class="part" cx="92" cy="45" r="15"/>
      <path class="part" d="M92 60 V108"/>
      <path class="part" d="M92 72 L72 92"/>
      <path class="part" d="M92 72 L112 92"/>
      <path class="part" d="M92 108 L74 140"/>
      <path class="part" d="M92 108 L110 140"/></svg>`;
  }

  function play(o) {
    const g = Hangman.game(o.w, o.m);
    const M = g.mode;
    $("make").hidden = true; $("play").hidden = false;
    $("playTitle").textContent = M.banner ? M.title : "hangman";
    const from = o.f ? o.f.toUpperCase() : "Someone";
    $("from-line").textContent = `${from} challenges you: guess the ${M.thing}!`;
    if (o.c) { $("hintLine").hidden = false; $("hintLine").textContent = `hint: ${o.c}`; }
    $("picture").classList.toggle("films", !!M.banner);
    $("picture").innerHTML = M.banner
      ? `<div class="banner" aria-hidden="true">${[...M.banner].map((c) => `<span>${c}</span>`).join("")}</div>`
      : gallows();
    $("keys").innerHTML = ROWS.join("").split("").filter((c) => !g.given.has(c))
      .map((c) => `<button class="key" data-k="${c}" aria-label="${c}">${c}</button>`).join("");

    function render() {
      const rev = g.revealed();
      const over = g.over();
      $("slots").innerHTML = [...g.word].map((c, i) => c === " " ? '<span class="slot space"></span>'
        : rev[i] ? `<span class="slot${g.given.has(c) ? " given" : ""}">${c}</span>`
        : `<span class="slot${over ? " missed" : ""}">${over ? c : ""}</span>`).join("");
      const wrong = g.wrong();
      if (M.banner) document.querySelectorAll(".banner span").forEach((s, i) => s.classList.toggle("x", i < wrong));
      else document.querySelectorAll(".part").forEach((p, i) => p.classList.toggle("on", i < wrong));
      const left = M.chances - wrong;
      $("left").textContent = over ? "" : `${left} chance${left === 1 ? "" : "s"} left`;
      if (over) finish();
    }
    function finish() {
      document.querySelectorAll(".key").forEach((k) => (k.disabled = true));
      const wrong = g.wrong();
      const won = g.won();
      $("result").textContent = won
        ? (wrong === 0 ? "Got it!! no wrong guesses 😎" : `Got it!! ${wrong} wrong guess${wrong === 1 ? "" : "es"}`)
        : (M.banner ? "Out of letters!! better luck next time" : "Hanged!! better luck next time");
      $("end").hidden = false;
      // Reply in the chat without giving the word away to anyone who hasn't played yet.
      $("sendBack").onclick = () => share(won
        ? `Guessed ${from === "Someone" ? "your" : from + "'s"} ${M.thing} with ${wrong} wrong guess${wrong === 1 ? "" : "es"} ✅ Your turn:`
        : `${from === "Someone" ? "Your" : from + "'s"} ${M.thing} beat me 😩 Can you get it?`, location.href, "copied2");
    }
    function press(letter) {
      if (g.over()) return;
      const k = document.querySelector(`.key[data-k="${letter}"]`);
      if (!k || k.disabled) return;
      const hit = g.guess(letter);
      k.disabled = true; k.classList.add(hit ? "hit" : "miss");
      if (!hit && navigator.vibrate) navigator.vibrate(30);
      render();
    }
    $("keys").addEventListener("click", (e) => { const k = e.target.closest(".key"); if (k) press(k.dataset.k); });
    document.addEventListener("keydown", (e) => { if (/^[a-z]$/i.test(e.key) && !e.metaKey && !e.ctrlKey) press(e.key.toUpperCase()); });
    render();
  }

  $("own").addEventListener("click", () => {
    history.replaceState(null, "", location.pathname);
    $("play").hidden = true; $("make").hidden = false; setMode("h"); $("secret").focus();
  });

  const o = decode(location.hash.slice(1));
  if (o) play(o);
  else {
    $("make").hidden = false;
    try { $("from").value = localStorage.getItem("lp.from") || ""; } catch {}
    setMode("h");
  }
})();
