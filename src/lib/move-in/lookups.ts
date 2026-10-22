// What a file's words are matched against: this year's classes and sections,
// the designations and departments in HR Settings. Pure helpers take these
// lists so they can be tested without a database.

import { classKey, distance, plain, splitClassSection } from "./tidy";

export type SectionOption = { id: string; className: string; sectionName: string; key: string | null };
export type Lookups = {
  sections: SectionOption[];
  designations: string[];
  departments: string[];
  /** Fee heads (Fee Structure) and expense heads (Finance Settings), for the money sheets' drop-downs. */
  feeHeads?: string[];
  expenseHeads?: string[];
  /** Staff leave types with a balance (HR Settings), for the leave balances sheet. */
  leaveTypes?: string[];
};

export const sectionLabel = (s: { className: string; sectionName: string }) => `${s.className} ${s.sectionName}`;

/** The section a class and section written in a file point to, or null. */
export function findSection(sections: SectionOption[], rawClass: string, rawSection: string): SectionOption | null {
  let cls = rawClass.trim();
  let sec = rawSection.trim();
  if (!cls) return null;
  if (!sec || plain(sec) === plain(cls)) {
    const split = splitClassSection(cls);
    if (split) { cls = split.className; sec = split.sectionName; }
    else sec = "";
  }
  const key = classKey(cls);
  const sameClass = sections.filter((s) => plain(s.className) === plain(cls) || (key !== null && s.key === key));
  if (!sameClass.length) return null;
  if (!sec) return sameClass.length === 1 ? sameClass[0] : null;
  return sameClass.find((s) => plain(s.sectionName) === plain(sec)) ?? null;
}

/** Up to three sections that a class and section in a file may have meant. */
export function suggestSections(sections: SectionOption[], rawClass: string, rawSection: string): SectionOption[] {
  const split = !rawSection.trim() ? splitClassSection(rawClass) : null;
  const cls = split?.className ?? rawClass;
  const sec = split?.sectionName ?? rawSection;
  const key = classKey(cls);
  const scored = sections.map((s) => {
    const classScore = key !== null && s.key === key ? 0 : Math.min(distance(plain(cls), plain(s.className)), 6) + 2;
    const secScore = sec ? (plain(sec) === plain(s.sectionName) ? 0 : 1 + Math.min(distance(plain(sec), plain(s.sectionName)), 3)) : 1;
    return { s, score: classScore * 4 + secScore };
  });
  return scored.filter((x) => x.score < 20).sort((a, b) => a.score - b.score).slice(0, 3).map((x) => x.s);
}

/** Words old files use for the designations School OS starts with (HR Settings). */
const DESIGNATION_WORDS: [RegExp, string][] = [
  [/^(pgt|tgt|prt|ntt|pet|pti|asst ?teacher|assistant teacher|teacher|primary teacher|subject teacher|class teacher|.* teacher|trained graduate teacher|post graduate teacher|faculty|mistress|master)$/i, "Teacher"],
  [/^(lecturer|.* lecturer|junior lecturer|senior lecturer)$/i, "Lecturer"],
  [/^(vp|vice principal|vice-principal|dy principal|deputy principal)$/i, "Vice Principal"],
  [/^(accountant|accounts|accounts officer|accounts assistant)$/i, "Accountant"],
  [/^(cashier|cashier cum accountant)$/i, "Cashier-cum-Accountant"],
  [/^(driver|bus driver|van driver)$/i, "Driver"],
  [/^(security|guard|security guard|watchman|chowkidar|gatekeeper)$/i, "Security"],
  [/^(sweeper|cleaner|housekeeping|maid|aaya|ayah|safai karamchari)$/i, "Housekeeping"],
  [/^(peon|attendant|helper|support staff|office boy|mts|multi tasking staff|conductor|bus attendant)$/i, "Support Staff"],
  [/^(coordinator|academic coordinator|.* coordinator)$/i, "Coordinator"],
  [/^(hr|hr manager|hr executive)$/i, "HR Manager"],
];

/** The option a word in a file points to: the same word, or a known other name for it. */
export function findOption(options: string[], raw: string, kind: "designation" | "department"): string | null {
  const v = raw.trim().replace(/\s+/g, " ");
  if (!v) return null;
  const same = options.find((o) => plain(o) === plain(v));
  if (same) return same;
  if (kind === "designation") {
    for (const [re, name] of DESIGNATION_WORDS) {
      if (re.test(v.replace(/[.]/g, ""))) { const o = options.find((x) => x === name); if (o) return o; }
    }
  }
  return null;
}

export function suggestOptions(options: string[], raw: string): string[] {
  const v = plain(raw);
  return options
    .map((o) => ({ o, d: plain(o).startsWith(v) || v.startsWith(plain(o)) ? 0 : distance(v, plain(o)) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(v.length / 3)))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.o);
}
