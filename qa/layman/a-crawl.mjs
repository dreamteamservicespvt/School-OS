// Layman QA A: open every screen in Admission, Student, Academic, Attendance as admin (1440 + 390),
// and record load time, page errors, code words, sideways scroll, broken pages.
//   QA_OUT=D:/all/Projects/School-OS/qa-output/layman-a node qa/layman/a-crawl.mjs [role]
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-a";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const lib = await import("../lib.mjs");
const role = process.argv[2] ?? "admin";
const p = await asRole(role);
const roots = ["/admission-management", "/student-management", "/academic-management", "/attendance-management"];
const statics = [
 "/admission-management","/admission-management/enquiries","/admission-management/enquiries/import","/admission-management/applications","/admission-management/applications/new","/admission-management/decision","/admission-management/documents","/admission-management/reports","/admission-management/settings","/admission-management/tests",
 "/student-management","/student-management/new","/student-management/import","/student-management/import/history","/student-management/bulk-photos","/student-management/bulk-update","/student-management/certificates","/student-management/certificates/new","/student-management/certificates/id-cards","/student-management/guardians","/student-management/guardians/new","/student-management/guardians/consent","/student-management/guardians/link","/student-management/leaving","/student-management/leaving/new","/student-management/leaving/left","/student-management/leaving/alumni","/student-management/leaving/alumni/jobs","/student-management/logins","/student-management/promotion","/student-management/settings","/student-management/behaviour","/student-management/behaviour/new","/student-management/behaviour/career","/student-management/behaviour/counselling","/student-management/behaviour/counselling/new",
 "/academic-management","/academic-management/import","/academic-management/settings","/academic-management/subjects","/academic-management/substitutions","/academic-management/syllabus","/academic-management/teacher-allocation","/academic-management/time-table","/academic-management/time-table/mine",
 "/attendance-management","/attendance-management/devices","/attendance-management/import","/attendance-management/register","/attendance-management/register/absences","/attendance-management/register/correction","/attendance-management/register/corrections","/attendance-management/reports","/attendance-management/settings","/attendance-management/staff","/attendance-management/student-leave",
];
const seen = new Set(); const queue = [...statics]; const rows = [];
const CODE = /\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]|Invalid Date|\bcampusId\b|\bschoolId\b|_id\b|\bTODO\b|\bInfinity\b/;
let dynCount = {};
while (queue.length) {
  const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
  p.problems.length = 0;
  const t0 = Date.now(); let status = 0;
  try { const r = await go(p, u); status = r?.status() ?? 0; } catch (e) { rows.push({ u, err: String(e).slice(0, 200) }); continue; }
  const ms = Date.now() - t0;
  await sleep(500);
  const txt = await mainText(p, 20000);
  const h1 = (await p.locator("h1").first().innerText().catch(() => "")).trim();
  const lay = await lib.layoutIssues(p);
  const code = (txt.match(new RegExp(CODE.source, "g")) ?? []);
  const codeCtx = code.length ? (txt.match(new RegExp(".{0,40}(" + CODE.source + ").{0,40}")) ?? [""])[0] : "";
  const broken = /Something went wrong|Application error|Internal Server Error|could not be found|Unhandled Runtime/i.test(txt);
  const dateBad = (txt.match(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) ?? []).slice(0, 3);
  const name = u.replace(/^\//, "").replace(/[\/?=&]/g, "_");
  await snap(p, `crawl-${role}-${name}-1440`);
  // phone
  await p.setViewportSize({ width: 390, height: 844 }); await sleep(600);
  const layPhone = await lib.layoutIssues(p);
  await snap(p, `crawl-${role}-${name}-390`);
  await p.setViewportSize({ width: 1440, height: 900 });
  rows.push({ u, finalPath: new URL(p.url()).pathname + new URL(p.url()).search, status, ms, h1, broken, code: codeCtx, dateBad, lay, layPhone: layPhone.filter((x) => /sideways/.test(x)), problems: [...p.problems].slice(0, 5), head: txt.slice(0, 160).replace(/\n/g, " | ") });
  console.log(`${status} ${ms}ms ${u} -> ${h1}${broken ? " BROKEN" : ""}${codeCtx ? " CODE:" + codeCtx : ""}${layPhone.some((x) => /sideways/.test(x)) ? " PHONE-SCROLL" : ""}${p.problems.length ? " ERR:" + p.problems[0] : ""}${dateBad.length ? " DATES:" + dateBad.join(",") : ""}`);
  // follow dynamic links inside our areas (one or two of each pattern)
  const links = await p.evaluate(() => [...document.querySelectorAll("main a[href]")].map((a) => a.getAttribute("href")));
  for (const l of links) {
    if (!l || !l.startsWith("/") || !roots.some((r) => l.startsWith(r))) continue;
    const pat = l.split("?")[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}|c[a-z0-9]{20,}|\d{3,}/g, ":id");
    if (pat === l.split("?")[0] && (seen.has(l) || queue.includes(l))) continue;
    if (pat === l.split("?")[0] && !l.includes("?")) { if (!seen.has(l)) queue.push(l); continue; }
    dynCount[pat] = (dynCount[pat] ?? 0) + 1;
    if (dynCount[pat] <= 1 && !seen.has(l)) queue.push(l);
  }
  if (seen.size > 140) break;
}
writeFileSync(path.join(process.env.QA_OUT, `crawl-${role}.json`), JSON.stringify(rows, null, 2));
await close();
