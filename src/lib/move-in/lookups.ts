// What a file's words are matched against: this year's classes and sections,
// the designations and departments in HR Settings. Pure helpers take these
// lists so they can be tested without a database.

import { classKey, distance, plain, splitClassSection } from "./tidy";
import { classSection } from "@/lib/class-name";

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
  /** Subjects and teachers ("Asha Rao (T-001)"), for the Academic Management sheets' drop-downs. */
  subjects?: string[];
  teachers?: string[];
};

/** "Asha Rao (T-001)": a teacher as the ready sheet's drop-down writes one, read back by the Academic Management imports. */
export const teacherOption = (s: { fullName: string; staffCode: string | null }) => (s.staffCode ? `${s.fullName} (${s.staffCode})` : s.fullName);

export const sectionLabel = (s: { className: string; sectionName: string }) => classSection(s.className, s.sectionName);

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
// Layman loop 5 (15 Nov): "PET" was tidied into Teacher although Physical Education Teacher exists, and
// "Tr." was offered as Transport Supervisor. Short forms point to one designation only, the specific one first.
const DESIGNATION_WORDS: [RegExp, string][] = [
  [/^(pet|pt|pti|pe teacher|pet teacher|pt teacher|physical education|physical education teacher|physical teacher|sports teacher|games teacher|physical director|pd)$/i, "Physical Education Teacher"],
  [/^(tr|tchr|tch|pgt|tgt|prt|ntt|asst ?teacher|assistant teacher|teacher|primary teacher|subject teacher|class teacher|.* teacher|trained graduate teacher|post graduate teacher|faculty|mistress|master)$/i, "Teacher"],
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
  const words = kind === "designation" ? DESIGNATION_WORDS : DEPARTMENT_WORDS;
  const bare = v.replace(/[.]/g, "").trim();
  for (const [re, name] of words) {
    // The first pattern that fits decides: a word is never passed on to a more general one.
    if (re.test(bare)) return options.find((x) => plain(x) === plain(name)) ?? null;
  }
  return null;
}

/** Short forms of department names in old files: only to a department the school has. */
const DEPARTMENT_WORDS: [RegExp, string][] = [
  [/^(maths?|mathematics|mat|mths)$/i, "Mathematics"],
  [/^(sci|science|gen science|general science)$/i, "Science"],
  [/^(eng|engl|english)$/i, "English"],
  [/^(sst|soc|social|social science|social studies|ss)$/i, "Social Studies"],
  [/^(cs|comp|computer|computers|computer science|it|ict)$/i, "Computer Science"],
  [/^(pe|pt|sports|games|physical education)$/i, "Physical Education"],
  [/^(hin|hindi)$/i, "Hindi"],
  [/^(tel|telugu)$/i, "Telugu"],
  [/^(admin|administration|office)$/i, "Administration"],
];

/** Words that may be meant, offered on screen but never chosen for the person. */
export function suggestOptions(options: string[], raw: string): string[] {
  const v = plain(raw);
  return options
    // A start of a name counts only from three letters ("Tr" is not Transport Supervisor).
    .map((o) => ({ o, d: v.length >= 3 && (plain(o).startsWith(v) || v.startsWith(plain(o))) ? 0 : distance(v, plain(o)) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(v.length / 3)))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map((x) => x.o);
}
