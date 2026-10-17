// Are two names written for the same person? Used when a file brought in
// from old software may hold a child or a parent already on record
// (workflow 15, "The same student is imported twice"). Pure, so the rules
// can be read and tested without a database.
//
// Names match when every word of the shorter name matches its own word of
// the longer one, in any order:
//   - the same word, ignoring capitals, dots and titles (Mr, Smt, Shri, Late...);
//   - the same word in another common spelling: Mohd / Md / Mohammad /
//     Muhammed, Laxmi / Lakshmi, Shrinivas / Srinivas, Seeta / Sita;
//   - one letter wrong, missing, extra or swapped in a word of 4 letters or more;
//   - an initial: "K. Ravi" matches "Kiran Ravi".
// At least one whole word must match, so initials alone never make a match.
// Twins have different names, so they never match each other.

import { oneEditApart } from "./find-rules";

const TITLES = new Set(["mr", "mrs", "ms", "miss", "smt", "shri", "shree", "sri", "dr", "late", "master", "kumari", "km", "kum", "sh", "mx"]);

/** The same word in its usual other spellings, written one way. */
const SAME_WORD: Record<string, string> = {
  md: "mohammed", mohd: "mohammed", mohamad: "mohammed", mohammad: "mohammed", muhammad: "mohammed", muhammed: "mohammed", mohamed: "mohammed", mohammed: "mohammed", mahammad: "mohammed",
  laxmi: "lakshmi", lakshmi: "lakshmi", luxmi: "lakshmi", lakhsmi: "lakshmi",
  syed: "sayed", sayyed: "sayed", sayyad: "sayed", saiyed: "sayed",
  sk: "shaik", shaikh: "shaik", sheikh: "shaik", shaik: "shaik", shek: "shaik",
};

/** Spelling differences that do not change how a name sounds: Shrinivas = Srinivas, Seeta = Sita, Thomas = Tomas. */
function sound(w: string): string {
  let s = SAME_WORD[w] ?? w;
  s = s.replace(/x/g, "ks").replace(/ph/g, "f").replace(/([kgcjtdpbs])h/g, "$1").replace(/w/g, "v").replace(/z/g, "j").replace(/q/g, "k").replace(/y$/, "i");
  s = s.replace(/ee/g, "i").replace(/oo/g, "u").replace(/ou/g, "u");
  s = s.replace(/(.)\1+/g, "$1");
  return s;
}

/** The words of a name, lower case, without titles and punctuation. */
export function nameWords(name: string): string[] {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter(Boolean).filter((w) => !TITLES.has(w));
}

function wordsAlike(a: string, b: string): "same" | "close" | "initial" | null {
  if (a === b) return "same";
  if (a.length === 1 || b.length === 1) {
    if (/\d/.test(a + b)) return null;
    return a[0] === b[0] ? "initial" : null;
  }
  if (/\d/.test(a + b)) return null;
  const sa = sound(a);
  const sb = sound(b);
  if (sa === sb) return "close";
  if (Math.min(sa.length, sb.length) >= 4 && oneEditApart(sa, sb)) return "close";
  return null;
}

export type NameLikeness = "same" | "close";

/**
 * How alike two names are: "same" (the same words, in any order, ignoring
 * capitals and titles), "close" (other spellings, a typo, initials, or one
 * name has fewer words), or null.
 */
export function namesAlike(a: string, b: string): NameLikeness | null {
  const x = nameWords(a);
  const y = nameWords(b);
  if (!x.length || !y.length) return null;
  if ([...x].sort().join(" ") === [...y].sort().join(" ")) return "same";
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  // Every word of the shorter name to its own word of the longer one; whole words first.
  const used = new Set<number>();
  let whole = 0;
  const order = [...short].sort((p, q) => q.length - p.length);
  for (const w of order) {
    let pick = -1;
    let kind: ReturnType<typeof wordsAlike> = null;
    for (let i = 0; i < long.length; i++) {
      if (used.has(i)) continue;
      const k = wordsAlike(w, long[i]);
      if (!k) continue;
      if (pick < 0 || rank(k) < rank(kind)) { pick = i; kind = k; }
      if (k === "same") break;
    }
    if (pick < 0) return null;
    used.add(pick);
    if (kind !== "initial") whole++;
  }
  return whole > 0 ? "close" : null;
}

const rank = (k: ReturnType<typeof wordsAlike>) => (k === "same" ? 0 : k === "close" ? 1 : 2);
