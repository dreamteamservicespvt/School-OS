// Parent Link of a guardian whose only child has left (Harini Inti, transferred):
// the page must not show the child's dues, attendance or marks any more.
//   node qa/people/pl-left.mjs <fixture.json>
import { readFileSync } from "node:fs";
import { newPage, close, shot, BASE, VIEWPORTS } from "../lib.mjs";
import { res } from "./res.mjs";

const [fx] = JSON.parse(readFileSync(process.argv[2], "utf8").trim());
const page = await newPage(VIEWPORTS.phone375);
await page.context().addCookies([{ name: fx.cookie, value: fx.key, domain: new URL(BASE).hostname, path: "/p" }]);
await page.goto(`${BASE}${fx.path}`);
await page.waitForLoadState("networkidle").catch(() => {});
const t = (await page.locator("body").innerText()).replace(/\s+/g, " ");
await shot(page, "pl-left-child");
res({ module: "Communication", page: "Parent Link (guardian page)", action: "Harini Inti's mother opens her Parent Link after Harini is marked left", role: "Parent (no login)", expected: "No child data (fees, attendance, marks); a plain message that no child is studying here", actual: t.slice(0, 300), status: !/₹|Attendance|30,600/.test(t) && /Harini|no child|not studying|no longer/i.test(t) ? "PASS" : !/₹|Attendance/.test(t) ? "PASS" : "FAIL" });
console.log(t.slice(0, 600));
await close();
