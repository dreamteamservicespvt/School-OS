// School isolation as the Principal, who works in both schools (Lakshmi Rao):
// switch Sunrise -> Green Valley -> Sunrise, each shows its own data; Sunrise
// record addresses opened while in Green Valley show nothing; search stays in school.
//   node qa/full/isolation.mjs
import { asUser, go, mainText, pageState, shot, saveJson, close } from "./h.mjs";

const SPS = { student: "0ecd0727-6129-42b0-a577-602edaf6908b", studentName: "Riya Bhat", staff: "6ad24731-69ac-43be-8453-1ced3ca15878", payment: "144e15f8-f27a-4f2c-a037-32134c3c44ad", enquiry: "bfc0b305-80f0-4e37-b86f-4de56a56d4e7" };
const GVS = { student: "6fba9789-d36b-4f90-90fc-274c46d17f2d", studentName: "Sahithi Mishra" };
const res = [];
const rec = (check, pass, note = "") => { res.push({ check, pass, note }); console.log(`${pass ? "PASS" : "FAIL"} ${check}${note ? " :: " + note : ""}`); };

async function current(page) {
  await go(page, "/dashboard");
  const t = await page.locator("aside, header, nav").allInnerTexts().then((x) => x.join(" ")).catch(() => "");
  return /Green Valley/.test(t) ? "GVS" : /Sunrise/.test(t) ? "SPS" : `? ${t.slice(0, 80)}`;
}
async function switchTo(page, name) {
  await page.getByRole("button", { name: "Your profile and settings" }).first().click();
  await page.getByRole("menuitem", { name: "Switch school or campus" }).click();
  const sheet = page.getByRole("dialog", { name: "Switch school or campus" });
  await sheet.getByRole("button", { name: new RegExp(name) }).click();
  await page.waitForLoadState("networkidle"); await page.waitForTimeout(2000);
}
async function students(page) {
  await go(page, "/student-management");
  return mainText(page, 4000);
}

const p = await asUser("principal");
const first = await current(p);
rec("Principal lands in a school after sign-in", first === "SPS" || first === "GVS", first);
if (first !== "SPS") await switchTo(p, "Sunrise Public School");
rec("In Sunrise", (await current(p)) === "SPS");
let t = await students(p);
rec("Sunrise student list shows Sunrise students only", t.includes(SPS.studentName) && !t.includes(GVS.studentName));

await switchTo(p, "Green Valley School");
rec("Switched to Green Valley", (await current(p)) === "GVS");
await shot(p, "isolation-gvs-dashboard", false);
t = await students(p);
rec("Green Valley student list shows Green Valley students only", t.includes(GVS.studentName) && !t.includes(SPS.studentName));
for (const [what, url] of [["student profile", `/student-management/students/${SPS.student}`], ["staff profile", `/staff-hr-management/${SPS.staff}`], ["fee payment", `/fee-management/payments/${SPS.payment}`], ["enquiry", `/admission-management/enquiries/${SPS.enquiry}`]]) {
  const r = await go(p, url);
  const st = await pageState(p);
  const shows = st.text.includes(SPS.studentName) || /Riya/.test(st.text);
  rec(`Sunrise ${what} opened in Green Valley shows nothing of Sunrise`, !shows && (r.status() === 404 || /not found|could not find|no longer|does not exist/i.test(st.text) || st.refused), `HTTP ${r.status()} ${st.h1} ${st.text.slice(0, 120).replace(/\n/g, " | ")}`);
}
// The search box in the top bar.
const search = p.getByRole("searchbox").or(p.getByPlaceholder(/search/i)).first();
if (await search.isVisible().catch(() => false)) {
  await search.click(); await search.pressSequentially("Riya Bhat", { delay: 20 }); await p.waitForTimeout(2500);
  t = await p.locator("body").innerText();
  rec("Search in Green Valley never shows the Sunrise student Riya Bhat", !/Riya Bhat/.test(t.replace(/Riya Bhat"?$/m, "")) || !(await p.getByRole("option", { name: /Riya Bhat/ }).count()), t.match(/Riya[^\n]*/g)?.slice(0, 3).join(" ; ") ?? "no match");
  await shot(p, "isolation-gvs-search", false);
} else rec("Top bar search found", false, "no search box");

await switchTo(p, "Sunrise Public School");
rec("Switched back to Sunrise", (await current(p)) === "SPS");
const r = await go(p, `/student-management/students/${GVS.student}`);
const st = await pageState(p);
rec("Green Valley student opened in Sunrise shows nothing of Green Valley", !st.text.includes(GVS.studentName), `HTTP ${r.status()} ${st.text.slice(0, 100).replace(/\n/g, " | ")}`);

// A one-school person never sees Green Valley.
const a = await asUser("admin");
await a.getByRole("button", { name: "Your profile and settings" }).first().click();
t = await a.locator("body").innerText();
rec("School Admin (Sunrise only) is not offered Green Valley", !/Green Valley/.test(t));
const r2 = await go(a, `/student-management/students/${GVS.student}`);
rec("School Admin opening a Green Valley student sees nothing", !(await mainText(a)).includes(GVS.studentName), `HTTP ${r2.status()}`);
saveJson("isolation.json", res);
console.log(`\n${res.filter((x) => x.pass).length} of ${res.length} passed`);
await close();
