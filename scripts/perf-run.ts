// Times the busiest reads and saves at a real school's size, and counts the
// database queries each one sends (gap list G37). Fill the school first with
// scripts/perf-seed.ts.
//
//   npx tsx --conditions=react-server --env-file=.env scripts/perf-run.ts [school code, default SPS]
//
// Options (environment): RUNS=3 (each path this many times; the median is shown),
// ONLY=word (only paths whose name has it), OUT=file.json (each path's time,
// queries and a fingerprint of its result, so two versions of the code can be
// compared: the same fingerprint means the same answer), NOW=2026-10-22T05:30:00Z,
// SCHEDULES=0 (leave out the background schedules), REPORTS=0 (leave out the report catalogue),
// QUERIES=1 (the costliest kinds of query of each path).
//
// Saves (attendance, payroll, schedules) run inside a transaction that is
// rolled back, so the database is the same after a run and runs compare.
// Only for a worker's or measuring database, never the everyday school_os.
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const dbName = new URL(process.env.DATABASE_URL ?? "postgresql://x/none").pathname.slice(1);
if (!/_(w\d+|perf)(_test)?$/.test(dbName)) throw new Error(`Refusing to run on database "${dbName}": only a worker's or measuring database.`);

// The app's client with query events on (db.ts reuses globalThis.prisma when set).
let queries = 0;
let slow: { query: string; ms: number }[] = [];
const logged = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
logged.$on("query", (e) => {
  queries++;
  slow.push({ query: e.query, ms: e.duration });
});
(globalThis as { prisma?: PrismaClient }).prisma = logged;

const { prisma, withSchool } = await import("../src/lib/db");
type Tx = import("../src/lib/db").Tx;
await import("../src/lib/job-registry");
const { scheduleList } = await import("../src/lib/jobs");
const { accessIn, schoolsFor } = await import("../src/lib/auth/access");
const { menuModules } = await import("../src/lib/permissions");
const { buildHome } = await import("../src/lib/dashboard/compose");
const { todayFor } = await import("../src/lib/periods");
const { currentYear, yearsFor } = await import("../src/lib/academic/years");
const { personCampusId } = await import("../src/lib/campus");
const { getStudentSettings } = await import("../src/lib/students/settings");
const { abilities } = await import("../src/lib/students/access");
const { readListParams } = await import("../src/lib/list");
const { loadStudentList, LIST_FILTERS } = await import("../src/app/(school)/student-management/_lib/queries");
const { feeViewer } = await import("../src/lib/fees/access");
const { findStudents: findFeeStudents, mostOverdue } = await import("../src/lib/fees/find");
const { studentLedger } = await import("../src/lib/fees/ledger");
const { defaulterLists } = await import("../src/lib/fees/defaulters");
const { feeTiles, monthlyTrend, forecast, recentPayments } = await import("../src/lib/fees/dashboard");
const { attendanceAccess } = await import("../src/lib/attendance/access");
const { registerMonth } = await import("../src/lib/attendance/register");
const { saveClassAttendance, roster } = await import("../src/lib/attendance/marks");
const { runReport, reportsFor, readReportInput } = await import("../src/lib/attendance/reports");
const { attendanceFeatures } = await import("../src/lib/attendance/settings");
const { dayBookView } = await import("../src/lib/finance/daybook-view");
const { HISTORY_FILTERS, historyWhere, countsFor, senderNames } = await import("../src/lib/communication/history");
const { skipTake } = await import("../src/lib/list");
const { findStudents } = await import("../src/lib/students/find");
const { studentScope } = await import("../src/lib/students/access");
const { CATALOGUE } = await import("../src/lib/reports/catalogue");
const { runEntry, viewerOf } = await import("../src/lib/reports/run");
const { readFilters } = await import("../src/lib/reports/filters");
const { periodSetup } = await import("../src/lib/period-setup");
const { openRun, calculateRun } = await import("../src/lib/salary/payroll");
const { listFlags } = await import("../src/lib/reports/warnings");
const { reportAccess } = await import("../src/lib/reports/access");
type Current = import("../src/lib/current").Current;

const [code = "SPS"] = process.argv.slice(2);
const RUNS = Math.max(1, Number(process.env.RUNS ?? 3));
const ONLY = process.env.ONLY ?? "";
const NOW = new Date(process.env.NOW ?? "2026-10-22T05:30:00Z");

// The school, found through the Principal's own School Access (school rows are behind the wall).
const principalLogin = await prisma.userLogin.findFirstOrThrow({ where: { username: "principal" } });
const s = (await schoolsFor(principalLogin.id)).find((x) => x.code === code);
if (!s) throw new Error(`The principal login has no school ${code}`);
const schoolId = s.id;

async function viewerFor(username: string): Promise<Current> {
  const user = await prisma.userLogin.findFirstOrThrow({ where: { username } });
  const schools = await schoolsFor(user.id);
  const access = await accessIn(user.id, schoolId);
  if (!access) throw new Error(`${username} has no access to ${code}`);
  return { session: null, user, schools, ...access, ctx: { schoolId, userId: user.id }, menu: menuModules(access.permissions, access.modulesOn) } as unknown as Current;
}
const principal = await viewerFor("principal");
const accountant = await viewerFor("accountant");
const teacher = await viewerFor("teacher");
const tz = principal.school.timeZone;
const today = todayFor(tz, NOW);
const read = <T,>(c: Current, fn: (tx: Tx) => Promise<T>) => withSchool(c.ctx, fn, { timeout: 300_000 });
const ROLLBACK = Symbol("rollback");
/** Runs a save and rolls it back, so every run starts from the same data. */
async function rolledBack<T>(c: Current, fn: (tx: Tx) => Promise<T>): Promise<T> {
  let out: T | undefined;
  try {
    await withSchool(c.ctx, async (tx) => {
      out = await fn(tx);
      throw ROLLBACK;
    }, { timeout: 300_000 });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return out as T;
}

// Things the paths share.
const fixed = await read(principal, async (tx) => {
  const campusId = await personCampusId(tx, principal.ctx, principal);
  const year = await currentYear(tx, principal.ctx, campusId);
  const years = await yearsFor(tx, principal.ctx, principal.campusId);
  // The biggest section of the year, and a student who owes fees.
  const [big] = await tx.$queryRaw<{ section_id: string; n: bigint }[]>`SELECT section_id, count(*) n FROM enrolment WHERE academic_year_id = ${year!.id}::uuid AND archived_at IS NULL GROUP BY section_id ORDER BY n DESC, section_id LIMIT 1`;
  const owing = await tx.studentFeeDue.findFirst({ where: { state: "OPEN", balancePaise: { gt: 0 } }, orderBy: [{ dueDate: "asc" }, { id: "asc" }], select: { studentId: true } });
  const someone = await tx.student.findFirstOrThrow({ where: { archivedAt: null }, orderBy: { admissionNo: "asc" }, select: { firstName: true } });
  const runCampus = await tx.campus.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true } });
  // The last school day the section was marked: saving it again is a teacher re-saving the register.
  const marked = await tx.attendanceMark.findFirst({ where: { sectionId: big.section_id, studentId: { not: null }, date: { lte: today } }, orderBy: { date: "desc" }, select: { date: true } });
  return { campusId, year: year!, years, sectionId: big.section_id, sectionSize: Number(big.n), owingId: owing?.studentId ?? null, name: someone.firstName, runCampus: runCampus.id, markedDay: marked?.date ?? today };
});
console.log(`${s.name} in ${dbName}: today ${today.toISOString().slice(0, 10)}, year ${fixed.year.name}, biggest section ${fixed.sectionSize} students, ${RUNS} runs each`);

type Path = { name: string; run: () => Promise<unknown>; save?: boolean };
const paths: Path[] = [];
const add = (name: string, run: () => Promise<unknown>, save = false) => paths.push({ name, run, save });

// Dashboard (src/lib/dashboard/compose.ts).
add("Dashboard: Principal", () => buildHome(principal, { now: NOW }));
add("Dashboard: Accountant", () => buildHome(accountant, { now: NOW }));
add("Dashboard: Class teacher", () => buildHome(teacher, { now: NOW }));

// Student List (student-management/page.tsx): the first 25, a search, and "Has dues".
const studentList = (raw: Record<string, string>) => async () => {
  const settings = await read(principal, (tx) => getStudentSettings(tx, principal.ctx));
  const ab = abilities(principal, settings);
  const params = readListParams(raw, LIST_FILTERS);
  return read(principal, (tx) => loadStudentList(tx, principal, { params, yearId: fixed.years.map((y) => y.id), years: fixed.years, yearStart: fixed.year.startDate, settings, shown: 25, seeParents: ab.seeParents }));
};
add("Student List: first page", studentList({}));
add("Student List: search a name", studentList({ q: fixed.name }));
add("Student List: has dues", studentList({ fee: "dues" }));
add("Student List: sorted by name, 500 shown", async () => {
  const settings = await read(principal, (tx) => getStudentSettings(tx, principal.ctx));
  const params = readListParams({ sort: "name", dir: "asc" }, LIST_FILTERS);
  return read(principal, (tx) => loadStudentList(tx, principal, { params, yearId: fixed.years.map((y) => y.id), years: fixed.years, yearStart: fixed.year.startDate, settings, shown: 500, seeParents: true }));
});

// Fee Management.
const fv = () => read(accountant, (tx) => feeViewer(tx, accountant.ctx, accountant));
add("Collect Fee: search a name", async () => { const v = await fv(); return read(accountant, (tx) => findFeeStudents(tx, v, fixed.name, today, 8)); });
add("Collect Fee: search a phone", async () => { const v = await fv(); return read(accountant, (tx) => findFeeStudents(tx, v, "98765", today, 8)); });
add("Fee Ledger: most overdue", async () => { const v = await fv(); return read(accountant, (tx) => mostOverdue(tx, v, today, 10)); });
add("Fee Ledger: one student", async () => (fixed.owingId ? read(accountant, (tx) => studentLedger(tx, fixed.owingId!, today, tz)) : null));
add("Defaulters (page: all + filtered)", async () => {
  const v = await fv();
  return read(accountant, (tx) => defaulterLists(tx, accountant.ctx, v, today, [{}, { reminded: "no" }]));
});
add("Fee Dashboard reads", async () => {
  const v = await fv();
  return read(accountant, (tx) => Promise.all([feeTiles(tx, v, today), monthlyTrend(tx, fixed.year.startDate, fixed.year.endDate), forecast(tx, today), recentPayments(tx, v, {} as never, 25, 0)]));
});

// Attendance.
const aa = (c: Current) => read(c, (tx) => attendanceAccess(tx, c.ctx, c));
add("Attendance: register month", async () => read(principal, (tx) => registerMonth(tx, principal.ctx, { sectionId: fixed.sectionId, month: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), today })));
// Saving the register again for the last marked day: a few marks changed, and every mark changed.
const resave = (status: (i: number) => string) => async () => {
  const a = await aa(principal);
  return rolledBack(principal, async (tx) => {
    const list = await roster(tx, fixed.sectionId, fixed.year.id);
    const entries = list.map((st, i) => ({ studentId: st.studentId, statusKey: status(i) }));
    return saveClassAttendance(tx, principal.ctx, a, { sectionId: fixed.sectionId, date: fixed.markedDay, periodNo: 0, entries, now: NOW, timeZone: tz });
  });
};
add("Attendance: save a class again, a few changed", resave((i) => (i % 17 === 3 ? "absent" : "present")), true);
add("Attendance: save a class again, all changed", resave(() => "late"), true);
add("Attendance: every report", async () => {
  const a = await aa(principal);
  const features = await read(principal, (tx) => attendanceFeatures(tx, principal.ctx));
  const keys = reportsFor(a, features);
  const out: unknown[] = [];
  for (const k of keys) {
    const input = readReportInput((x) => (x === "report" ? k : null), today, keys);
    out.push(await read(principal, (tx) => runReport(tx, principal.ctx, a, input)).catch((e) => `failed: ${e instanceof Error ? e.message : e}`));
  }
  return out;
});

// Day Book (finance-management/day-book): one day and the whole month.
const fyOf = () => read(principal, (tx) => tx.financialYear.findFirstOrThrow({ where: { startDate: { lte: today }, endDate: { gte: today } } }));
add("Day Book: today", async () => read(principal, (tx) => dayBookView(tx, { from: today, to: today, classId: null, depositAccountId: null, waiting: false })));
add("Day Book: this month", async () => read(principal, (tx) => dayBookView(tx, { from: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)), to: today, classId: null, depositAccountId: null, waiting: false })));
add("Day Book: the financial year", async () => { const fy = await fyOf(); return read(principal, (tx) => dayBookView(tx, { from: fy.startDate, to: today, classId: null, depositAccountId: null, waiting: false })); });

// Message History (communication/history/page.tsx: its reads, full access).
add("Message History", async () => {
  const params = readListParams({}, HISTORY_FILTERS);
  const where = historyWhere(principal.ctx, true, params, tz);
  const mine = { schoolId };
  return read(principal, async (tx) => {
    const [rows, total, sentCount, reach, firstSent, testMode] = await Promise.all([
      tx.message.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(params) }),
      tx.message.count({ where }),
      tx.message.count({ where: { AND: [mine], status: { in: ["SENT", "QUEUED"] } } }),
      tx.messageRecipient.groupBy({ by: ["status", "provider"], where: { schoolId, isBackup: false, message: mine }, _count: { _all: true } }),
      tx.message.findFirst({ where: mine, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      tx.messageRecipient.count({ where: { schoolId, isBackup: false, provider: "sandbox", status: { in: ["SENT", "DELIVERED", "READ"] }, message: mine } }),
    ]);
    return { rows, total, sentCount, reach, firstSent, testMode, counts: await countsFor(tx, principal.ctx, rows.map((r) => r.id)), names: await senderNames(tx, rows.map((r) => r.sentById)) };
  });
});

// The Search box (api/v1/search): the student part, which carries the work.
add("Search box: a name", async () => read(principal, async (tx) => {
  const yearIds = fixed.years.map((y) => y.id);
  const scope = await studentScope(tx, principal, yearIds);
  return findStudents(tx, fixed.name.slice(0, 4), { scope, yearId: yearIds, statuses: "any", byParent: true, take: 6 });
}));
add("Search box: a phone", async () => read(principal, async (tx) => {
  const yearIds = fixed.years.map((y) => y.id);
  const scope = await studentScope(tx, principal, yearIds);
  return findStudents(tx, "98765", { scope, yearId: yearIds, statuses: "any", byParent: true, take: 6 });
}));

// Early Warnings page (its list of flags).
add("Early Warnings: list", async () => {
  const who = await read(principal, (tx) => viewerOf(tx, principal.user.id, schoolId));
  const a = reportAccess(who!);
  return read(principal, (tx) => listFlags(tx, who!, a, { status: "open", area: "all", q: "", raisedFrom: null, raisedTo: null } as never));
});

// Salary: open and work out this month's payroll (rolled back).
add("Payroll: generate the month", async () => rolledBack(principal, async (tx) => {
  // Next month's salary (this month's is already made in the demo).
  const run = await openRun(tx, principal.ctx, { campusId: fixed.runCampus, month: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)), today });
  return calculateRun(tx, principal.ctx, (run as { id: string }).id, today);
}), true);

// Every report in the catalogue, as the Principal (the report runner).
if (process.env.REPORTS !== "0") {
  const who = await read(principal, (tx) => viewerOf(tx, principal.user.id, schoolId));
  const setup = await periodSetup(principal);
  for (const entry of CATALOGUE) {
    add(`Report: ${entry.name}`, () => read(principal, async (tx) => {
      const f = await readFilters(tx, principal.ctx, entry, {}, setup, today, null);
      return runEntry(tx, who!, entry, f);
    }));
  }
}

// Background schedules for this school (each rolled back). They run with the
// usual 15 second limit for one transaction, so one slower than that fails.
if (process.env.SCHEDULES !== "0") {
  for (const sch of scheduleList()) {
    add(`Schedule: ${sch.name}`, () => rolledBack({ ...principal, ctx: { schoolId, userId: null } } as Current, (tx) => sch.run(tx, { schoolId, userId: null }, NOW)), true);
  }
}

/** The same answer gives the same fingerprint: object keys and Map entries are sorted first (their order is not part of the answer). */
const canonical = (x: unknown): unknown => {
  if (typeof x === "bigint") return `${x}n`;
  if (x instanceof Date) return x.toISOString();
  if (x instanceof Map) return [...x.entries()].map(([k, v]) => [canonical(k), canonical(v)]).sort((a, b) => (JSON.stringify(a[0]) < JSON.stringify(b[0]) ? -1 : 1));
  if (x instanceof Set) return [...x].map(canonical).sort();
  if (Array.isArray(x)) return x.map(canonical);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map((k) => [k, canonical((x as Record<string, unknown>)[k])]));
  return x;
};
const fingerprint = (v: unknown) => createHash("sha1").update(JSON.stringify(canonical(v)) ?? "undefined").digest("hex").slice(0, 12);
// ms: wall time (median); cpu: this process's CPU, the database client's own work included; db: time the database reported for the queries.
// On a busy machine the wall time swings; cpu and db show what the code itself costs.
const results: { name: string; ms: number; cpu: number; db: number; queries: number; fp: string; error?: string; top: string }[] = [];
for (const p of paths.filter((x) => !ONLY || x.name.toLowerCase().includes(ONLY.toLowerCase()))) {
  const times: number[] = [];
  const cpus: number[] = [];
  const dbs: number[] = [];
  let q = 0, fp = "", error: string | undefined, top = "";
  for (let r = 0; r < RUNS; r++) {
    queries = 0;
    slow = [];
    const t = performance.now();
    const c0 = process.cpuUsage();
    try {
      const out = await p.run();
      fp = p.save ? "(save)" : fingerprint(out);
    } catch (e) {
      error = e instanceof Error ? e.message.split("\n").slice(-1)[0].slice(0, 160) : String(e);
    }
    times.push(performance.now() - t);
    const c1 = process.cpuUsage(c0);
    cpus.push((c1.user + c1.system) / 1000);
    dbs.push(slow.reduce((n, x) => n + x.ms, 0));
    q = queries;
    const worst = slow.sort((a, b) => b.ms - a.ms)[0];
    top = worst ? `${worst.ms}ms ${worst.query.replace(/\s+/g, " ").slice(0, 160)}` : "";
  }
  if (process.env.QUERIES) {
    // QUERIES=1: the costliest kinds of query of the last run, with how often each was sent.
    const by = new Map<string, { n: number; ms: number }>();
    for (const x of slow) {
      const k = x.query.replace(/\s+/g, " ").slice(0, 200);
      const row = by.get(k) ?? { n: 0, ms: 0 };
      row.n++;
      row.ms += x.ms;
      by.set(k, row);
    }
    for (const [k, r] of [...by].sort((a, b) => b[1].ms - a[1].ms).slice(0, 12)) console.log(`      ${String(r.ms).padStart(6)}ms ${String(r.n).padStart(5)}x  ${k}`);
  }
  const ms = [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)];
  const med = (xs: number[]) => Math.round([...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]);
  results.push({ name: p.name, ms: Math.round(ms), cpu: med(cpus), db: med(dbs), queries: q, fp, error, top });
  console.log(`${String(Math.round(ms)).padStart(7)} ms ${String(med(cpus)).padStart(6)} cpu ${String(med(dbs)).padStart(6)} db ${String(q).padStart(6)} q  ${p.name}${error ? `  FAILED: ${error}` : ""}`);
}

console.log("\nSlowest 25:");
for (const r of [...results].sort((a, b) => b.ms - a.ms).slice(0, 25)) console.log(`${String(r.ms).padStart(7)} ms ${String(r.queries).padStart(6)} q  ${r.name}\n${" ".repeat(18)}slowest query: ${r.top}`);
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(results, null, 1));
await prisma.$disconnect();
