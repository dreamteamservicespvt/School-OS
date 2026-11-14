// Layman loop: a brand-new school on day one, on the local build only.
//   MSYS_NO_PATHCONV=1 QA_SERVER_LOG=tools/app.log node qa/loop/new-school.mjs <school name> <admin mobile>
// 1. DREAM TEAM adds the school in the console (owner, demo login), 2. the first School Admin opens the
// invite from the server log (test mode: nothing is sent), sets the project's demo password, 3. lands on
// their first screen. Saves the session as role "dayone" for qa/loop/shots.mjs, and phone screenshots
// of every step to qa-output/loop/day1-*.png.
import path from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { newPage, mainText, sleep, close } from "../full/h.mjs";
import { OUTA } from "../layman/nc-h.mjs";

const [name = "Day One Test School", mobile = "9876501415"] = process.argv.slice(2);
const LOG = process.env.QA_SERVER_LOG;
import { randomBytes } from "node:crypto";
const PASSWORD = process.env.QA_PASSWORD;
// The new school admin's own test password (the demo one is refused as too common): random, kept only in
// qa-output/loop/day1-login.txt (not in git), never printed.
const NEWPASS = process.env.DAYONE_PASSWORD ?? `Kd${randomBytes(6).toString("hex")}#7`;
const OUT = path.resolve("qa-output/loop");
const logSize = () => readFileSync(LOG, "utf8").length;
async function waitLog(from, re, ms = 40000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = readFileSync(LOG, "utf8").slice(from).match(new RegExp(re.source, re.flags.replace("g", "")));
    if (m) return m;
    await sleep(800);
  }
  return null;
}
const PHONE = { width: 390, height: 844 };
let step = 0;
const shot = async (p, what) => { step++; await p.screenshot({ path: path.join(OUT, `day1-${String(step).padStart(2, "0")}-${what}.png`), fullPage: true }).catch(() => {}); console.log(`shot ${step} ${what}: ${(await mainText(p, 220).catch(() => "")).replace(/\n/g, " | ")}`); };

// The console writes its messages to the log as JSON in development; the invite text holds the /i/<token> link.
const INVITE = /"text":"[^"]*?(https?:\/\/[^ "]*\/i\/[A-Za-z0-9_-]+)/g;
// 1. Console: add the school (REUSE=1: take the last invite in the log instead).
let invite = null;
if (process.env.REUSE === "1") { invite = [...readFileSync(LOG, "utf8").matchAll(INVITE)].at(-1) ?? null; }
if (!invite) {
const c = await newPage({ width: 1440, height: 900 });
await c.goto("http://localhost:3000/console/sign-in");
await c.locator("#login").pressSequentially("9849012345", { delay: 10 });
await c.locator("#password").pressSequentially(PASSWORD, { delay: 5 });
let from = logSize();
await c.getByRole("button", { name: /sign in|continue|next/i }).first().click();
const code = await waitLog(from, /code[^\n]*?(\d{6})/);
if (!code) throw new Error(`no console code: ${await mainText(c, 300)}`);
await sleep(1000);
for (let i = 0; i < 6; i++) await c.getByLabel(`Digit ${i + 1}`).pressSequentially(code[1][i]);
await sleep(500);
const verify = c.getByRole("button", { name: /verify|sign in|continue/i }).first();
if (await verify.isVisible().catch(() => false)) await verify.click().catch(() => {});
await c.waitForURL((u) => !u.pathname.startsWith("/console/sign-in"), { timeout: 60000 });
await c.goto("http://localhost:3000/console/schools/new");
await c.locator("#ad-name").fill(name);
await c.locator("#ad-city").fill("Kakinada");
for (const id of ["#ad-state", "#ad-board", "#ad-type"]) {
  const tag = await c.locator(id).evaluate((e) => e.tagName);
  if (tag === "SELECT") {
    const opts = await c.locator(`${id} option`).evaluateAll((os) => os.map((o) => o.value).filter(Boolean));
    await c.locator(id).selectOption(id === "#ad-state" && opts.includes("Andhra Pradesh") ? "Andhra Pradesh" : opts[0]);
  }
}
await c.getByRole("radio", { name: /Day school/ }).first().click().catch(async () => { await c.getByText("Day school", { exact: true }).first().click(); });
await c.locator("#ad-phone").fill("9876500001");
await c.locator("#ad-admin").fill("Lakshmi Devi");
await c.locator("#ad-mobile").fill(mobile);
from = logSize();
await c.getByRole("button", { name: "Create School and Send Invite" }).click();
await sleep(1200);
await c.getByRole("dialog").getByRole("button", { name: "Create School and Send Invite" }).click();
await c.waitForLoadState("networkidle").catch(() => {});
await sleep(2500);
const after = await mainText(c, 8000);
console.log("console after create:", after.split("\n").filter((l) => /^(Enter|Choose|Pick|Type|Fix|This |A |The |There )/.test(l) && l.length < 180).slice(0, 8).join(" | "), "| at", new URL(c.url()).pathname);
await c.screenshot({ path: path.join(OUT, "day1-00-console.png"), fullPage: true });
invite = await waitLog(from, INVITE);
if (!invite) throw new Error("no invite link in the server log");
await c.context().close();
}

// 2. The first School Admin opens the invite on a phone.
const p = await newPage(PHONE, { isMobile: true, hasTouch: true });
await p.goto(invite[1]);
await p.waitForLoadState("networkidle").catch(() => {});
await shot(p, "invite");
// The invite asks for a code sent to the phone first, then a password.
const sendCode = p.getByRole("button", { name: /Send the code/i });
if (await sendCode.isVisible().catch(() => false)) {
  const f = logSize();
  await sendCode.click();
  const m = await waitLog(f, /\[dev\] one-time code for x+\d{4} \([^)]*\): (\d{6})/);
  if (!m) throw new Error("no invite code in the log");
  await sleep(800);
  await shot(p, "code-asked");
  const box = p.getByLabel(/6-digit code|code/i).first();
  if (await box.isVisible().catch(() => false)) await box.pressSequentially(m[1], { delay: 30 });
  else for (let i = 0; i < 6; i++) await p.getByLabel(`Digit ${i + 1}`).pressSequentially(m[1][i]);
  await sleep(600);
  const go = p.getByRole("button", { name: /verify|check|continue|next/i }).first();
  if (await go.isVisible().catch(() => false)) await go.click().catch(() => {});
  await p.waitForLoadState("networkidle").catch(() => {});
  await sleep(1500);
  await shot(p, "after-code");
}
const pw = p.locator('input[type="password"]');
const n = await pw.count();
for (let i = 0; i < n; i++) await pw.nth(i).fill(NEWPASS);
await shot(p, "password-typed");
await p.locator('form button[type="submit"]').last().click();
await p.waitForLoadState("networkidle").catch(() => {});
await sleep(3000);
let from = 0;
if (new URL(p.url()).pathname.startsWith("/sign-in")) {
  // Some flows ask to sign in with the new password.
  await p.locator("#username").pressSequentially(mobile, { delay: 10 });
  await p.locator("#password").pressSequentially(NEWPASS, { delay: 5 });
  from = logSize();
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await sleep(2500);
  if (new URL(p.url()).pathname.startsWith("/sign-in/code")) {
    const m = await waitLog(from, /\[dev\] one-time code for x+\d{4} \(sign-in\): (\d{6})/);
    if (m) { await p.getByLabel("6-digit code").pressSequentially(m[1], { delay: 30 }); await sleep(3000); }
  }
}
await shot(p, "first-screen");
await p.context().storageState({ path: path.join(OUTA, "state-dayone.json") });
writeFileSync(path.join(OUT, "day1-login.txt"), `${name}\n${mobile}\n`);
console.log("now at", new URL(p.url()).pathname);
await close();
