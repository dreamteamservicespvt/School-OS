// Measures the whole Dashboard for one login (read only): server time over
// several runs, the time of each widget inside a real run, the queries sent,
// and the page's output as JSON so two versions of the code can be compared.
//   npx tsx --conditions=react-server --env-file=.env qa/platform/dash-speed.ts <username> [school name part]
// Options (environment): RUNS=9, NOW=2026-10-16T05:30:00Z (fixed so outputs compare),
// OUT=file.json (writes the page's output), QUERIES=1 (lists the costliest queries),
// NOLOG=1 (no query events: the client as the app runs it), PER=1 (each widget alone),
// INTL=1 (date formatters and collators made per page).
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";

// The app's client, with query events on (db.ts reuses globalThis.prisma when set).
// NOLOG=1 times the client exactly as the app runs it, without counting queries.
const seen: { query: string; ms: number }[] = [];
if (!process.env.NOLOG) {
  const logged = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
  logged.$on("query", (e) => seen.push({ query: e.query, ms: e.duration }));
  (globalThis as { prisma?: PrismaClient }).prisma = logged;
}

// INTL=1 counts formatters and collators made per page (each costs far more than using one).
const intl = new Map<string, number>();
if (process.env.INTL) {
  const where = () => (new Error().stack ?? "").split("\n").slice(3, 4).join(" ").trim().replace(/.*[\\/](src[\\/].*?):\d+:\d+\)?$/, "$1");
  const Real = Intl.DateTimeFormat;
  const Counted = function (this: unknown, ...a: ConstructorParameters<typeof Intl.DateTimeFormat>) { const k = `DateTimeFormat ${where()}`; intl.set(k, (intl.get(k) ?? 0) + 1); return new Real(...a); } as unknown as typeof Intl.DateTimeFormat;
  Counted.supportedLocalesOf = Real.supportedLocalesOf;
  Intl.DateTimeFormat = Counted;
  const lc = String.prototype.localeCompare;
  String.prototype.localeCompare = function (this: string, that: string, ...rest: unknown[]) { if (rest.length) { const k = `localeCompare ${where()}`; intl.set(k, (intl.get(k) ?? 0) + 1); } return lc.call(this, that, ...(rest as [])); };
  for (const m of ["toLocaleTimeString", "toLocaleDateString", "toLocaleString"] as const) {
    const f = Date.prototype[m];
    Date.prototype[m] = function (this: Date, ...a: unknown[]) { if (a.length) { const k = `Date.${m} ${where()}`; intl.set(k, (intl.get(k) ?? 0) + 1); } return (f as (...x: unknown[]) => string).apply(this, a); };
  }
}
const { prisma } = await import("../../src/lib/db");
const { accessIn, schoolsFor } = await import("../../src/lib/auth/access");
const { menuModules } = await import("../../src/lib/permissions");
const { buildHome, widgetsFor } = await import("../../src/lib/dashboard/compose");
const { homesFor } = await import("../../src/lib/dashboard/homes");
type Widgets = readonly import("../../src/lib/dashboard/types").Widget[];

const [username = "principal", schoolPart = "Sunrise"] = process.argv.slice(2);
const runs = Number(process.env.RUNS ?? 9);
const now = new Date(process.env.NOW ?? "2026-10-16T05:30:00Z");

const user = await prisma.userLogin.findFirstOrThrow({ where: { username } });
const schools = await schoolsFor(user.id);
const school = schools.find((s) => s.name.includes(schoolPart)) ?? schools[0];
const access = await accessIn(user.id, school.id);
if (!access) throw new Error("no access");
const viewer = { session: null, user, schools, ...access, ctx: { schoolId: school.id, userId: user.id }, menu: menuModules(access.permissions, access.modulesOn) } as never;
const list = widgetsFor(viewer, homesFor(viewer));
console.log(`${username} in ${school.name}: ${list.length} widgets, now ${now.toISOString()}`);

const times: number[] = [];
const cpu: number[] = [];
let output = "";
for (let r = 0; r < runs; r++) {
  seen.length = 0;
  const s = performance.now();
  const c0 = process.cpuUsage();
  const home = await buildHome(viewer, { now });
  times.push(performance.now() - s);
  const c1 = process.cpuUsage(c0);
  cpu.push((c1.user + c1.system) / 1000);
  const json = JSON.stringify(home, (_k, v) => (typeof v === "bigint" ? `${v}n` : v), 2);
  if (output && json !== output) console.log(`run ${r + 1}: output differs from run 1`);
  output ||= json;
  if (r === 0 && home.failed.length) console.log(`failed widgets: ${home.failed.join(", ")}`);
}
const queriesPerRun = seen.length;
if (process.env.INTL) {
  console.log("Intl objects made per page:");
  for (const [k, v] of [...intl].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`${String(Math.round(v / runs)).padStart(6)}  ${k}`);
}
const sorted = [...times].sort((a, b) => a - b);
console.log(`runs: ${times.map((t) => Math.round(t)).join(", ")} ms`);
const cpuSorted = cpu.slice(1).sort((a, b) => a - b);
console.log(`app process CPU per run (after first): median ${Math.round(cpuSorted[Math.floor(cpuSorted.length / 2)] ?? 0)} ms, best ${Math.round(cpuSorted[0] ?? 0)} ms (JavaScript plus Prisma's engine)`);
console.log(`first ${Math.round(times[0])} ms · median (after first) ${Math.round(sorted[Math.floor(sorted.length / 2)])} ms · best ${Math.round(sorted[0])} ms · ${queriesPerRun} queries per run`);
if (process.env.OUT) writeFileSync(process.env.OUT, output);

if (process.env.QUERIES) {
  const by = new Map<string, { n: number; ms: number }>();
  for (const q of seen) {
    const key = q.query.replace(/\s+/g, " ").slice(0, 220);
    const row = by.get(key) ?? { n: 0, ms: 0 };
    row.n++;
    row.ms += q.ms;
    by.set(key, row);
  }
  console.log(`\nquery time ${seen.reduce((s, q) => s + q.ms, 0)} ms in ${seen.length} queries (last run). Costliest:`);
  for (const [q, r] of [...by.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, Number(process.env.QUERIES) > 1 ? Number(process.env.QUERIES) : 25)) console.log(`${String(r.ms).padStart(6)}ms ${String(r.n).padStart(4)}x  ${q}`);
}

// Each widget's own time inside a real page (wrapped loaders; waiting for a shared read counts).
const own = new Map<string, number>();
const timed = list.map((w) => ({ ...w, load: async (c: Parameters<typeof w.load>[0]) => { const t = performance.now(); try { return await w.load(c); } finally { own.set(w.id, performance.now() - t); } } }));
await buildHome(viewer, { now, widgets: timed as Widgets });
console.log("\nslowest widgets inside one page:");
for (const [id, ms] of [...own.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`${String(Math.round(ms)).padStart(6)}ms  ${id}`);
if (!process.env.PER) await prisma.$disconnect();

// PER=1: each widget alone (queries and time beyond the page frame), to find what costs the most round trips.
if (process.env.PER) {
  const alone = async (widgets: Widgets) => { seen.length = 0; const t = performance.now(); await buildHome(viewer, { now, widgets }); return { ms: performance.now() - t, q: seen.length }; };
  await alone([]);
  const frame = await alone([]);
  console.log(`\npage frame without widgets: ${Math.round(frame.ms)} ms, ${frame.q} queries`);
  const rows: [string, number, number][] = [];
  for (const w of list) { const r = await alone([w]); rows.push([w.id, r.ms - frame.ms, r.q - frame.q]); }
  for (const [id, ms, q] of rows.sort((a, b) => b[2] - a[2])) console.log(`${String(q).padStart(4)} queries ${String(Math.round(ms)).padStart(5)}ms  ${id}`);
  await prisma.$disconnect();
}
