// Grade scales (08 §6, 04-data-model.md rule 15): bands with a grade, a
// whole-number from and to percentage, points, a remark and whether the grade
// passes. A scale has no gaps and no overlaps. Pure functions, used by the
// browser preview and the server alike.

export type Band = { grade: string; from: number; to: number; points: number | null; remark: string; passing: boolean };

export type ScalePreset = { key: string; name: string; about: string; bands: Band[] };

const b = (grade: string, from: number, to: number, points: number | null, remark: string, passing = true): Band => ({ grade, from, to, points, remark, passing });

/** Ready-made scales the school can import and change (08 §6). */
export const PRESETS: readonly ScalePreset[] = [
  {
    key: "cbse", name: "CBSE 9-point", about: "A1 to E, with grade points, as CBSE uses for classes 9 and 10.",
    bands: [
      b("A1", 91, 100, 10, "Outstanding"), b("A2", 81, 90, 9, "Excellent"), b("B1", 71, 80, 8, "Very good"), b("B2", 61, 70, 7, "Good"),
      b("C1", 51, 60, 6, "Above average"), b("C2", 41, 50, 5, "Average"), b("D", 33, 40, 4, "Pass"), b("E", 0, 32, null, "Needs improvement", false),
    ],
  },
  {
    key: "icse", name: "ICSE", about: "Grades 1 to 9 as ICSE reports them, 1 being the best.",
    bands: [
      b("1", 90, 100, 9, "Excellent"), b("2", 80, 89, 8, "Very good"), b("3", 70, 79, 7, "Very good"), b("4", 60, 69, 6, "Good"),
      b("5", 50, 59, 5, "Credit"), b("6", 40, 49, 4, "Credit"), b("7", 33, 39, 3, "Pass"), b("8", 20, 32, null, "Fail", false), b("9", 0, 19, null, "Fail", false),
    ],
  },
  {
    key: "state", name: "State Board", about: "A1 to D2 with points, as many state boards use (Telangana SSC style).",
    bands: [
      b("A1", 91, 100, 10, "Excellent"), b("A2", 81, 90, 9, "Very good"), b("B1", 71, 80, 8, "Good"), b("B2", 61, 70, 7, "Above average"),
      b("C1", 51, 60, 6, "Average"), b("C2", 41, 50, 5, "Below average"), b("D1", 35, 40, 4, "Pass"), b("D2", 0, 34, null, "Fail", false),
    ],
  },
];

export function presetBands(key: string): Band[] | null {
  const p = PRESETS.find((x) => x.key === key);
  return p ? p.bands.map((x) => ({ ...x })) : null;
}

/** Reads saved bands safely. */
export function readBands(raw: unknown): Band[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
    .map((x) => ({
      grade: String(x.grade ?? ""),
      from: Number(x.from),
      to: Number(x.to),
      points: x.points === null || x.points === undefined || x.points === "" ? null : Number(x.points),
      remark: String(x.remark ?? ""),
      passing: x.passing !== false,
    }));
}

const pct = (n: number) => `${n}%`;

/**
 * Checks a scale: every grade named once, whole numbers from 0 to 100, and
 * the bands meet with no gap and no overlap (rule 15). Returns the problem in
 * plain words, as 08 §5 says it, or null when the scale is right.
 */
export function checkBands(bands: Band[]): string | null {
  if (bands.length < 2) return "A grade scale needs at least 2 grades.";
  if (bands.length > 20) return "A grade scale can have at most 20 grades.";
  const names = new Set<string>();
  for (const x of bands) {
    const g = x.grade.trim();
    if (!g) return "Every band needs a grade, such as A1.";
    if (g.length > 10) return `Grade ${g} is too long. Use at most 10 characters.`;
    if (names.has(g.toLowerCase())) return `Grade ${g} is used twice. Each grade can be used once.`;
    names.add(g.toLowerCase());
    if (!Number.isInteger(x.from) || !Number.isInteger(x.to)) return `${g}: use whole-number percentages, such as 81 to 90.`;
    if (x.from < 0 || x.to > 100) return `${g}: percentages must be between 0 and 100.`;
    if (x.from > x.to) return `${g} starts at ${pct(x.from)} but ends at ${pct(x.to)}. The start must not be above the end.`;
    if (x.points !== null && (!Number.isFinite(x.points) || x.points < 0 || x.points > 100)) return `${g}: points must be a number between 0 and 100.`;
    if (x.remark.length > 60) return `${g}: the remark can be at most 60 characters.`;
  }
  const sorted = [...bands].sort((p, q) => p.from - q.from || p.to - q.to);
  for (let i = 1; i < sorted.length; i++) {
    const lower = sorted[i - 1];
    const upper = sorted[i];
    if (upper.from <= lower.to) {
      const shared = Math.max(upper.from, lower.from);
      return `${pct(shared)} falls in two grades (${lower.grade} and ${upper.grade}). Fix the ranges.`;
    }
    if (upper.from > lower.to + 1) return `${lower.grade} ends at ${pct(lower.to)} but ${upper.grade} starts at ${pct(upper.from)}. Fix the ranges so no percentage is left out.`;
  }
  if (sorted[0].from !== 0) return `The lowest grade, ${sorted[0].grade}, starts at ${pct(sorted[0].from)}. It must start at 0%.`;
  const top = sorted[sorted.length - 1];
  if (top.to !== 100) return `The highest grade, ${top.grade}, ends at ${pct(top.to)}. It must end at 100%.`;
  return null;
}

/** Best grade first. */
export function sortBands(bands: Band[]): Band[] {
  return [...bands].sort((p, q) => q.from - p.from);
}

/**
 * The band a percentage falls in. Bands use whole numbers, so 90.6% is in
 * the band that holds 90 (the part after the point does not lift a grade).
 */
export function bandFor(percent: number, bands: Band[]): Band | null {
  if (!Number.isFinite(percent)) return null;
  const p = Math.max(0, Math.min(100, Math.floor(percent + 1e-9)));
  return bands.find((x) => p >= x.from && p <= x.to) ?? null;
}
