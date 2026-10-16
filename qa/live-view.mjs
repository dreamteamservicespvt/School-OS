// Records a laptop-size (1440 x 900) video of a real QA pass so a person can
// watch how the testing is done. A caption bar at the bottom of the screen
// says which role is signed in, what is being checked and whether it passed.
//
//   QA_URL=http://localhost:3000 QA_OUT=qa-output/live node qa/live-view.mjs
//
// It only reads and opens forms (nothing is saved), so it can run while the
// other QA scripts are changing the demo school.
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BASE, PASSWORD } from "./lib.mjs";

const OUT = process.env.QA_OUT ?? path.resolve("qa-output/live");
const EXEC = process.env.QA_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const size = { width: 1440, height: 900 };
mkdirSync(OUT, { recursive: true });

const overlay = () => {
  const draw = () => {
    if (!document.body) return;
    let bar = document.getElementById("qa-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "qa-bar";
      bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;font:600 17px system-ui,sans-serif;color:#fff;background:rgba(20,24,36,.92);padding:12px 20px;display:flex;gap:14px;align-items:center;pointer-events:none";
      document.body.appendChild(bar);
    }
    const s = JSON.parse(sessionStorage.getItem("qa-cap") || "{}");
    const tone = s.verdict === "PASS" ? "#1f9d55" : s.verdict === "FAIL" ? "#d64545" : "#c98a00";
    bar.innerHTML = `<span style="background:#2d4fa3;padding:3px 10px;border-radius:6px">QA · ${s.role ?? ""}</span><span style="flex:1">${s.text ?? ""}</span>` +
      (s.verdict ? `<span style="background:${tone};padding:3px 12px;border-radius:6px">${s.verdict}</span>` : "");
  };
  window.__qaDraw = draw;
  document.addEventListener("DOMContentLoaded", draw);
  setInterval(draw, 300);
  // Shows each click as a ring, so the viewer sees where the tester clicked.
  document.addEventListener("pointerdown", (e) => {
    const r = document.createElement("div");
    r.style.cssText = `position:fixed;left:${e.clientX - 18}px;top:${e.clientY - 18}px;width:36px;height:36px;border:3px solid #f0b400;border-radius:50%;z-index:2147483647;pointer-events:none`;
    document.body.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }, true);
};

const steps = [];
let part = 0;
const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });

async function session(role, login, fn) {
  const context = await browser.newContext({ viewport: size, recordVideo: { dir: OUT, size } });
  await context.addInitScript(overlay);
  const page = await context.newPage();
  const cap = async (text, verdict) => {
    await page.evaluate(([c]) => { sessionStorage.setItem("qa-cap", JSON.stringify(c)); window.__qaDraw?.(); }, [{ role, text, verdict }]).catch(() => {});
    if (verdict) steps.push({ role, check: text, verdict, at: new Date().toISOString() });
    await page.waitForTimeout(verdict ? 1800 : 900);
  };
  const open = async (url) => { await cap(`Opening ${url}`); await page.goto(`${BASE}${url}`); await page.waitForLoadState("networkidle").catch(() => {}); };
  await open("/sign-in");
  await cap(`Signing in as ${login}`);
  await page.getByLabel(/username|mobile|login/i).first().pressSequentially(login, { delay: 40 });
  await page.getByLabel(/password/i).first().pressSequentially(PASSWORD, { delay: 30 });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 20000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
  await cap(`Signed in as ${login}`, page.url().includes("/sign-in") ? "FAIL" : "PASS");
  try { await fn(page, cap, open); } catch (e) { await cap(`Stopped: ${String(e.message).split("\n")[0].slice(0, 90)}`, "FAIL"); }
  const video = page.video();
  await context.close();
  part += 1;
  await video?.saveAs(path.join(OUT, `part-${part}.webm`));
  await video?.delete();
}

const body = (page) => page.locator("main").innerText().catch(() => "");

await session("Principal", "cems.principal", async (page, cap, open) => {
  await cap("Dashboard loads with today's numbers");
  await page.mouse.wheel(0, 600); await page.waitForTimeout(1200); await page.mouse.wheel(0, -600);
  await cap("Dashboard opened without errors", (await body(page)).length > 200 ? "PASS" : "FAIL");
  await open("/student-management");
  await cap("Student list: searching for a demo student");
  const search = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i)).first();
  if (await search.count()) { await search.pressSequentially("Aarav", { delay: 80 }); await page.waitForTimeout(1500); }
  await cap("Search finds the synthetic student Aarav Kumar", /Aarav/.test(await body(page)) ? "PASS" : "FAIL");
});

await session("Accountant", "cems.accountant", async (page, cap, open) => {
  await open("/fee-management");
  await cap("Fee Management opens for the accountant", /fee/i.test(await body(page)) ? "PASS" : "FAIL");
  await page.mouse.wheel(0, 500); await page.waitForTimeout(1200);
  await open("/salary-management");
  await cap("Accountant can open Salary Management", /salary|pay/i.test(await body(page)) ? "PASS" : "FAIL");
});

await session("Class teacher", "cems.classteacher", async (page, cap, open) => {
  await open("/attendance-management");
  await cap("Attendance opens for the class teacher", /attendance/i.test(await body(page)) ? "PASS" : "FAIL");
  await open("/salary-management");
  await page.mouse.wheel(0, 400); await page.waitForTimeout(1000);
  const t = await body(page);
  await cap("Teacher opens Salary: sees only their own slips, nobody else's", page.url().includes("mine=1") && /Only your own slips/.test(t) ? "PASS" : "FAIL");
  await open("/fee-management");
  await cap("Teacher tries Fee Management: must be refused", /not allow|no access|not open|ask your/i.test(await body(page)) || page.url().includes("no-access") ? "PASS" : "FAIL");
});

await session("School B admin", "qab.admin", async (page, cap, open) => {
  await open("/student-management");
  const search = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i)).first();
  if (await search.count()) { await search.pressSequentially("Aarav Kumar", { delay: 80 }); await page.waitForTimeout(1500); }
  const t = await body(page);
  // School B has its own made-up "Aarav Kumar" on purpose: the same name must
  // only ever show School B's record, never Chaitanya's.
  await cap("School B searches the same name: only its own student, none of Chaitanya's", /QAB\//.test(t) && /Showing 1 of 1/.test(t) ? "PASS" : "FAIL");
});

await browser.close();
writeFileSync(path.join(OUT, "steps.json"), JSON.stringify(steps, null, 2));
console.log(steps.map((s) => `${s.verdict}  ${s.role}: ${s.check}`).join("\n"));
