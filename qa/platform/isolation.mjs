// Cross-school and cross-class checks: open records of another school (or
// another class) by URL, call server actions with their ids, fetch their
// files and exports. Everything must come back as not found / no access.
//   node qa/platform/isolation.mjs
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";
import { callAction, words } from "./action-call.mjs";

const A_G5_AARAV = "981866cc-45e3-4fc5-94a8-c82f9f745116"; // School A, Grade 5 A
const A_G9_AARAV = "ec941664-120e-4ae4-a067-61a0fe547d6e"; // School A, Grade 9 A
const B_AARAV = "7a35d675-2279-49fa-ac82-5e5c76ccfc14"; // School B
const S = "src/app/(school)";
const out = [];
const CONTACT = { __form: { address: "Demo QA street", city: "", state: "", pinCode: "", permanentAddress: "", studentPhone: "", studentEmail: "" } };
const note = (row) => { out.push(row); console.log(`${row.verdict.padEnd(5)} ${row.login.padEnd(18)} ${row.what} -> ${row.got}`); };

async function open(p, login, url, expectDenied) {
  const r = await p.goto(BASE + url);
  await p.waitForTimeout(800);
  const text = await p.locator("main").first().innerText().catch(() => "");
  const denied = /no-access/.test(p.url()) || /This page is not here|not found|does not allow|not one of your/i.test(text);
  const leaked = !denied && /Aarav Kumar/.test(text);
  note({ login, what: `GET ${url}`, got: `${r?.status()} ${p.url().replace(BASE, "")} ${text.replace(/\s+/g, " ").slice(0, 60)}`, verdict: expectDenied ? (denied && !leaked ? "PASS" : "FAIL") : (denied ? "FAIL" : "PASS") });
}
async function act(p, login, file, name, args, label) {
  const r = await callAction(p.context(), `${S}/${file}`, name, args);
  const w = words(r.text);
  const ok = /not found|does not allow|cannot|Only|no access|digest/i.test(w) || r.redirect.includes("no-access");
  note({ login, what: `${label}`, got: w.slice(0, 160) || r.redirect, verdict: ok ? "PASS" : "CHECK" });
}

// School A admin against School B.
let p = await as("cems.admin");
await open(p, "cems.admin", `/student-management/students/${A_G5_AARAV}`, false);
await open(p, "cems.admin", `/student-management/students/${B_AARAV}`, true);
await open(p, "cems.admin", `/student-management/students/${B_AARAV}/fees`, true);
await act(p, "cems.admin", "student-management/_actions/students.ts", "saveContactAction", [B_AARAV, null, CONTACT], "saveContactAction on School B student");
await act(p, "cems.admin", "student-management/_actions/students.ts", "removePhoto", [B_AARAV], "removePhoto on School B student");
await p.context().close();

// School B admin against School A.
p = await as("qab.admin");
await open(p, "qab.admin", `/student-management/students/${B_AARAV}`, false);
await open(p, "qab.admin", `/student-management/students/${A_G5_AARAV}`, true);
await act(p, "qab.admin", "student-management/_actions/students.ts", "saveContactAction", [A_G5_AARAV, null, CONTACT], "saveContactAction on School A student");
await p.context().close();

// Class teacher of Grade 5 A against Grade 9 A.
p = await as("cems.classteacher");
await open(p, "cems.classteacher", `/student-management/students/${A_G5_AARAV}`, false);
await open(p, "cems.classteacher", `/student-management/students/${A_G9_AARAV}`, true);
await act(p, "cems.classteacher", "student-management/_actions/students.ts", "saveContactAction", [A_G9_AARAV, null, CONTACT], "saveContactAction on Grade 9 student");
await p.context().close();

// Subject teacher (Science 5–7) against Grade 9 A.
p = await as("cems.teacher");
await open(p, "cems.teacher", `/student-management/students/${A_G9_AARAV}`, true);
await p.context().close();
await close();
