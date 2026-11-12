// Layman A: each role types addresses of pages in Admission, Students, Academic, Attendance by hand.
import { asRole, go, mainText, sleep, close, snap, pageState } from "../full/selftest-A-h.mjs";
const STUDENT = "7fb68bce-c215-4acf-a55f-8e0790ac7b03"; // Abhinav Varma
const APP = "b55edc2f-86f3-4cdc-a192-d0b99cf87979";
const URLS = [
 "/admission-management", "/admission-management/enquiries", "/admission-management/applications", "/admission-management/applications/" + APP, "/admission-management/decision", "/admission-management/settings", "/admission-management/enquiries/export?format=csv",
 "/student-management", "/student-management/new", "/student-management/students/" + STUDENT, "/student-management/students/" + STUDENT + "/edit/personal", "/student-management/behaviour", "/student-management/behaviour/counselling", "/student-management/import", "/student-management/promotion", "/student-management/leaving/new", "/student-management/certificates/new", "/student-management/settings", "/student-management/logins",
 "/academic-management", "/academic-management/settings", "/academic-management/subjects", "/academic-management/teacher-allocation", "/academic-management/time-table", "/academic-management/substitutions",
 "/attendance-management/register", "/attendance-management/staff", "/attendance-management/settings", "/attendance-management/reports", "/attendance-management/register/corrections", "/attendance-management/devices", "/attendance-management/student-leave",
];
const roles = (process.argv[2] ?? "teacher,accountant,reception,librarian,student,driver,hr").split(",");
for (const role of roles) {
  let p; try { p = await asRole(role); } catch (e) { console.log(`ROLE ${role}: sign-in failed ${String(e).slice(0, 120)}`); continue; }
  console.log(`\n### ROLE ${role}`);
  for (const u of URLS) {
    let note = "";
    try {
      const r = await p.request.get(u.includes("export") ? u : "about:blank").catch(() => null);
      if (u.includes("export")) { note = `export HTTP ${r?.status()} ${r?.headers()["content-type"] ?? ""}`; console.log(`  ${u} -> ${note}`); continue; }
      await go(p, u); await sleep(300);
      const s = await pageState(p);
      const t = (s.text || "").replace(/\n/g, " | ");
      console.log(`  ${u} -> ${s.refused ? "REFUSED" : s.broken ? "BROKEN" : "OPEN"} [${s.path}] h1="${s.h1}" ${s.refused ? "" : t.slice(0, 140)}`);
    } catch (e) { console.log(`  ${u} -> ERR ${String(e).slice(0, 100)}`); }
  }
  await p.context().close();
}
await close();
