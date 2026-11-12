// The One-campus guard (owner decision 2026-11-12). Audit runs 2 and 3 kept
// finding pages where a person kept to one campus saw another campus's
// records, because each query wrote the campus filter by hand. This test reads
// every server file and finds each LIST read (findMany, count, groupBy,
// aggregate) of a record type that belongs to a campus (src/lib/campus-scope.ts)
// whose `where` neither
//   - names the campus (campusWhere, inCampus, studentInCampus, a campusId
//     key, or a where-variable / helper in the same file or the imported
//     module that does), nor
//   - is pinned to records already chosen (an id, studentId, sectionId...
//     key, or a student/section/staff link), nor
//   - has a "// campus: <why>" note on one of the two lines above it (for
//     reads that are rightly whole-school, or filtered by campus right after).
// Every such read must be in tests/campus-guard-baseline.txt, the reviewed
// list left from before the guard, which may only shrink. A new read that
// skips the campus fails here: use campusWhere(model, who) from
// src/lib/campus-scope.ts, or add a "// campus:" note saying why not.
//
// The second part checks campusWhere itself against the database: every
// campus-bearing record type gets a filter PostgreSQL accepts, and a
// two-campus school's North person reads North's students and dues only.
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { campusFilter, campusWay, campusWhere, isCampusBearing } from "@/lib/campus-scope";
import { makeSchool } from "./helpers";

const ROOT = path.resolve(__dirname, "..");
const BASELINE = path.join(ROOT, "tests", "campus-guard-baseline.txt");

// Parts of the software no one-campus school person reaches: the DREAM TEAM
// console and the software's own jobs; parents see their own children only.
const OUTSIDE = /^src\/(lib\/console|app\/console|app\/api\/cron|lib\/jobs|app\/\(parent\)|app\/parent|app\/\(public\))\//;
const MARK = /[cC]ampus/;
// Keys that do not pin a read to records already chosen.
const LOOSE_KEYS = new Set(["schoolId", "academicYearId", "campusId", "termId", "examId"]);

/** Record types (prisma client names) a campus owns through a person, a section or a class. */
function guardedModels(): Set<string> {
  const out = new Set<string>();
  for (const m of Prisma.dmmf.datamodel.models) {
    const w = campusWay(m.name);
    if (!w) continue;
    // Records kept to a campus only through another record (their academic year, a
    // session's login) are matched by the year a page shows (each campus's own year).
    if (w.kind === "link" && w.steps.length && !["Student", "Staff", "SchoolClass"].includes(w.target)) continue;
    out.add(m.name[0].toLowerCase() + m.name.slice(1));
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** The text inside the bracket that starts at `start` (just after the opening one). */
function inside(t: string, start: number): string {
  let i = start;
  let depth = 1;
  while (i < t.length && depth) {
    const c = t[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") depth--;
    i++;
  }
  return t.slice(start, i - 1);
}

const fileText = new Map<string, string | null>();
function read(file: string): string | null {
  if (!fileText.has(file)) fileText.set(file, fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null);
  return fileText.get(file)!;
}

/** The module file an import names (@/ and relative paths). */
function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(ROOT, "src", spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base + ".ts", base + ".tsx", path.join(base, "index.ts")]) if (fs.existsSync(c)) return c;
  return null;
}

const CALL = /\b([a-zA-Z_]\w*)\s*\(/g;
const NOT_HELPERS = new Set(["if", "for", "while", "switch", "return", "await", "new", "Promise", "Map", "Set", "Number", "String", "Boolean", "BigInt", "Date", "Array", "Object", "Math", "JSON", "map", "filter", "some", "every", "find", "slice", "includes", "push", "join", "split", "trim", "all", "then", "catch", "test", "replace", "startsWith", "toLowerCase", "has", "get", "set"]);
const named = new Map<string, boolean>();

/** Does the definition of `id` (a const or a function, here or in the module it is imported from, or a helper it calls) name the campus? */
function definitionNamesCampus(file: string, t: string, id: string, depth = 0): boolean {
  if (depth > 5 || NOT_HELPERS.has(id)) return false;
  const memo = `${file}|${id}`;
  if (named.has(memo)) return named.get(memo)!;
  named.set(memo, false);
  const bodies: string[] = [];
  for (const d of t.matchAll(new RegExp(`(?:const|let|var)\\s+${id}\\b[^=\\n]*=`, "g"))) {
    const seg = t.slice(d.index, d.index + 1500);
    const end = seg.search(/;\s*\n/);
    bodies.push(end > 0 ? seg.slice(0, end) : seg);
  }
  for (const d of t.matchAll(new RegExp(`function\\s+${id}\\b`, "g"))) {
    const seg = t.slice(d.index, d.index + 4000);
    const end = seg.indexOf("\n}");
    bodies.push(end > 0 ? seg.slice(0, end) : seg);
  }
  // A parameter whose type names the campus (`sc: LibCampusScope`).
  for (const d of t.matchAll(new RegExp(`[(,]\\s*${id}\\??\\s*:\\s*([^,)=;]+)`, "g"))) bodies.push(d[1]);
  let yes = bodies.some((b) => MARK.test(b));
  if (!yes) {
    // The helpers it calls, and the values it is built from (`...(mine ? { studentId: { in: mine } } : {})`).
    const calls = new Set(bodies.flatMap((b) => [...b.matchAll(CALL)].map((c) => c[1])).filter((c) => c !== id));
    const values = new Set(bodies.flatMap((b) => [...b.slice(b.indexOf("=") + 1).matchAll(/\b([a-zA-Z_]\w*)\b/g)].map((c) => c[1]))
      .filter((v) => v !== id && !calls.has(v) && new RegExp(`(?:const|let)\\s+${v}\\b`).test(t)));
    yes = [...calls, ...values].some((c) => definitionNamesCampus(file, t, c, depth + 1));
  }
  if (!yes) {
    for (const imp of t.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"([^"]+)"/g)) {
      const names = imp[1].split(",").map((s) => s.trim().split(/\s+as\s+/));
      const hit = names.find((n) => (n[1] ?? n[0]) === id);
      if (!hit) continue;
      const target = resolveImport(file, imp[2]);
      const tt = target ? read(target) : null;
      if (tt && definitionNamesCampus(target!, tt, hit[0], depth + 1)) { yes = true; break; }
    }
  }
  named.set(memo, yes);
  return yes;
}

type Finding = { file: string; line: number; key: string };

/** Every list read of a guarded record type that shows no campus filter. */
function scan(): Finding[] {
  const models = guardedModels();
  const found: Finding[] = [];
  for (const abs of walk(path.join(ROOT, "src"))) {
    const file = path.relative(ROOT, abs).replace(/\\/g, "/");
    if (OUTSIDE.test(file)) continue;
    const t = read(abs)!;
    const lines = t.split("\n");
    for (const m of t.matchAll(/\b\w+\.(\w+)\.(findMany|count|groupBy|aggregate)\(/g)) {
      if (!models.has(m[1])) continue;
      const arg = inside(t, m.index! + m[0].length);
      if (MARK.test(arg)) continue;
      const keys = [...arg.matchAll(/\b(id|[a-z][A-Za-z]*Id)\b\s*[:,}]/g)].map((k) => k[1]).filter((k) => !LOOSE_KEYS.has(k));
      if (keys.length || /\b(student|section|staff|schoolClass|enrolment|due|payment|parent)\s*:\s*\{/.test(arg)) continue;
      // Values the where is built from: spreads, `where: x`, items of `AND: [x, ...]`, `x.part`.
      const ids = new Set([...arg.matchAll(/(?:\.\.\.|where:\s*|\[\s*|,\s*)\(?([a-zA-Z_]\w*)(?=\s*[,\]}.)?])/g)].map((x) => x[1]));
      for (const x of arg.matchAll(/(?:\.\.\.|where:\s*)\(?([a-zA-Z_]\w*)/g)) ids.add(x[1]);
      if (/\bwhere\s*[,}]/.test(arg) || /^\s*where\s*$/.test(arg)) ids.add("where");
      for (const call of arg.matchAll(/\b([a-zA-Z_]\w*)\s*\(/g)) ids.add(call[1]);
      if ([...ids].some((id) => definitionNamesCampus(abs, t, id))) continue;
      const line = t.slice(0, m.index).split("\n").length;
      if (lines.slice(Math.max(0, line - 3), line - 1).some((l) => /\/\/\s*campus:/.test(l))) continue;
      found.push({ file, line, key: `${file} | ${m[1]}.${m[2]} | ${arg.replace(/\s+/g, " ").trim().slice(0, 200)}`.trimEnd() });
    }
  }
  return found;
}

function baseline(): Map<string, number> {
  const out = new Map<string, number>();
  if (!fs.existsSync(BASELINE)) return out;
  for (const raw of fs.readFileSync(BASELINE, "utf8").split("\n")) {
    const l = raw.trimEnd();
    if (!l || l.startsWith("#")) continue;
    out.set(l, (out.get(l) ?? 0) + 1);
  }
  return out;
}

describe("One-campus guard: list reads of campus records name the campus", () => {
  const found = scan();
  const allowed = baseline();

  it("finds the reads it is meant to find (the guard itself works)", () => {
    expect(guardedModels().has("student")).toBe(true);
    expect(guardedModels().has("studentFeeDue")).toBe(true);
    expect(guardedModels().has("bookIssue")).toBe(true);
    expect(guardedModels().has("feeHead")).toBe(false);
    expect(found.length).toBeGreaterThan(0);
  });

  it("no new list read of a campus record skips the campus filter", () => {
    if (process.env.CAMPUS_GUARD_WRITE === "1") {
      const head = fs.readFileSync(BASELINE, "utf8").split("\n").filter((l) => l.startsWith("#")).join("\n");
      fs.writeFileSync(BASELINE, `${head}\n${found.map((f) => f.key).sort().join("\n")}\n`);
      return;
    }
    const left = new Map(allowed);
    const fresh: string[] = [];
    for (const f of found) {
      const n = left.get(f.key) ?? 0;
      if (n > 0) left.set(f.key, n - 1);
      else fresh.push(`${f.file}:${f.line}  ${f.key.split(" | ").slice(1).join(" | ")}`);
    }
    expect(fresh, "List reads with no campus filter. Use campusWhere(model, who) from src/lib/campus-scope.ts, or add a '// campus: <why>' note above the read").toEqual([]);
  });

  it("the reviewed list only shrinks: entries that are fixed are taken off it", () => {
    if (process.env.CAMPUS_GUARD_WRITE === "1") return;
    const seen = new Map<string, number>();
    for (const f of found) seen.set(f.key, (seen.get(f.key) ?? 0) + 1);
    const stale = [...allowed].filter(([k, n]) => (seen.get(k) ?? 0) < n).map(([k]) => k);
    expect(stale, "Remove these lines from tests/campus-guard-baseline.txt").toEqual([]);
  });
});

describe("campusWhere: one campus filter for every record type", () => {
  let ctx: SchoolContext;
  let north: string;
  let main: string;

  beforeAll(async () => {
    const school = await makeSchool("Campus Guard School");
    ctx = { schoolId: school.id, userId: null };
    main = school.campus.id;
    north = await withSchool(ctx, async (tx: Tx) => (await tx.campus.create({ data: { schoolId: ctx.schoolId, name: "North" } })).id);
  });

  it("works out the campus way for the record types the audits named", () => {
    expect(campusWhere("Student", { campusId: "c" })).toEqual({ campusId: "c" });
    expect(() => campusWhere("StudentFeeDue", { campusId: "c" })).toThrow(/campusFilter/);
    expect(campusWay("BookIssue")).toEqual({ kind: "ids", columns: [{ field: "studentId", of: "Student", optional: true }, { field: "sectionId", of: "Section", optional: true }, { field: "staffId", of: "Staff", optional: true }] });
    // Payment holds only a student id (no relation), so it needs the database-backed filter.
    expect(() => campusWhere("Payment", { campusId: "c" })).toThrow(/campusFilter/);
    expect(campusWhere("Student", { campusId: null })).toEqual({});
    // A PTM note always names its student: the student's campus decides, not the teacher's.
    expect(campusWay("PtmMeetingNote")).toEqual({ kind: "ids", columns: [{ field: "studentId", of: "Student", optional: false }] });
    expect(isCampusBearing("FeeHead")).toBe(false);
    expect(() => campusWhere("FeeHead", { campusId: "c" })).toThrow(/whole school/);
  });

  it("gives a filter the database accepts for every campus-bearing record type", async () => {
    const names = Prisma.dmmf.datamodel.models.map((m) => m.name).filter(isCampusBearing);
    expect(names.length).toBeGreaterThan(100);
    const bad: string[] = [];
    await withSchool(ctx, async (tx) => {
      for (const name of names) {
        const client = (tx as unknown as Record<string, { count: (a: unknown) => Promise<number> }>)[name[0].toLowerCase() + name.slice(1)];
        try {
          await client.count({ where: await campusFilter(tx, name as Prisma.ModelName, { campusId: north }) });
        } catch (e) {
          bad.push(`${name}: ${(e as Error).message.split("\n").slice(-3).join(" ")}`);
        }
      }
    }, { timeout: 120_000 });
    expect(bad).toEqual([]);
  }, 180_000);

  it("a North person reads North's students and their dues only", async () => {
    await withSchool(ctx, async (tx) => {
      const mk = (campusId: string, n: string) => tx.student.create({ data: { schoolId: ctx.schoolId, campusId, admissionNo: n, firstName: "Guard", lastName: n, fullName: `Guard ${n}`, status: "ALUMNI" } });
      const a = await mk(main, "G-MAIN-1");
      const b = await mk(north, "G-NORTH-1");
      const seen = await tx.student.findMany({ where: { ...campusWhere("Student", { campusId: north }), id: { in: [a.id, b.id] } }, select: { id: true } });
      expect(seen.map((s) => s.id)).toEqual([b.id]);
      const all = await tx.student.findMany({ where: { ...campusWhere("Student", { campusId: null }), id: { in: [a.id, b.id] } } });
      expect(all).toHaveLength(2);
      expect(await campusFilter(tx, "StudentFeeDue", { campusId: north })).toEqual({ studentId: { in: [b.id] } });
      expect(await campusFilter(tx, "StudentFeeDue", { campusId: null })).toEqual({});
      const bookFilter = await campusFilter(tx, "BookIssue", { campusId: north });
      expect(bookFilter).toEqual({ OR: [{ studentId: { in: [b.id] } }, { sectionId: { in: [] } }, { staffId: { in: [] } }, { studentId: null, sectionId: null, staffId: null }] });
    });
  });
});
