// Registries filled by a module's own file (gap list G01): a page, action or
// job that reads one must load every file that registers in it, through its
// own imports, or a server that has just started finds the list short (an
// undo that "cannot be undone", an import kind or Parent Link section that is
// missing). This reads the source and follows each file's top-level imports.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "src");
const rel = (f: string) => path.relative(root, f).replace(/\\/g, "/");

function walk(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(src);
const text = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(src, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const p = base + ext;
    if (text.has(p)) return p;
  }
  return null;
}

/** Files this one loads when it runs: top-level imports and re-exports, but not `import type` (erased) or import() (loaded later). */
const depCache = new Map<string, string[]>();
function deps(file: string): string[] {
  const hit = depCache.get(file);
  if (hit) return hit;
  const out: string[] = [];
  const re = /^\s*(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
  for (const m of (text.get(file) ?? "").matchAll(re)) {
    if (m[4]) {
      const r = resolve(file, m[4]);
      if (r) out.push(r);
      continue;
    }
    if (m[1]) continue;
    const names = /^\{([^}]*)\}$/s.exec(m[2] ?? "");
    if (names && names[1].split(",").map((s) => s.trim()).filter(Boolean).every((s) => s.startsWith("type "))) continue;
    const r = resolve(file, m[3]);
    if (r) out.push(r);
  }
  depCache.set(file, out);
  return out;
}
function loads(entry: string): Set<string> {
  const seen = new Set([entry]);
  const stack = [entry];
  while (stack.length) {
    for (const d of deps(stack.pop()!)) {
      if (seen.has(d)) continue;
      seen.add(d);
      stack.push(d);
    }
  }
  return seen;
}

const having = (re: RegExp) => files.filter((f) => re.test(text.get(f)!));

/** Each registry: the files that add to it, and the files that read it (besides the registry's own file). */
const REGISTRIES: { name: string; registry: string; adds: RegExp; reads: RegExp }[] = [
  { name: "Undo (registerUndo)", registry: "src/lib/undo.ts", adds: /\bregisterUndo\(\s*"/, reads: /\brunUndo\(/ },
  { name: "background jobs and schedules (defineJob, defineSchedule)", registry: "src/lib/jobs.ts", adds: /\bdefine(Job|Schedule)\(\s*[A-Z_"]/, reads: /\b(runDueJobs|queueSchedules)\(/ },
  { name: "import kinds, the full list (defineImport)", registry: "src/lib/importer.ts", adds: /\bdefineImport(<[^>]*>)?\(/, reads: /\bimportKinds\(/ },
  { name: "gateway confirmations (onGatewayEvent)", registry: "src/lib/payments/events.ts", adds: /\bonGatewayEvent\(/, reads: /\brunGatewayEvent\(/ },
  { name: "Parent Link sections (registerSection)", registry: "src/lib/parent-link/sections.ts", adds: /\bregisterSection(<[^>]*>)?\(\s*\{/, reads: /\b(allSections|shownSections|sectionSwitches)\(/ },
  { name: "Student Profile tabs (registerProfileTab)", registry: "src/lib/students/profile-tabs.ts", adds: /\bregisterProfileTab\(\s*\{/, reads: /\bprofileTabsFor\(/ },
  { name: "leaving clearance checks (registerClearanceCheck)", registry: "src/lib/students/clearance.ts", adds: /\bregisterClearanceCheck\(\s*"/, reads: /\b(runClearanceChecks|clearanceCheckNames)\(/ },
  { name: "fee plan on enrolment (onEnrolled)", registry: "src/lib/students/hooks.ts", adds: /\bonEnrolled\(\s*async/, reads: /\b(runEnrolled|feePlanApplies)\(/ },
  { name: "report card attendance (registerAttendanceSource)", registry: "src/lib/exams/attendance.ts", adds: /\bregisterAttendanceSource\(\s*\(/, reads: /\battendanceFor\(tx/ },
  { name: "Parent Link on guardian screens (registerParentLink)", registry: "src/lib/students/guardians.ts", adds: /\bregisterParentLink\(\s*[a-z]/, reads: /\b(parentLinkProvider|parentLinkStatus)\(/ },
];

describe("every place that reads a registry loads every file that adds to it", () => {
  for (const r of REGISTRIES) {
    it(r.name, () => {
      const own = path.join(root, r.registry);
      const adders = having(r.adds).filter((f) => f !== own);
      const readers = having(r.reads).filter((f) => f !== own && !adders.includes(f));
      expect(adders.length, "files that add to it").toBeGreaterThan(0);
      expect(readers.length, "files that read it").toBeGreaterThan(0);
      const gaps = readers.flatMap((reader) => {
        const loaded = loads(reader);
        return adders.filter((a) => !loaded.has(a)).map((a) => `${rel(reader)} does not load ${rel(a)}`);
      });
      expect(gaps).toEqual([]);
    });
  }

  it("approval follow-ups: every module's list is in src/lib/approval-handlers.ts, which decide() loads itself", () => {
    const list = path.join(src, "lib", "approval-handlers.ts");
    const listed = new Set(deps(list));
    const modules = having(/^export const followUps\b/m);
    expect(modules.length).toBeGreaterThan(10);
    expect(modules.filter((f) => !listed.has(f)).map(rel)).toEqual([]);
    const approvals = text.get(path.join(src, "lib", "approvals.ts"))!;
    expect(approvals).toMatch(/await import\("\.\/approval-handlers"\)/);
    // Nothing registers follow-ups as a side effect any more.
    expect(having(/\bonDecision\(\s*"/).map(rel)).toEqual([]);
  });

  it("student facts (G20): every module's sources are in src/lib/students/fact-sources.ts, which hooks.ts loads itself", () => {
    const list = path.join(src, "lib", "students", "fact-sources.ts");
    const listed = new Set(deps(list));
    // Each module that gives Student Management facts exports them from its student-facts file.
    const modules = having(/^export const (promotionFacts|listFacts|yearActivity|studentsWithDues)\b/m);
    expect(modules.map(rel).sort()).toEqual(["src/lib/attendance/student-facts.ts", "src/lib/exams/student-facts.ts", "src/lib/fees/student-facts.ts"]);
    expect(modules.filter((f) => !listed.has(f)).map(rel)).toEqual([]);
    const hooks = text.get(path.join(src, "lib", "students", "hooks.ts"))!;
    expect(hooks).toMatch(/import\("\.\/fact-sources"\)/);
    // Nothing registers facts as a side effect any more.
    expect(having(/\bregister(PromotionFacts|YearActivity|ListFacts|FeeFilter)\(/).map(rel)).toEqual([]);
  });
});
