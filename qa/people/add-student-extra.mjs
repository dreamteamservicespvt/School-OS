// Add Student on the fixed build: a Telugu name, a double click on Add student, the fee plan,
// then the same child again (duplicate warning). QA_URL=http://localhost:3102
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Student Management", P = "Add student (fixed build, dev server)", R = "School Admin";
const page = await as("cems.admin");
page.setDefaultNavigationTimeout(300000);
page.setDefaultTimeout(120000);
const NAME = process.env.NAME ?? "Demo శ్రీజ Varma";
const T = async (sel = "main") => ((await page.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");

async function fill(v) {
  await go(page, "/student-management/new");
  await page.locator("input[name=fullName]").waitFor({ timeout: 60000 });
  for (const [k, val] of Object.entries(v)) await page.locator(`[name=${k}]`).fill(val);
  const sec = page.locator("select[name=sectionId]");
  const id = await sec.evaluate((el) => [...el.options].find((o) => o.text.startsWith("Grade 5 A "))?.value);
  await sec.selectOption(id);
  await page.locator("input[name=gender][value=Female]").check();
}
const v = { fullName: NAME, dateOfBirth: "2016-03-09", guardianName: "Demo రమేష్ Varma", guardianPhone: "9876504001" };
await fill(v);
const note = await T("form");
const posts = [];
page.on("request", (r) => { if (r.method() === "POST" && r.url().includes("/student-management/new")) posts.push(r.url()); });
const btn = page.locator("form").filter({ has: page.locator("input[name=fullName]") }).getByRole("button", { name: "Add student" });
await btn.dblclick();
await page.waitForURL(/students\/[0-9a-f-]{36}/, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2500);
const url = page.url();
const t = await T();
await shot(page, "dev-add-telugu");
res({ module: M, page: P, action: `Add ${NAME} (Telugu letters in child and parent names) with a double click on Add student`, role: R, expected: "One student saved, names kept exactly; the second click does not make a second student", actual: `${url.replace(/.*:\d+/, "")} posts=${posts.length} ${t.slice(0, 200)}`, status: /students\/[0-9a-f-]{36}/.test(url) && t.includes(NAME) ? "PASS" : "FAIL" });
console.log("FEE NOTE", (note.match(/fee[^.]*\./i) ?? [""])[0]);
console.log("SID", url.match(/students\/([0-9a-f-]{36})/)?.[1]);

// The same child again
await fill(v);
const resp = page.waitForResponse(async (r) => r.request().method() === "POST" && /"ok":/.test(await r.text().catch(() => "")), { timeout: 60000 }).catch(() => null);
await btn.click();
const r = await resp;
await page.waitForTimeout(2000);
const d = `${r ? (await r.text()).match(/\{"ok":.*\}/)?.[0]?.slice(0, 300) : ""} || ${await T("form")}`.slice(0, 400);
await shot(page, "dev-add-duplicate");
res({ module: M, page: P, action: `Add the same child again (${NAME}, same birth date and parent phone)`, role: R, expected: "Warned of a possible duplicate; saves only with a reason", actual: d, status: /duplicate|already|same/i.test(d) && !/students\/[0-9a-f-]{36}/.test(page.url()) ? "PASS" : "FAIL" });
console.log(page.problems);
await close();
