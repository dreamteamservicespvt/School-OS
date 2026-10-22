// What a restore test checks (08-platform-security.md §4 "Proven"; §16 Done
// when 3), as plain functions so they can be tested without a database.

/** Rows per table per school: counts[table][schoolId] = rows. */
export type Counts = Record<string, Record<string, number>>;

export type RestoreProblem = { kind: "rows" | "file" | "restore" | "migrations"; text: string };

/**
 * Compares the restored copy with the live database counted just before and
 * just after the dump. Where nothing changed in between, the copy must match
 * exactly; where the school was busy, it must fall between the two counts.
 */
export function compareCounts(before: Counts, after: Counts, restored: Counts): { problems: RestoreProblem[]; busy: number } {
  const problems: RestoreProblem[] = [];
  let busy = 0;
  const tables = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const table of [...tables].sort()) {
    const schools = new Set([...Object.keys(before[table] ?? {}), ...Object.keys(after[table] ?? {}), ...Object.keys(restored[table] ?? {})]);
    for (const school of schools) {
      const b = before[table]?.[school] ?? 0;
      const a = after[table]?.[school] ?? 0;
      const r = restored[table]?.[school] ?? 0;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      if (a !== b) busy++;
      if (r < lo || r > hi) problems.push({ kind: "rows", text: `${table}: school ${school} has ${r} rows in the copy, ${b === a ? b : `${lo} to ${hi}`} in the live database` });
    }
  }
  return { problems, busy };
}

/** Rows per school, added up over every table, for the report. */
export function perSchool(counts: Counts): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bySchool of Object.values(counts)) for (const [s, n] of Object.entries(bySchool)) out[s] = (out[s] ?? 0) + n;
  return out;
}

export type FileCheck = { schoolId: string; storageKey: string; sha256: string | null };
export type FileOutcome = "ok" | "missing" | "changed";

/** Checks one file a restored record points to against the bytes found in the backup. */
export function checkFile(expectedSha: string | null, foundSha: string | null): FileOutcome {
  if (foundSha === null) return "missing";
  if (expectedSha && expectedSha !== foundSha) return "changed";
  return "ok";
}
