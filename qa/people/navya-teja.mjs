// Navya Allu (pending document): the profile shows the missing documents. Then a leaving request
// for her with fees due: pressing Issue on the TC form must be refused by the server; the family
// changes its mind and the leaving is cancelled. Teja Varma (birthday 20 Oct) on the dashboard.
import { go, close, shot } from "../lib.mjs";
import { as } from "./session.mjs";
import { res } from "./res.mjs";

const M = "Student Management", NAVYA = "c3f3215f-5006-4cfc-8af2-79358aadd21e";
const off = await as("cems.office");
const T = async (p, sel = "main") => ((await p.locator(sel).allInnerTexts().catch(() => [])).join(" ")).replace(/\s+/g, " ");

await go(off, `/student-management/students/${NAVYA}?tab=documents`);
await off.waitForTimeout(1200);
let t = await T(off);
await shot(off, "navya-documents");
res({ module: M, page: "Student profile", action: "Navya Allu (pending document): Documents tab", role: "Office Staff", expected: "Shows which documents are missing", actual: (t.match(/Documents.{0,300}/) ?? [t.slice(0, 300)])[0], status: /missing/i.test(t) ? "PASS" : "FAIL" });

if (!process.env.SKIP_LEAVING) {
  await go(off, `/student-management/leaving/new?student=${NAVYA}`);
  await off.waitForTimeout(1200);
  await off.getByText("Withdrawal", { exact: true }).click().catch(() => {});
  await off.locator("select[name=reason]").selectOption({ label: "Distance from home" });
  await off.locator("main button[type=submit]").last().click();
  await off.waitForURL(/leaving\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
  await off.waitForTimeout(1000);
  const reqUrl = off.url();
  t = await T(off);
  console.log("NAVYA REQ", reqUrl, (t.match(/Clearance pending.{0,120}/) ?? [""])[0]);
  await go(off, `/student-management/certificates/new?student=${NAVYA}&type=TC`);
  await off.waitForTimeout(1200);
  await off.locator("main").getByRole("button", { name: "Issue", exact: true }).click();
  await off.waitForTimeout(3000);
  t = `${await T(off, "[role=status], [role=alert]")} || ${off.url().replace(/.*:\d+/, "")}`;
  await shot(off, "navya-tc-refused");
  res({ module: M, page: "Certificates & ID Cards", action: "Press Issue on the TC form while fees are due (Navya Allu, withdrawal)", role: "Office Staff", expected: "Server refuses: TC blocked with the amount; nothing saved", actual: t.slice(0, 300), status: /TC blocked/.test(t) && !/certificates\/[0-9a-f-]{36}/.test(t) ? "PASS" : "FAIL" });
  await go(off, reqUrl);
  await off.waitForTimeout(1000);
  await off.getByRole("button", { name: "Cancel leaving" }).click();
  await off.waitForTimeout(800);
  const d = off.locator("dialog[open]").last();
  await d.locator("textarea, input[type=text]").first().fill("Demo: family changed its mind");
  await d.getByRole("button", { name: /Cancel leaving|Yes|Confirm/ }).last().click();
  await off.waitForTimeout(3000);
  t = `${await T(off, "[role=status], [role=alert]")} || ${(await T(off)).slice(0, 200)}`;
  res({ module: M, page: "Leaving & Alumni", action: "Cancel Navya Allu's leaving with a reason (family changed its mind)", role: "Office Staff", expected: "Cancelled; Navya stays in the class, status unchanged", actual: t.slice(0, 300), status: /Leaving cancelled/.test(t) ? "PASS" : "FAIL" });
}

// Teja Varma's birthday (20 Oct) on the dashboard, today 16 Oct
const pr = await as(process.env.BDAY_LOGIN ?? "cems.principal");
await go(pr, "/dashboard");
await pr.waitForTimeout(2500);
t = await T(pr);
await shot(pr, "dashboard-birthdays");
res({ module: "Dashboard", page: "Dashboard", action: `Upcoming birthdays show Teja Varma (20 Oct) for ${process.env.BDAY_ROLE ?? "Principal"}`, role: process.env.BDAY_ROLE ?? "Principal", expected: "Teja Varma listed with his class and the day", actual: (t.match(/.{0,80}Teja Varma.{0,80}/) ?? [(t.match(/Birthdays.{0,200}/) ?? [t.slice(0, 200)])[0]])[0], status: /Teja Varma/.test(t) ? "PASS" : "FAIL" });
console.log(off.problems, pr.problems);
await close();
