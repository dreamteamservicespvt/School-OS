// Self-test 14 Nov: a Vice Principal (adds students, may not see Aadhaar) adds a student. Before the fix every save
// said "Required" because the form has no Aadhaar field for them.
import { asRole, close, snap, sleep, mainText } from "./nc-h.mjs";
const p = await asRole("vp");
await p.goto(new URL("/student-management/new", p.url()).href);
await p.waitForLoadState("networkidle").catch(() => {});
await p.getByLabel("Full name").waitFor({ timeout: 60000 });
console.log("Aadhaar field shown to VP:", await p.getByLabel("Aadhaar number").count());
await p.getByLabel("Full name").fill(`QA Vp Student ${Date.now() % 1000}`);
const sec = p.getByLabel("Class and section");
const opts = await sec.locator("option").evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
await sec.selectOption(opts[0]);
for (const [label, v] of [["Parent's or guardian's name", "QA Parent"], ["Parent's phone", "9390011378"]]) await p.getByLabel(label).fill(v);
const rel = p.getByLabel("Relation");
if ((await rel.evaluate((e) => e.tagName)) === "SELECT") await rel.selectOption({ index: 1 }); else await rel.fill("Father");
for (const g of ["Gender", "Date of birth"]) { const f = p.getByLabel(g).first(); if (await f.count()) { if ((await f.evaluate((e) => e.tagName)) === "SELECT") await f.selectOption({ index: 1 }).catch(() => {}); else await f.fill("2018-06-01").catch(() => {}); } }
await p.getByRole("radio", { name: "Female" }).check();
await p.getByRole("button", { name: /^(Save|Add student|Save student)/ }).first().click();
await sleep(5000);
const t = await mainText(p, 6000);
console.log("after save url:", new URL(p.url()).pathname.replace(/[0-9a-f-]{36}/, "ID"));
console.log("says Required:", /\bRequired\b/.test(t), "| first line:", t.split("\n").slice(0, 2).join(" / "));
await snap(p, "e2e-vp-add-student", false);
await p.context().close(); await close();
