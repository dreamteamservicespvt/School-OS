// Self-test 14 Nov: a subject teacher (no class of their own) reads the class register only: no Take Attendance
// tab, no mark editing, no daily correction request (commit 5fea18f2).
import { asRole, close, snap, sleep, mainText } from "./nc-h.mjs";
const p = await asRole("subjectteacher");
const go = async (path) => { await p.goto(new URL(path, p.url()).href); await p.waitForLoadState("networkidle").catch(() => {}); await sleep(1200); };
await go("/attendance-management");
const tabs = await p.getByRole("link").allInnerTexts();
console.log("lands on:", new URL(p.url()).pathname, "| Take Attendance tab:", tabs.some((t) => /Take Attendance/i.test(t)));
await go("/attendance-management/register");
const t = await mainText(p, 6000);
console.log("register opens:", !/no access|not allowed/i.test(t), "| edit buttons:", await p.getByRole("button", { name: /Edit|Change mark|Mark (present|absent)/i }).count(), "| correction request:", /Ask for a correction|Request a correction/i.test(t));
await snap(p, "e2e-subject-teacher-register", false);
await go("/attendance-management?tab=take");
console.log("take page by address:", new URL(p.url()).pathname + new URL(p.url()).search, "|", (await mainText(p, 4000)).split("\n").slice(0, 3).join(" / "));
await p.context().close(); await close();
