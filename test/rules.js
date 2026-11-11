// Today's surprise test — kept identical to the app (SurpriseTest.swift): same word lists,
// same random numbers (mulberry32), same order of draws, so everyone gets the same five
// questions on the same day, app or browser.
(function (root) {
  const SPELLINGS = [
    ["necessary", "neccessary"], ["separate", "seperate"], ["beautiful", "beautifull"], ["receive", "recieve"],
    ["tomorrow", "tommorow"], ["friend", "freind"], ["believe", "beleive"], ["Wednesday", "Wensday"],
    ["February", "Febuary"], ["library", "libary"], ["calendar", "calender"], ["definitely", "definately"],
    ["address", "adress"], ["government", "goverment"], ["embarrass", "embarass"], ["environment", "enviroment"],
    ["knowledge", "knowlege"], ["restaurant", "restaraunt"], ["rhythm", "rythm"], ["science", "sciense"],
    ["weird", "wierd"], ["until", "untill"], ["beginning", "begining"], ["committee", "commitee"],
    ["occasion", "ocassion"], ["tongue", "tounge"], ["guard", "gaurd"], ["grammar", "grammer"],
    ["disappear", "dissapear"], ["vegetable", "vegtable"],
  ];
  const SCRAMBLES = [
    ["animal", ["TIGER", "HORSE", "CAMEL", "ZEBRA", "MONKEY", "RABBIT", "PARROT", "DONKEY", "SNAKE", "EAGLE"]],
    ["fruit", ["MANGO", "APPLE", "GRAPE", "LEMON", "GUAVA", "PAPAYA", "BANANA", "CHERRY", "ORANGE", "MELON"]],
    ["in class", ["CHALK", "PENCIL", "ERASER", "RULER", "SCHOOL", "LESSON", "TEACHER", "BOARD", "MARKS", "DUSTER"]],
  ];
  const MARKS_EACH = 2, MAX = 10;

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
  }

  // Days since 1 Nov 2026 on this phone's own calendar (changes at local midnight).
  function dayFor(date) {
    const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.max(0, Math.round((today - Date.UTC(2026, 10, 1)) / 86400000));
  }

  function make(day) {
    const next = mulberry32((day * 2654435761 + 12345) >>> 0);
    const int = (n) => next() % n;
    const a = 3 + int(10), b = 3 + int(10);
    const start = 2 + int(30), step = 2 + int(9), missing = 1 + int(3);
    const terms = [0, 1, 2, 3].map((k) => start + k * step);
    const picks = [];
    while (picks.length < 4) { const i = int(SPELLINGS.length); if (!picks.includes(i)) picks.push(i); }
    const wrong = int(4);
    const words = picks.map((i, k) => (k === wrong ? SPELLINGS[i][1] : SPELLINGS[i][0]));
    const group = SCRAMBLES[int(SCRAMBLES.length)];
    const word = group[1][int(group[1].length)];
    const letters = word.split("");
    for (let i = letters.length - 1; i > 0; i--) { const j = int(i + 1); [letters[i], letters[j]] = [letters[j], letters[i]]; }
    if (letters.join("") === word) letters.push(letters.shift());
    let x = 20 + int(80), y = 10 + int(90);
    const minus = int(2) === 1;
    if (minus && y > x) [x, y] = [y, x];
    const q = [
      { kind: "times", prompt: `${a} × ${b} =`, answer: String(a * b), number: true },
      { kind: "sequence", prompt: "Fill the gap: " + terms.map((t, k) => (k === missing ? "___" : t)).join(", "),
        answer: String(terms[missing]), number: true },
      { kind: "misspelt", prompt: "Circle the word that's spelt wrong:", words, wrong, answer: words[wrong] },
      { kind: "unscramble", prompt: `Unscramble: ${letters.join("")} (${group[0]})`, answer: word },
      { kind: "sum", prompt: `${x} ${minus ? "−" : "+"} ${y} =`, answer: String(minus ? x - y : x + y), number: true },
    ];
    return { number: day + 1, questions: q };
  }

  function isRight(q, given) {
    const g = String(given).trim().toUpperCase();
    if (q.kind === "misspelt") return g === String(q.wrong);
    return g !== "" && g === q.answer.toUpperCase();
  }

  function remark(marks) {
    if (marks === MAX) return "Excellent!! ⭐";
    if (marks >= 8) return "Very good";
    if (marks >= 6) return "Good, but careless";
    if (marks >= 4) return "Work harder";
    return "See me after class!!";
  }

  root.SurpriseTest = { make, dayFor, isRight, remark, MARKS_EACH, MAX };
  if (typeof module !== "undefined") module.exports = root.SurpriseTest;
})(typeof window !== "undefined" ? window : globalThis);
