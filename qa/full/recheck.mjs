// After the rebuild: checks the fixed bugs in the browser (docs/qa/2026-10-30-full-test.md, bugs 2-5, 7, 10-14).
//   node qa/full/recheck.mjs
import { as } from "./look.mjs";
import { go, mainText, close, layoutIssues, menu, VIEWPORTS } from "./h.mjs";
const out = [];
const rec = (c, pass, note = "") => { out.push({ c, pass, note }); console.log(`${pass ? "PASS" : "FAIL"} ${c}${note ? " :: " + note : ""}`); };
const squeeze = (t) => t.replace(/\s+/g, " ").slice(0, 220);

// Principal
const p = await as("principal", VIEWPORTS.laptop1280);
const m = await menu(p);
rec("3 Menu says Attendance Management", m.some((i) => i.text === "Attendance Management"), m.map((i) => i.text).join(", "));

await go(p, "/admission-management/applications/new");
const dob = p.getByLabel(/Date of birth/).first();
await dob.click(); await dob.pressSequentially("31-02-2016", { delay: 20 }); await p.keyboard.press("Tab");
await p.waitForTimeout(400);
const alerts = await p.locator("[role=alert]").allInnerTexts();
rec("2 31-02-2016 says the day does not exist", alerts.some((a) => /has no day 31/.test(a)), alerts.join(" | "));
await p.getByRole("button", { name: /^(Save|Save application|Make application)/ }).first().click();
await p.waitForTimeout(2500);
const t4 = await mainText(p, 4000);
rec("4 Please-fix list includes the consent", /data consent/i.test(t4) && /Please fix \d+ things/.test(t4), squeeze(t4.match(/Please fix[\s\S]{0,300}/)?.[0] ?? t4));

p.problems.length = 0;
await go(p, "/fee-management/concessions"); await p.waitForTimeout(1500);
rec("14 Concessions page has no script error", !p.problems.length, p.problems.join(" | "));
await go(p, "/communication/notices");
const notice = await p.locator('main a[href^="/communication/notices/"]').evaluateAll((as) => as.map((a) => [a.getAttribute("href"), a.innerText]).find(([, t]) => /Self-test: Parent-teacher/.test(t))?.[0]);
if (notice) {
  await go(p, notice);
  const t7 = await mainText(p, 20000);
  rec("7 Seen-by rows say whose parent", /(Father|Mother|Guardian) of [A-Z]/.test(t7), squeeze(t7.match(/(Father|Mother) of [^\n]+/)?.[0] ?? ""));
} else rec("7 Seen-by rows say whose parent", false, "self-test notice not found");
await go(p, "/student-management/leaving/alumni");
const lay = await layoutIssues(p);
rec("12 Alumni does not scroll sideways at 1280", !lay.some((l) => /sideways/.test(l)), lay.join(" | "));
await go(p, "/admission-management/decision");
rec("5 No 'With the Principal' label", !/With the Principal/.test(await mainText(p, 20000)));

// Accountant: no links that end on "no access"
const a = await as("accountant", VIEWPORTS.laptop1280);
await go(a, "/events-calendar");
const evLinks = await a.locator('main a[href^="/events-calendar/events/"]').evaluateAll((x) => x.map((e) => e.getAttribute("href")));
let deadEnds = 0;
for (const h of evLinks.slice(0, 5)) { await go(a, h); if (a.url().includes("/no-access")) deadEnds++; }
rec("10 Accountant calendar: no event link ends on no access", deadEnds === 0, `${evLinks.length} links, ${deadEnds} dead ends`);
await go(a, "/inventory-management/purchases/orders/7820f64b-8e2a-4c16-9034-99f82f9958b0");
const itemLinks = await a.locator('main a[href^="/inventory-management/items"]').count();
await go(a, "/inventory-management/reports?r=inv-stock");
const itemLinks2 = await a.locator('main a[href^="/inventory-management/items"]').count();
rec("11 Accountant sees no Items & Stock links", itemLinks + itemLinks2 === 0, `${itemLinks} on the order, ${itemLinks2} on the report`);

// Teacher: same calendar
const t = await as("teacher", VIEWPORTS.laptop1280);
await go(t, "/events-calendar");
rec("10 Teacher calendar has no event links", (await t.locator('main a[href^="/events-calendar/events/"]').count()) === 0);
await go(t, "/communication");
const fileTab = await t.locator("#send-file").getAttribute("tabindex").catch(() => null);
rec("13 Send form file input is out of the Tab order", fileTab === "-1" || !(await t.locator("#send-file").count()), String(fileTab));

// Phone: a card still opens its record, and the Approve button on a card is not inside a link
const ph = await as("principal", VIEWPORTS.phone390);
await go(ph, "/student-management");
const first = ph.locator("main ul li a[aria-label]").first();
const label = await first.getAttribute("aria-label");
await first.click(); await ph.waitForURL(/\/student-management\/students\//, { timeout: 30000 }).catch(() => {});
rec("14 Phone card still opens the student", /\/student-management\/students\//.test(ph.url()), `${label} -> ${new URL(ph.url()).pathname}`);
ph.problems.length = 0;
await go(ph, "/fee-management/concessions"); await ph.waitForTimeout(1500);
const nested = await ph.evaluate(() => [...document.querySelectorAll("a a, a form, a button")].length);
rec("14 Concessions on a phone: no link or button inside a link, no script error", nested === 0 && !ph.problems.length, `${nested} nested, ${ph.problems.join(" | ")}`);

console.log(`\n${out.filter((r) => r.pass).length} of ${out.length} passed`);
await close();
