// A role's permissions in plain words, for Add Staff step 2 (09 §2: "The
// role's permissions are shown in plain words").
import { MODULES, type ModuleKey } from "../modules";
import type { AccessLevel } from "../roles";

const LEVEL_WORDS: Record<AccessLevel, string> = {
  full: "everything",
  view: "can look, not change",
  own: "their own records or classes",
  none: "no access",
};

export const LEVEL_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "full", label: "Full" },
  { value: "view", label: "View only" },
  { value: "own", label: "Own only" },
  { value: "none", label: "No access" },
];

export function levelWords(level: AccessLevel) {
  return LEVEL_WORDS[level];
}

/** "Fee Management: everything. Student Management: can look, not change." Only modules the role opens. */
export function roleLines(perms: Partial<Record<ModuleKey, AccessLevel>>) {
  return MODULES.filter((m) => (perms[m.key] ?? "none") !== "none").map((m) => ({ module: m.name, key: m.key, level: perms[m.key]!, words: LEVEL_WORDS[perms[m.key]!] }));
}

const RANK: Record<AccessLevel, number> = { none: 0, own: 1, view: 2, full: 3 };

/** The widest level the chosen roles give for each module. */
export function combineLevels(roles: Partial<Record<ModuleKey, AccessLevel>>[]): Record<ModuleKey, AccessLevel> {
  return Object.fromEntries(MODULES.map((m) => {
    let best: AccessLevel = "none";
    for (const r of roles) {
      const l = r[m.key] ?? "none";
      if (RANK[l] > RANK[best] || (l === "view" && best === "own")) best = l;
    }
    return [m.key, best];
  })) as Record<ModuleKey, AccessLevel>;
}

/** Personal exceptions that give more than the roles do (09 §5: "2 extra permissions beyond the Teacher role"). */
export function extraPermissions(base: Record<ModuleKey, AccessLevel>, exceptions: Record<string, AccessLevel>) {
  return Object.entries(exceptions).filter(([k, l]) => k in base && RANK[l] > RANK[base[k as ModuleKey]]).map(([k]) => k as ModuleKey);
}
