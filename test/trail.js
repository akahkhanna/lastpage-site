// Today's word trail — kept identical to the app (WordTrail.swift): same word lists, same
// random numbers (mulberry32), same order of draws.
(function (root) {
  const SIZE = 5, LENGTHS = [3, 4, 5, 6];
  const THEMES = [
    ["fruits", ["FIG", "PEAR", "KIWI", "PLUM", "LIME", "MANGO", "APPLE", "GRAPE", "LEMON", "GUAVA", "MELON",
                "BANANA", "CHERRY", "ORANGE", "PAPAYA"]],
    ["animals", ["CAT", "DOG", "COW", "PIG", "BAT", "OWL", "FOX", "YAK", "HEN", "LION", "BEAR", "GOAT", "DEER",
                 "FROG", "DUCK", "WOLF", "CRAB", "TIGER", "HORSE", "CAMEL", "ZEBRA", "SNAKE", "EAGLE", "SHEEP",
                 "MOUSE", "MONKEY", "RABBIT", "PARROT", "DONKEY", "TURTLE", "BEAVER"]],
    ["in class", ["PEN", "INK", "MAP", "BAG", "BUS", "DESK", "BOOK", "BELL", "QUIZ", "CHALK", "RULER", "BOARD",
                  "MARKS", "CLASS", "PAPER", "PENCIL", "ERASER", "SCHOOL", "LESSON", "DUSTER", "RECESS"]],
    ["colours", ["RED", "TAN", "BLUE", "PINK", "GOLD", "GREY", "GREEN", "BLACK", "WHITE", "BROWN", "CORAL",
                 "YELLOW", "ORANGE", "PURPLE", "SILVER", "MAROON"]],
    ["food", ["PIE", "JAM", "TEA", "BUN", "EGG", "RICE", "CAKE", "SOUP", "MILK", "DOSA", "NAAN", "BREAD", "PIZZA",
              "SALAD", "CANDY", "HONEY", "PASTA", "SAMOSA", "BUTTER", "CHEESE", "BURGER", "NOODLE", "COOKIE"]],
    ["sport", ["BAT", "NET", "RUN", "BALL", "GOAL", "KICK", "TEAM", "SWIM", "CHESS", "MATCH", "SCORE", "RUGBY",
               "PITCH", "TENNIS", "HOCKEY", "SOCCER", "WICKET", "BOWLER"]],
  ];
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), a | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return (t ^ (t >>> 14)) >>> 0;
    };
  }
  function neighbours(cell) {
    const r = Math.floor(cell / SIZE), c = cell % SIZE, out = [];
    if (r > 0) out.push(cell - SIZE);
    if (c < SIZE - 1) out.push(cell + 1);
    if (r < SIZE - 1) out.push(cell + SIZE);
    if (c > 0) out.push(cell - 1);
    return out;
  }
  function make(day) {
    const total = LENGTHS.reduce((a, b) => a + b, 0);
    let attempt = 0, path = [], next;
    while (true) {
      next = mulberry32((((day * 69069 + 4242) >>> 0) + Math.imul(attempt, 104729)) >>> 0);
      const int = (k) => next() % k;
      const visited = new Set();
      let cell = int(SIZE * SIZE);
      path = [cell]; visited.add(cell);
      while (path.length < total) {
        const options = neighbours(cell).filter((x) => !visited.has(x));
        if (!options.length) break;
        const onward = options.map((o) => neighbours(o).filter((x) => !visited.has(x) && x !== o).length);
        const fewest = Math.min(...onward);
        const best = options.map((_, i) => i).filter((i) => onward[i] === fewest);
        cell = options[best[int(best.length)]];
        path.push(cell); visited.add(cell);
      }
      attempt++;
      if (path.length === total) break;
    }
    const int = (k) => next() % k;
    const order = LENGTHS.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    const group = THEMES[int(THEMES.length)];
    const letters = new Array(SIZE * SIZE).fill(null);
    let placed = [], at = 0;
    for (const len of order) {
      const choices = group[1].filter((w) => w.length === len);
      const word = choices[int(choices.length)];
      const cells = path.slice(at, at + len);
      cells.forEach((c, k) => (letters[c] = word[k]));
      placed.push([word, cells]);
      at += len;
    }
    placed.sort((a, b) => a[0].length - b[0].length);
    return { number: day + 1, theme: group[0], letters, words: placed.map((p) => p[0]), paths: placed.map((p) => p[1]) };
  }
  root.WordTrail = { SIZE, make, neighbours };
  if (typeof module !== "undefined") module.exports = root.WordTrail;
})(typeof window !== "undefined" ? window : globalThis);
