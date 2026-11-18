// Hangman rules, kept identical to the app (Hangman.swift). Hangman: 6 wrong guesses
// (head, body, two arms, two legs), optional hint. Bollywood / Hollywood: the vowels come
// filled in and each wrong guess crosses off a letter of the banner word (9 chances).
(function (root) {
  const MODES = {
    h: { title: "hangman", banner: null, given: "", chances: 6, thing: "word" },
    b: { title: "Bollywood", banner: "BOLLYWOOD", given: "AEIOU", chances: 9, thing: "film" },
    y: { title: "Hollywood", banner: "HOLLYWOOD", given: "AEIOU", chances: 9, thing: "film" },
  };
  // A–Z, 0–9 and single spaces (accents dropped). Numbers ("3 IDIOTS") are shown from the start.
  const cleanWord = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "").split(" ").filter(Boolean).join(" ").slice(0, 40);

  function game(word, mode) {
    const m = MODES[mode] || MODES.h;
    const w = cleanWord(word);
    const given = new Set(m.given);
    const guessed = new Set();
    const known = (c) => guessed.has(c) || given.has(c);
    const letters = () => [...w].filter((c) => /[A-Z]/.test(c));
    return {
      word: w, mode: m, given, guessed,
      wrong: () => [...guessed].filter((c) => !w.includes(c)).length,
      won: () => letters().every(known),
      lost() { return this.wrong() >= m.chances; },
      over() { return this.won() || this.lost(); },
      revealed: () => [...w].map((c) => (c === " " || /[0-9]/.test(c) || known(c) ? c : null)),
      // True if the letter is in the word. Repeats, given letters and guesses after the end are ignored.
      guess(letter) {
        const l = letter.toUpperCase();
        if (this.over() || !/^[A-Z]$/.test(l) || known(l)) return w.includes(l);
        guessed.add(l);
        return w.includes(l);
      },
    };
  }
  root.Hangman = { MODES, cleanWord, game };
  if (typeof module !== "undefined") module.exports = root.Hangman;
})(typeof window !== "undefined" ? window : globalThis);
