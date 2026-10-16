// npx tsx qa/platform/compare-roles.ts — the QA school's roles in the database
// against src/lib/roles.ts (which tests/permissions.test.ts proves matches 05-roles.md).
import { readFileSync } from "node:fs";
import { ALL_ROLE_TEMPLATES } from "../../src/lib/roles";

const perms = JSON.parse(readFileSync("qa/platform/cems-perms.json", "utf8")) as Record<string, Record<string, string>>;
const map: Record<string, string> = { "cems.principal": "principal", "cems.viceprincipal": "vice-principal", "cems.academichead": "academic-head", "cems.admin": "school-admin", "cems.accountant": "accountant", "cems.classteacher": "class-teacher", "cems.teacher": "teacher", "cems.reception": "receptionist", "cems.transport": "transport-in-charge", "cems.librarian": "librarian", "cems.warden": "hostel-warden", "cems.store": "store-keeper", "cems.hr": "hr", "cems.office": "office-staff", "cems.exam": "exam-in-charge", "cems.admissions": "admission-counsellor", "cems.counsellor": "counsellor", "cems.gate": "gate-security", "cems.driver": "driver" };
for (const [login, key] of Object.entries(map)) {
  const t = ALL_ROLE_TEMPLATES.find((r) => r.key === key)!;
  const db = perms[login];
  const diff = Object.entries(t.permissions).filter(([m, v]) => db[m] !== v).map(([m, v]) => `${m}: code ${v} db ${db[m]}`);
  console.log(login.padEnd(20), diff.length ? diff.join("; ") : "same");
}
