// Multi-school: a login with two schools switches between them; a login with
// one school cannot switch into another. Records of the other school stay hidden.
//   node qa/platform/multischool.mjs
import { close, BASE } from "../lib.mjs";
import { as } from "./util.mjs";
import { callAction } from "./action-call.mjs";

const SUNRISE = "23ac45d9-d0cd-4a25-aecf-526086a82006";
const GREEN = "5bc117cb-5f33-40ba-b2c7-21ca08aae19f";
const CEMS = "fbe1c0d0-cc45-4512-908c-70436e3fd47f";
const SUNRISE_STUDENT = "3ef672b0-2ec1-4acd-9015-468bfcb5f894"; // Riya Bhat
const CEMS_STUDENT = "981866cc-45e3-4fc5-94a8-c82f9f745116";
const say = (s, m) => console.log(`${s.padEnd(5)} ${m}`);

async function text(p, url) {
  await p.goto(BASE + url);
  await p.waitForTimeout(800);
  return (await p.locator("main").first().innerText().catch(() => "")).replace(/\s+/g, " ");
}
async function schoolName(p) {
  return (await p.locator("header, aside").first().innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
}

// 1. Sunrise principal: switch to Green Valley and back.
let p = await as("principal");
say("INFO", `principal starts in: ${await schoolName(p)}`);
let t = await text(p, `/student-management/students/${SUNRISE_STUDENT}`);
say(/Riya Bhat/.test(t) ? "PASS" : "FAIL", `principal in Sunrise opens Sunrise student: ${t.slice(0, 80)}`);
let r = await callAction(p.context(), "src/app/(school)/actions.ts", "switchSchool", [{ __form: { schoolId: GREEN, back: "/dashboard" } }]);
say("INFO", `switch to Green Valley -> ${r.redirect}`);
t = await text(p, "/student-management");
say("INFO", `after switch, students page: ${t.slice(0, 120)}`);
t = await text(p, `/student-management/students/${SUNRISE_STUDENT}`);
say(/Riya Bhat/.test(t) ? "FAIL" : "PASS", `principal in Green Valley opens Sunrise student by URL: ${t.slice(0, 80)}`);
const s = await p.context().request.get(`${BASE}/api/v1/search?q=Riya`);
say("INFO", `search "Riya" in Green Valley: ${s.status()} ${(await s.text()).slice(0, 160)}`);
r = await callAction(p.context(), "src/app/(school)/actions.ts", "switchSchool", [{ __form: { schoolId: CEMS, back: "/dashboard" } }]);
t = await text(p, "/student-management");
say(/Chaitanya|Grade 5/.test(t) ? "FAIL" : "PASS", `principal tries switching into CEMS (no access): ${r.redirect || "no redirect"}; page: ${t.slice(0, 80)}`);
r = await callAction(p.context(), "src/app/(school)/actions.ts", "switchSchool", [{ __form: { schoolId: SUNRISE, back: "/dashboard" } }]);
t = await text(p, `/student-management/students/${SUNRISE_STUDENT}`);
say(/Riya Bhat/.test(t) ? "PASS" : "FAIL", `back in Sunrise opens Sunrise student: ${t.slice(0, 60)}`);
await p.context().close();

// 2. CEMS admin tries to switch into Sunrise.
p = await as("cems.admin");
r = await callAction(p.context(), "src/app/(school)/actions.ts", "switchSchool", [{ __form: { schoolId: SUNRISE, back: `/student-management/students/${SUNRISE_STUDENT}` } }]);
t = await text(p, `/student-management/students/${SUNRISE_STUDENT}`);
say(/Riya Bhat/.test(t) ? "FAIL" : "PASS", `cems.admin switchSchool(Sunrise) then opens Sunrise student: ${r.redirect || "ignored"}; ${t.slice(0, 60)}`);
t = await text(p, `/student-management/students/${CEMS_STUDENT}`);
say(/Aarav Kumar/.test(t) ? "PASS" : "FAIL", `cems.admin still in CEMS: ${t.slice(0, 60)}`);
await p.context().close();
await close();
