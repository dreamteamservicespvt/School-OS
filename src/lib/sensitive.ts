// Sensitive fields per role (20-settings.md, "One role": "sensitive fields it may
// see (normal, restricted, highly restricted)"; 00-global.md §5; 05-roles.md,
// "Sensitive details are hidden"; gap list G45).
//
// - Restricted: Aadhaar and other ID numbers (APAAR, PEN), staff bank account
//   and PAN, a custody restriction note, and extra fields marked restricted.
// - Highly restricted: counselling cases and notes.
//
// A role the school has not set keeps what it had before, module by module:
// students' and applicants' ID numbers and restricted extra fields for the
// School Admin and the Principal; staff ID and bank details also for HR;
// counselling for the roles chosen in Student Settings (notes for the
// Counsellor). A School Admin may set a role's level in Settings, Users &
// Permissions, only up to what 05-roles.md allows that role (MOST_FOR_ROLE).
// A level is a limit and a grant at once: "Normal" hides every sensitive field
// from the role; "Restricted" shows restricted fields wherever the role can open
// the record; "Highly restricted" also lets the role see counselling where
// Student Settings gives it counselling. The same rule holds on screen, in
// exports, in Search and in AI answers, because every one of them reads these.

export const SENSITIVE_LEVELS = ["normal", "restricted", "highly-restricted"] as const;
export type SensitiveLevel = (typeof SENSITIVE_LEVELS)[number];

export const SENSITIVE_WORDS: Record<SensitiveLevel, { label: string; words: string }> = {
  normal: { label: "Normal", words: "No sensitive fields: ID numbers, bank details and counselling stay hidden." },
  restricted: { label: "Restricted", words: "Also Aadhaar and other ID numbers, staff bank account and PAN, custody notes and restricted extra fields, in the records this role can open." },
  "highly-restricted": { label: "Highly restricted", words: "Also counselling cases and notes, where Student Settings gives this role counselling." },
};

const RANK: Record<SensitiveLevel, number> = { normal: 0, restricted: 1, "highly-restricted": 2 };

export function isSensitiveLevel(v: unknown): v is SensitiveLevel {
  return typeof v === "string" && (SENSITIVE_LEVELS as readonly string[]).includes(v);
}

/**
 * The most a role may be given (05-roles.md). Gate Security sees a photo and the
 * pickup list, a Driver today's trips, a Student their own homework: nothing
 * sensitive. Counselling notes are for the Counsellor (the only template that
 * can see them), the Principal and the School Admin; the Accountant and Office
 * Staff never see them. A school's own roles may be given any level.
 */
const MOST_FOR_ROLE: Record<string, SensitiveLevel> = {
  "school-admin": "highly-restricted",
  principal: "highly-restricted",
  counsellor: "highly-restricted",
  "gate-security": "normal",
  driver: "normal",
  student: "normal",
};

/** The highest level this role may be set to. */
export function mostForRole(role: { key: string | null; kind?: string }): SensitiveLevel {
  if (role.kind === "CUSTOM" || role.key?.startsWith("custom-")) return "highly-restricted";
  return (role.key && MOST_FOR_ROLE[role.key]) || "restricted";
}

/** The levels a School Admin may choose for this role, lowest first. */
export function levelsForRole(role: { key: string | null; kind?: string }): SensitiveLevel[] {
  return SENSITIVE_LEVELS.filter((l) => RANK[l] <= RANK[mostForRole(role)]);
}

/** A role as the checks need it: its key, and the level the school set (null or missing: as before). */
export type SensitiveRole = { key: string | null; sensitive?: SensitiveLevel | null };

/**
 * Whether any of these roles sees restricted fields. `before` are the roles that
 * saw them in this module before a school set levels (for example School Admin
 * and Principal); a role with a level set follows its level instead.
 */
export function seesRestricted(roles: readonly SensitiveRole[], before: readonly string[]): boolean {
  return roles.some((r) => (r.sensitive ? RANK[r.sensitive] >= RANK.restricted : r.key !== null && before.includes(r.key)));
}

/**
 * Whether any of these roles sees a highly restricted part. `given` says whether
 * the module gives that role the part at all (Student Settings, counselling
 * roles); a role with a level set below highly restricted does not see it.
 */
export function seesHighlyRestricted(roles: readonly SensitiveRole[], given: (key: string) => boolean): boolean {
  return roles.some((r) => r.key !== null && given(r.key) && (!r.sensitive || r.sensitive === "highly-restricted"));
}

/** What a role sees while the school has not set its level ("As before"), in plain words. */
export function asBeforeWords(key: string | null): string {
  if (key === "school-admin" || key === "principal") return "ID numbers, staff bank details and restricted extra fields; counselling where Student Settings gives it.";
  if (key === "hr") return "Staff ID numbers, bank account and PAN; not students' ID numbers.";
  if (key === "counsellor") return "Counselling cases and notes; no ID numbers.";
  return "No sensitive fields, apart from counselling where Student Settings gives it.";
}

/** "Restricted", or "As before" for a role the school has not set. */
export function sensitiveLabel(level: string | null | undefined): string {
  return isSensitiveLevel(level) ? SENSITIVE_WORDS[level].label : "As before";
}

/** The choices for one role's sensitive fields on its page: "As before", then each level it may be given. */
export function sensitiveChoices(role: { key: string | null; kind?: string }): { value: string; label: string; words: string }[] {
  return [
    { value: "", label: "As before", words: asBeforeWords(role.key) },
    ...levelsForRole(role).map((l) => ({ value: l, label: SENSITIVE_WORDS[l].label, words: SENSITIVE_WORDS[l].words })),
  ];
}
