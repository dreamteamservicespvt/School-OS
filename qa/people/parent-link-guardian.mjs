// The guardian's Parent Link page (no login): verify step, the sections, and
// every way to reach another child's or school's data by changing the address.
//   node qa/people/parent-link-guardian.mjs <fixture.json>
import { readFileSync } from "node:fs";
import { newPage, close, shot, BASE, VIEWPORTS, layoutIssues } from "../lib.mjs";
import { res } from "./res.mjs";

const [kavya, sai] = JSON.parse(readFileSync(process.argv[2], "utf8").trim().split("\n").pop());
const SAI_STUDENT = "03c597aa-cb4d-439e-b50d-10a4848c51c8";
const SCHOOL_B_STUDENT = "7a35d675-2279-49fa-ac82-5e5c76ccfc14";
const M = "Communication", P = "Parent Link (guardian page)", R = "Parent (no login)";
const host = new URL(BASE).hostname;
const withCookie = async (fx) => {
  const page = await newPage(VIEWPORTS.phone375);
  await page.context().addCookies([{ name: fx.cookie, value: fx.key, domain: host, path: "/p" }]);
  return page;
};
const text = async (page) => { await page.waitForLoadState("networkidle").catch(() => {}); await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 30000 }).catch(() => {}); return (await page.locator("body").innerText()).replace(/\s+/g, " "); };

// 1. A new phone (no cookie): verify step; sending the code with no SMS/WhatsApp.
let page = await newPage(VIEWPORTS.phone375);
await page.goto(`${BASE}${kavya.path}`);
let t = await text(page);
res({ module: M, page: P, action: "Open Kavya Reddy's guardian link on a new phone", role: R, expected: "Asks to confirm the phone with a code to the masked registered mobile; no child data", actual: t.slice(0, 250), status: /confirm|code/i.test(t) && /•/.test(t) && !/Kavya/.test(t) ? "PASS" : "FAIL" });
await shot(page, "pl-verify");
const send = page.getByRole("button", { name: /Send|code/i }).first();
if (await send.count()) {
  await send.click();
  await page.waitForTimeout(3000);
  t = await text(page);
  res({ module: M, page: P, action: "Tap Send code when the school has no SMS/WhatsApp", role: R, expected: "Plain: the school cannot send codes, call the school; never 'Code sent'", actual: t.slice(0, 300), status: /cannot send codes|call the school/i.test(t) && !/Code sent/i.test(t) ? "PASS" : "FAIL" });
}
await page.context().close();

// 2. Confirmed phone: the sections.
page = await withCookie(kavya);
await page.goto(`${BASE}${kavya.path}`);
t = await text(page);
await shot(page, "pl-kavya-home");
res({ module: M, page: P, action: "Open Kavya Reddy's link on a confirmed phone (375px)", role: R, expected: "Shows Kavya Reddy, Grade 5 A, and the parts the school switched on", actual: t.slice(0, 400), status: /Kavya/.test(t) ? "PASS" : "FAIL" });
res({ module: M, page: P, action: "Parent Link page at 375px: layout", role: R, expected: "No sideways scroll, every control named", actual: JSON.stringify(await layoutIssues(page)), status: (await layoutIssues(page)).length ? "FAIL" : "PASS" });
for (const [part, re] of [["Fees due", /fee|due|paid|nothing due/i], ["Attendance", /attendance/i], ["Notices", /notice/i], ["Exam datesheet", /datesheet|exam/i], ["Report cards", /report card/i], ["Consent forms", /consent/i], ["PTM", /PTM|meeting|event/i]]) {
  res({ module: M, page: P, action: `Section shown: ${part}`, role: R, expected: `${part} part present (may be empty with a plain note)`, actual: (t.match(new RegExp(`.{0,60}${re.source}.{0,100}`, "i")) ?? ["(not on page)"])[0], status: re.test(t) ? "PASS" : "FAIL" });
}

// 3. Another child's id in the address.
await page.goto(`${BASE}${kavya.path}?child=${SAI_STUDENT}`);
t = await text(page);
res({ module: M, page: P, action: "Change ?child= to Sai Naidu's id on Kavya's link", role: R, expected: "Ignored: still only Kavya's data, no Sai", actual: t.slice(0, 200), status: /Kavya/.test(t) && !/Sai Naidu/.test(t) ? "PASS" : "FAIL" });
await page.goto(`${BASE}${kavya.path}?child=${SCHOOL_B_STUDENT}`);
t = await text(page);
res({ module: M, page: P, action: "Change ?child= to a School B student's id", role: R, expected: "Ignored: only Kavya", actual: t.slice(0, 200), status: /Kavya/.test(t) && !/School B/.test(t) ? "PASS" : "FAIL" });
let r = await page.request.get(`${BASE}${kavya.path}/report-card?child=${SAI_STUDENT}&year=151ceaef-b5c1-4c94-a994-6eee097806af&period=year`);
res({ module: M, page: P, action: "Report card address with Sai Naidu's id on Kavya's link", role: R, expected: "Refused, no PDF", actual: `${r.status()} ${(await r.text()).slice(0, 120)}`, status: r.status() >= 400 && !(r.headers()["content-type"] ?? "").includes("pdf") ? "PASS" : "FAIL" });
r = await page.request.get(`${BASE}${kavya.path}/fees/00000000-0000-4000-8000-000000000000`);
res({ module: M, page: P, action: "Receipt address with a payment id that is not this family's", role: R, expected: "Refused, no PDF", actual: `${r.status()} ${(await r.text()).slice(0, 120)}`, status: r.status() >= 400 ? "PASS" : "FAIL" });
await page.context().close();

// 4. Sai's phone cookie on Kavya's link; a changed token.
page = await newPage(VIEWPORTS.phone375);
await page.context().addCookies([{ name: kavya.cookie, value: sai.key, domain: host, path: "/p" }]);
await page.goto(`${BASE}${kavya.path}`);
t = await text(page);
res({ module: M, page: P, action: "Use Sai's confirmed phone key on Kavya's link", role: R, expected: "Not accepted: asks to confirm the phone", actual: t.slice(0, 200), status: !/Kavya/.test(t) && /confirm|code/i.test(t) ? "PASS" : "FAIL" });
const bad = kavya.path.slice(0, -2) + (kavya.path.endsWith("A") ? "BB" : "AA");
await page.goto(`${BASE}${bad}`);
t = await text(page);
res({ module: M, page: P, action: "Open a link with two characters changed", role: R, expected: "This link does not work; nothing else shown", actual: t.slice(0, 200), status: /does not work/i.test(t) ? "PASS" : "FAIL" });
await page.context().close();
console.log("done");
await close();
