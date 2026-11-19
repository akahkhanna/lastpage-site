// Playing the computer ("the phone") in the browser: noughts & crosses, book cricket, dots &
// boxes and hangman / Bollywood / Hollywood. The games are the same ones used in live rooms
// (room.js, live.js); here the room is a pretend one, and the other player is a small brain that
// answers in the same messages a friend's phone would send. Its play follows the app's phone
// (NoughtsCrosses.swift, DotsBoxes.swift on medium): it never misses its own win, now and then
// plays carelessly, and in dots & boxes avoids handing over boxes.
(function (root) {
  const P = root.Play, H = root.Hangman;
  const BOT = "THE PHONE";
  const later = (f, ms) => setTimeout(f, ms);
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

  // ---------- noughts & crosses (the phone is ✗, you start the first round) ----------
  function noughtsBrain(say) {
    let b = ".........", starter = "t";
    const put = (s, i, m) => s.slice(0, i) + m + s.slice(i + 1);
    const free = (s) => [...s].map((c, i) => (c === "." ? i : -1)).filter((i) => i >= 0);
    const winner = (s) => { const w = P.winLine(s); return w ? s[w[0]] : null; };
    function minimax(s, toMove, me, depth) {
      const w = winner(s);
      if (w) return w === me ? 10 - depth : depth - 10;
      if (!s.includes(".")) return 0;
      const next = toMove === "t" ? "x" : "t";
      const scores = free(s).map((i) => minimax(put(s, i, toMove), next, me, depth + 1));
      return toMove === me ? Math.max(...scores) : Math.min(...scores);
    }
    function choose() {
      const me = "x", them = "t", f = free(b);
      const wins = f.filter((i) => winner(put(b, i, me)) === me);
      if (wins.length) return pickOne(wins);
      if (Math.random() < 0.15) return pickOne(f);   // a careless one, so it can be beaten
      let best = [], top = -Infinity;
      for (const i of f) { const sc = minimax(put(b, i, me), them, me, 1); if (sc > top) { top = sc; best = [i]; } else if (sc === top) best.push(i); }
      return pickOne(best);
    }
    function maybeMove() {
      if (P.ncOver(b) || P.toMove(b, starter) !== "x") return;
      later(() => { const i = choose(); b = put(b, i, "x"); say({ mark: { _0: i } }); }, 550);
    }
    return {
      hear(m) {
        if (m.mark) { b = put(b, m.mark._0, P.toMove(b, starter)); maybeMove(); }
        else if (m.again) { starter = starter === "t" ? "x" : "t"; b = "........."; maybeMove(); }
      },
    };
  }

  // ---------- book cricket (you bat first, then the phone chases) ----------
  function cricketBrain(say) {
    let p = [], batting = false;
    const page = () => (Math.floor(Math.random() * 100) + 1) * 2;
    function chase() {
      batting = true;
      const q = [], target = P.innings(p).runs + 1;
      say({ chase: {} });
      const next = () => {
        if (P.innings(q, target).over) return;
        const pg = page(); q.push(pg); say({ page: { _0: pg } });
        later(next, 900);
      };
      later(next, 900);
    }
    return {
      hear(m) {
        if (m.page && !batting) { p.push(m.page._0); if (P.innings(p).over) later(chase, 1200); }
      },
    };
  }

  // ---------- dots & boxes, 4 boxes a side (you go first in the first round) ----------
  function dotsBrain(say) {
    const N = 4, total = 2 * N * (N + 1);
    let lines = {}, toMove = "first", starter = "first";
    const key = (a, r, c) => `${a ? 1 : 0}:${r}:${c}`;
    const has = (a, r, c) => !!lines[key(a, r, c)];
    const sides = (r, c) => [has(1, r, c), has(1, r + 1, c), has(0, r, c), has(0, r, c + 1)].filter(Boolean).length;
    const beside = (a, r, c) => a ? [[r - 1, c], [r, c]].filter(([br]) => br >= 0 && br < N) : [[r, c - 1], [r, c]].filter(([, bc]) => bc >= 0 && bc < N);
    const freeEdges = () => {
      const out = [];
      for (let r = 0; r <= N; r++) for (let c = 0; c < N; c++) if (!has(1, r, c)) out.push([1, r, c]);
      for (let r = 0; r < N; r++) for (let c = 0; c <= N; c++) if (!has(0, r, c)) out.push([0, r, c]);
      return out;
    };
    function play(a, r, c) {
      lines[key(a, r, c)] = toMove;
      const closed = beside(a, r, c).filter(([br, bc]) => sides(br, bc) === 4).length;
      if (!closed) toMove = toMove === "first" ? "second" : "first";
    }
    function choose() {
      const free = freeEdges();
      const closing = free.filter(([a, r, c]) => beside(a, r, c).some(([br, bc]) => sides(br, bc) === 3));
      if (closing.length && Math.random() >= 0.1) return pickOne(closing);
      if (Math.random() < 0.2) return pickOne(free);
      const gifts = ([a, r, c]) => beside(a, r, c).filter(([br, bc]) => sides(br, bc) === 2).length;
      const fewest = Math.min(...free.map(gifts));
      return pickOne(free.filter((e) => gifts(e) === fewest));
    }
    function maybeMove() {
      if (Object.keys(lines).length === total || toMove !== "second") return;
      later(() => {
        const [a, r, c] = choose();
        play(a, r, c);
        say({ line: { across: !!a, row: r, col: c } });
        maybeMove();   // took a box: goes again
      }, 600);
    }
    return {
      hear(m) {
        if (m.line) { play(m.line.across ? 1 : 0, m.line.row, m.line.col); maybeMove(); }
        else if (m.again) { starter = starter === "first" ? "second" : "first"; lines = {}; toMove = starter; maybeMove(); }
      },
    };
  }

  // ---------- hangman / Bollywood / Hollywood: the phone sets one, then guesses yours ----------
  const WORDS = [
    ["animal", ["ELEPHANT", "GIRAFFE", "MONKEY", "TIGER", "PARROT", "RABBIT", "DOLPHIN", "PENGUIN", "ZEBRA", "KANGAROO"]],
    ["fruit", ["MANGO", "BANANA", "ORANGE", "PAPAYA", "CHERRY", "GRAPES", "LEMON", "PINEAPPLE", "WATERMELON"]],
    ["thing", ["PENCIL", "UMBRELLA", "BICYCLE", "KITE", "CANDLE", "BALLOON", "TORCH", "LADDER", "BUCKET"]],
    ["food", ["SAMOSA", "JALEBI", "KULFI", "PAKORA", "BIRYANI", "DOSA", "IDLI", "LADOO", "PARATHA", "PANCAKE", "WAFFLE", "POPCORN"]],
    ["school", ["TIFFIN", "CHALK", "DUSTER", "MONITOR", "SHARPENER", "PRINCIPAL", "UNIFORM", "ASSEMBLY", "RECESS", "DETENTION"]],
    ["city", ["MUMBAI", "DELHI", "CHENNAI", "KOLKATA", "JAIPUR", "LONDON", "BOSTON", "CHICAGO"]],
  ];
  const FILMS = {
    b: ["SHOLAY", "DEEWAAR", "LAGAAN", "DEVDAS", "DANGAL", "BARFI", "QUEEN", "KAHAANI", "ANDHADHUN", "SWADES", "TAARE ZAMEEN PAR",
        "CHAK DE INDIA", "MOTHER INDIA", "DIL CHAHTA HAI", "RANG DE BASANTI", "KUCH KUCH HOTA HAI", "HUM AAPKE HAIN KOUN", "MOHABBATEIN",
        "KABHI KHUSHI KABHIE GHAM", "ZINDAGI NA MILEGI DOBARA", "DILWALE DULHANIA LE JAYENGE", "ANDAZ APNA APNA", "JO JEETA WOHI SIKANDAR",
        "HERA PHERI", "GOLMAAL", "KARAN ARJUN", "BAAZIGAR", "BORDER", "GADAR", "KOI MIL GAYA", "KRRISH", "DHOOM", "ANAND", "PATHAAN", "JAWAN", "3 IDIOTS"],
    y: ["TITANIC", "JAWS", "ROCKY", "GREASE", "ALIEN", "AVATAR", "FROZEN", "SHREK", "TOY STORY", "JURASSIC PARK", "HOME ALONE",
        "BACK TO THE FUTURE", "THE LION KING", "STAR WARS", "GHOSTBUSTERS", "GLADIATOR", "INCEPTION", "THE MATRIX", "FINDING NEMO",
        "CASABLANCA", "BATMAN", "SUPERMAN", "JUMANJI", "MARY POPPINS", "THE GODFATHER", "FORREST GUMP", "TOP GUN", "BEETLEJUICE", "HOOK", "THE WIZARD OF OZ"],
  };
  // Letters in the order a person tends to try them (vowels first when they aren't given).
  // Numbers come last: few titles have one.
  const ORDER = { h: "EAIOTRNSLCUDPMHGBYFKWVXZJQ1234567890", b: "RNHTDLKSMGBYJPCVWFZXQ1234567890", y: "RTNSLHDGMCBPKWYFVJXZQ1234567890" };

  function hangmanBrain(say, mode) {
    let phoneSets = true, mirror = null, used = new Set();
    function setOne() {
      if (mode === "h") { const [cat, words] = pickOne(WORDS); say({ secret: { word: pickOne(words), hint: cat } }); }
      else say({ secret: { word: pickOne(FILMS[mode]), hint: null } });
    }
    function guessNext() {
      if (!mirror || mirror.over()) return;
      let left = [...ORDER[mode]].filter((L) => !used.has(L) && !mirror.given.has(L));
      if (!left.length) return;
      // A one-character word still blank ("_ IDIOTS", "RACE _") is most likely a number.
      const words = mirror.revealed().map((c) => c ?? "_").join("").split(" ");
      if (words.some((w) => w === "_")) left = [..."2314567890"].filter((L) => left.includes(L)).concat(left.filter((L) => !/[0-9]/.test(L)));
      // Mostly the likely letter, sometimes a hunch, so it isn't unbeatable.
      const letters = left.filter((c) => /[A-Z]/.test(c));
      const L = /[0-9]/.test(left[0]) || !letters.length || Math.random() >= 0.25 ? left[0] : pickOne(letters);
      used.add(L); mirror.guess(L); say({ guess: { _0: L } });
      later(guessNext, 1000);
    }
    later(setOne, 500);
    return {
      hear(m) {
        if (m.secret && !phoneSets) { mirror = H.game(m.secret.word, mode); used = new Set(); later(guessNext, 1200); }
        else if (m.again) { phoneSets = !phoneSets; mirror = null; if (phoneSets) later(setOne, 500); }
      },
    };
  }

  // ---------- the pretend room ----------
  // You are always the one in charge except in hangman, where the phone sets the first word.
  let current = 0;
  function start(el, kind, name, restart) {
    let onMessage = null;
    const game = ++current;   // a new game silences the old one, whose phone may still be mid-move
    const say = (m) => game === current && onMessage && onMessage(m, BOT);
    const hangMode = kind === "bollywood" ? "b" : kind === "hollywood" ? "y" : kind === "hangman" ? "h" : null;
    const brain = kind === "noughtsCrosses" ? noughtsBrain(say) : kind === "bookCricket" ? cricketBrain(say)
      : kind === "dotsBoxes" ? dotsBrain(say) : hangMode ? hangmanBrain(say, hangMode) : null;
    if (!brain) { el.innerHTML = `<p class="status">This one needs friends: invite them instead.</p>`; return; }
    const ctx = {
      me: name, host: hangMode ? BOT : name, members: [name, BOT], name,
      them: () => BOT, note: () => {}, ended() {}, restart,
      on(message) { onMessage = message; },
      send(m) { setTimeout(() => game === current && brain.hear(m), 0); },
    };
    const games = Object.assign({}, root.Room.games, root.Live);
    games[kind](el, ctx);
  }
  root.Solo = { start, BOT };
})(window);
