// Time Table: publish (past date refused on the server), then the teacher's own view and permissions.
import { mainText, shot, close, layoutIssues, VIEWPORTS } from "../lib.mjs";
import { res, login, open, messages, sleep } from "./r.mjs";
import { callAction, callFormAction } from "./action.mjs";
import { execFileSync } from "node:child_process";

const Q = "/tmp/claude-0/-home-claude-school-os/3895b89f-1549-5376-9f0c-be97139fc4ec/scratchpad/a3/q.sh";
const sql = (s) => execFileSync(Q, ["CEMS", s]).toString();
const M = "Academic Management", P = "Time Table", R = "Principal";
const F = "src/app/(school)/academic-management/time-table/actions.ts";
const uuidOf = (s) => s.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];

const page = await login("cems.principal");
// Past date through a crafted call
let r = await callFormAction(page, F, "publishAction", { versionId: draft, effectiveFrom: "2026-01-01" });
res(M, P, "Publish with a past effective date (crafted call)", R, "Refused: date cannot be in the past", r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.slice(-200), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
// Teacher tries to publish (crafted)
const teacher = await login("cems.teacher");
r = await callFormAction(teacher, F, "publishAction", { versionId: draft, effectiveFrom: "2026-10-20" });
res(M, P, "Teacher publishes the draft (crafted call)", "Teacher", "Refused", r.text.match(/"message":"[^"]*"/)?.[0] ?? r.text.slice(-200), /"ok":false/.test(r.text) ? "PASS" : "FAIL");
r = await callAction(teacher, F, "startDraftAction", ["151ceaef-b5c1-4c94-a994-6eee097806af"]);
res(M, P, "Teacher starts/discards a draft (crafted call)", "Teacher", "Refused", r.text.slice(-200).replace(/\s+/g, " "), /not allowed|cannot|can't|permission|only/i.test(r.text) ? "PASS" : "FAIL");

// Publish through the screen from today
await open(page, "/academic-management/time-table");
await page.getByRole("button", { name: "Publish", exact: true }).click();
const dlg = page.getByRole("dialog");
console.log((await dlg.innerText()).replace(/\s+/g, " ").slice(0, 600));
const today = "2026-10-16";
await dlg.getByLabel("Effective from").fill(today);
await sleep(500);
await dlg.getByRole("button", { name: /^Publish/ }).last().click();
await sleep(4000);
const msg = (await dlg.isVisible().catch(() => false)) ? (await dlg.innerText()).replace(/\s+/g, " ") : await messages(page);
res(M, P, "Publish the Time Table from today", R, "Published; toast; teachers see it", msg.slice(0, 300), /published/i.test(msg) ? "PASS" : "FAIL");
await shot(page, "tt-published");

// Teacher's own Time Table
await open(teacher, "/academic-management/time-table/mine");
const tt = await mainText(teacher, 3000);
res(M, P, "Teacher sees My Time Table", "Teacher", "Own periods (Science) listed", tt.replace(/\s+/g, " ").slice(0, 300), /Science/.test(tt) ? "PASS" : "FAIL");
await teacher.setViewportSize(VIEWPORTS.phone375);
await open(teacher, "/academic-management/time-table/mine");
const li = await layoutIssues(teacher);
await shot(teacher, "tt-mine-375");
res(M, P, "My Time Table at 375px", "Teacher", "No sideways scroll", li.join("; ") || "no issues", li.length ? "FAIL" : "PASS");
await close();
