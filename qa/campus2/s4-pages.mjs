// Staff & HR: every page opens for HR without errors — Staff List, a Staff Profile and its tabs, ID cards,
// Recruitment & Appraisal, Import, HR Settings, Staff Exit list; Staff List shows the count line.
import { asUser, go, mainText, close, record, sleep } from "./util.mjs";
const p = await asUser("cems.hr");
const M = "Staff & HR Management";
await go(p, "/staff-hr-management?q=QA%20Demo%20Staff");
const prof = await p.evaluate(() => [...document.querySelectorAll("main a[href*='/staff-hr-management/']")].map((a) => a.getAttribute("href")).find((x) => /\/staff-hr-management\/[0-9a-f-]{36}$/.test(x)));
const pages = [["Staff List", "/staff-hr-management"], ["Staff Profile", prof], ["Documents & ID Cards", "/staff-hr-management/id-cards"], ["Recruitment & Appraisal", "/staff-hr-management/recruitment"], ["Staff List", "/staff-hr-management/import"], ["HR Settings", "/staff-hr-management/settings"], ["Staff Exit", "/staff-hr-management/exit"]];
for (const [pg, u] of pages) {
  p.problems.length = 0; const res = await go(p, u); await sleep(300); const t = await mainText(p, 2500);
  const extra = pg === "Staff List" && u === "/staff-hr-management" ? ((t.match(/Showing \d+ to \d+ of \d+/) ?? ["no count line"])[0]) : "";
  record({ module: M, page: pg, action: `Open ${u.replace(/[0-9a-f-]{36}/, "<QA Demo Staff id>")}`, role: "HR", expected: "Opens with no errors" + (extra ? "; count 'Showing 1 to 24 of N'" : ""), actual: `${res?.status()} ${extra} ${t.slice(0, 160).replace(/\n/g, " / ")} ${p.problems.join("; ")}`, status: res?.status() === 200 && !p.problems.length && !/Something went wrong/.test(t) && (!extra || /Showing/.test(extra)) ? "PASS" : "FAIL" });
}
// Profile tabs.
await go(p, prof); const tabs = await p.evaluate(() => [...document.querySelectorAll("main [role=tab], main nav a")].map((a) => [a.innerText.trim(), a.getAttribute("href")]).filter((x) => x[0]));
const bad = [];
for (const [name, href] of tabs.slice(0, 12)) { if (!href || !href.includes("tab=")) continue; p.problems.length = 0; const r = await go(p, href); if (r?.status() !== 200 || p.problems.length) bad.push(`${name}: ${r?.status()} ${p.problems.join(";")}`); }
record({ module: M, page: "Staff Profile", action: `Open each profile tab (${tabs.map((t) => t[0]).slice(0, 12).join(", ")})`, role: "HR", expected: "Every tab opens with no errors", actual: bad.join("; ") || "all opened", status: bad.length ? "FAIL" : "PASS" });
await p.context().close(); await close();
