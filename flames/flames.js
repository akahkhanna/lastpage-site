// The FLAMES page: opened from a link it replays the sender's working stroke by stroke,
// then lets you send it on or try your own. Names live only in the part of the link
// after "#", which browsers never send to the server.
(function () {
  const $ = (id) => document.getElementById(id);
  const APP = "https://apps.apple.com/app/id6831963769";
  let skip = false;

  // Names <-> link: base64url of "first\nsecond", so they aren't plain in chat previews.
  function encode(a, b) {
    const bytes = new TextEncoder().encode(a + "\n" + b);
    let bin = ""; bytes.forEach((x) => (bin += String.fromCharCode(x)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decode(s) {
    try {
      const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
      const text = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
      const [a, b] = text.split("\n");
      return a && b && a.length <= 40 && b.length <= 40 ? [a, b] : null;
    } catch { return null; }
  }
  const clean = (s) => s.replace(/\s+/g, " ").trim().slice(0, 24);
  const linkFor = (a, b) => location.origin + location.pathname + "#" + encode(a, b);

  const pause = (s) => (skip ? Promise.resolve() : new Promise((r) => setTimeout(r, s * 1000)));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function letters(el, text, extra) {
    el.textContent = "";
    return Flames.chars(text.toUpperCase()).map((ch, i) => {
      const s = document.createElement("span");
      s.className = "l";
      s.textContent = ch === " " ? " " : ch;
      if (extra) extra(s, i);
      el.appendChild(s);
      return s;
    });
  }

  async function work(a, b) {
    skip = reduceMotion;
    $("form").hidden = true; $("after").hidden = true;
    $("working").hidden = false; $("skip").hidden = false;
    const r = Flames.play(a, b);
    const A = letters($("nameA"), a), B = letters($("nameB"), b);
    const count = $("count"), answer = $("answer"), reaction = $("reaction");
    [count, answer, reaction].forEach((e) => e.classList.remove("on"));
    $("flames").textContent = "";

    // 1. Both names, letter by letter.
    for (const s of A) { s.classList.add("on"); await pause(0.06); }
    await pause(0.15);
    for (const s of B) { s.classList.add("on"); await pause(0.06); }
    await pause(0.35);
    // 2. Shared letters struck off in pairs.
    for (const [i, j] of r.pairs) {
      A[i].classList.add("struck"); await pause(0.15);
      B[j].classList.add("struck"); await pause(0.3);
    }
    // 3. The count.
    count.textContent = "= " + r.count; count.classList.add("on");
    await pause(0.5);

    if (r.answer) {
      // 4. F L A M E S, then 5. count round crossing one off at a time.
      const F = letters($("flames"), "FLAMES", (s) => { const n = document.createElement("span"); n.className = "n"; s.appendChild(n); });
      F.forEach((s, k) => (s.dataset.letter = Flames.LETTERS[k]));
      for (const s of F) { s.classList.add("on"); await pause(0.08); }
      await pause(0.35);
      const hop = Math.min(0.11, 1.1 / Math.max(r.count, 1));
      let alive = Flames.LETTERS.slice(), position = 0;
      const el = (letter) => F[Flames.LETTERS.indexOf(letter)];
      for (const [order, letter] of r.crossedOut.entries()) {
        for (let step = 0; step < r.count; step++) {
          if (step > 0) position = (position + 1) % alive.length;
          F.forEach((s) => s.classList.remove("here"));
          if (!skip) el(alive[position]).classList.add("here");
          await pause(hop);
        }
        F.forEach((s) => s.classList.remove("here"));
        alive.splice(position, 1);
        if (position === alive.length) position = 0;
        const s = el(letter);
        s.querySelector(".n").textContent = order + 1;
        s.classList.add("struck");
        if (navigator.vibrate && !skip) navigator.vibrate(8);
        await pause(0.4);
      }
      // 6. Loop round the one that's left.
      const s = el(r.answer);
      s.insertAdjacentHTML("beforeend", '<svg class="loop" viewBox="0 0 100 100" preserveAspectRatio="none"><path pathLength="100" d="M50 4 C82 2 98 26 96 52 C94 80 72 98 46 96 C20 94 2 74 4 48 C6 22 26 6 56 6"/></svg>');
      setTimeout(() => s.querySelector(".loop").classList.add("on"), 30);
      await pause(0.55);
      answer.textContent = Flames.MEANING[r.answer] + "!!";
      reaction.textContent = Flames.REACTION[r.answer];
    } else {
      answer.textContent = "same letters!! try again";
    }
    answer.classList.add("on"); reaction.classList.add("on");
    $("skip").hidden = true;
    $("after").hidden = false;
    $("send").dataset.a = a; $("send").dataset.b = b;
  }

  $("working").addEventListener("click", () => (skip = true));

  // Send it on: the phone's share sheet where there is one (WhatsApp etc.), else copy.
  $("send").addEventListener("click", async () => {
    const { a, b } = $("send").dataset;
    const url = linkFor(a, b);
    const text = `I did FLAMES with ${clean(b).toUpperCase()}… open it 😏`;
    if (navigator.share) {
      try { await navigator.share({ title: "FLAMES", text, url }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text + " " + url); } catch { prompt("Copy this link:", url); return; }
    $("copied").hidden = false; setTimeout(() => ($("copied").hidden = true), 2500);
  });

  function showForm(prefillFirst) {
    $("working").hidden = true; $("after").hidden = true; $("form").hidden = false;
    $("intro").textContent = "write two names and see what you get";
    $("first").value = prefillFirst || ""; $("second").value = "";
    update(); ($("first").value ? $("second") : $("first")).focus();
  }
  const update = () => ($("go").disabled = !(/\p{L}/u.test($("first").value) && /\p{L}/u.test($("second").value)));
  ["first", "second"].forEach((id) => $(id).addEventListener("input", update));
  $("first").addEventListener("keydown", (e) => { if (e.key === "Enter") $("second").focus(); });
  $("second").addEventListener("keydown", (e) => { if (e.key === "Enter" && !$("go").disabled) $("go").click(); });
  $("go").addEventListener("click", () => {
    const a = clean($("first").value), b = clean($("second").value);
    history.replaceState(null, "", "#" + encode(a, b));
    $("intro").textContent = "";
    work(a, b);
  });
  // Your turn: the person it was sent to is usually the second name, so start with theirs.
  $("again").addEventListener("click", () => {
    history.replaceState(null, "", location.pathname);
    showForm($("send").dataset.b);
  });

  const names = decode(location.hash.slice(1));
  if (names) {
    $("intro").textContent = "someone did FLAMES with your name…";
    setTimeout(() => work(clean(names[0]), clean(names[1])), 600);
  } else {
    showForm("");
  }
})();
