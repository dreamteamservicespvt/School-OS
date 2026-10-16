// Auth and sessions, through the real screens:
//  invite a login (Settings, Users), accept the invite, used / invalid invite links,
//  sign in, sign out, sign out everywhere (second browser loses access),
//  password change, wrong passwords and lockout, disable a login.
// Uses its own throwaway login "demo.qa.authNNNN" (SYNTHETIC).
//   node qa/platform/auth.mjs
import { close, BASE, shot } from "../lib.mjs";
import { as, page, signInFast } from "./util.mjs";

const say = (s, m) => console.log(`${s.padEnd(5)} ${m}`);
const n = String(Date.now()).slice(-4);
const NAME = `Demo QA Auth ${n}`;
const PHONE = `90000${String(Date.now()).slice(-5)}`;
const PW1 = "DemoPass#2026a";
const PW2 = "DemoPass#2026b";
const text = async (p) => (await p.locator("main").last().innerText().catch(() => "")).replace(/\s+/g, " ");

// 1. Admin invites a login.
const admin = await as("cems.admin");
await admin.goto(`${BASE}/settings/users/new`);
await admin.getByLabel("Full name").fill(NAME);
await admin.waitForTimeout(300);
const username = await admin.getByLabel("Username").inputValue();
await admin.getByLabel("Phone").fill(PHONE);
const teacher = admin.getByRole("checkbox", { name: /^Teacher\b/ });
if (await teacher.count()) { if (!(await teacher.first().isChecked())) await teacher.first().check(); }
await admin.getByRole("button", { name: "Send invite" }).click();
await admin.waitForTimeout(2500);
let t = await text(admin);
const link = (t.match(/\/invite\/[A-Za-z0-9_-]{20,}/) ?? [])[0] ?? (await admin.locator("a[href*='/invite/'], input[value*='/invite/']").first().evaluate((e) => e.getAttribute("href") ?? e.value).catch(() => null));
say(link ? "PASS" : "FAIL", `invite ${NAME} (${username}): ${t.match(/is invited[^.]*\.[^.]*\./)?.[0] ?? t.slice(0, 200)} link=${link}`);
await shot(admin, "auth-invited");
if (!link) { await close(); process.exit(1); }
const invitePath = link.replace(/^https?:\/\/[^/]+/, "");

// 2. Invalid invite link.
const anon = await page();
await anon.goto(`${BASE}/invite/not-a-real-token-123456789`);
t = await text(anon);
say(/expired|not valid|Ask your School Admin/i.test(t) ? "PASS" : "FAIL", `invalid invite link: ${t.slice(0, 140)}`);

// 3. Accept the invite: weak password first, then a good one.
await anon.goto(BASE + invitePath);
t = await text(anon);
say(/Hello|Choose your own password/.test(t) ? "PASS" : "FAIL", `invite page: ${t.slice(0, 120)}`);
await anon.getByLabel("New password").fill("abc");
await anon.getByLabel("Type it again").fill("abc");
await anon.getByRole("button", { name: /Set|Save|Continue|password/i }).last().click().catch(() => {});
await anon.waitForTimeout(1200);
t = await text(anon);
say(/still needed|at least 8|8 characters/i.test(t) ? "PASS" : "CHECK", `weak password refused: ${t.slice(0, 160)}`);
await anon.getByLabel("New password").fill(PW1);
await anon.getByLabel("Type it again").fill(PW1);
await anon.getByRole("button", { name: /Set|Save|Continue|password/i }).last().click();
await anon.waitForURL((u) => !u.pathname.startsWith("/invite"), { timeout: 15000 }).catch(() => {});
t = await text(anon);
say(/sign-in/.test(anon.url()) ? "PASS" : "CHECK", `after setting password: ${anon.url().replace(BASE, "")} ${t.slice(0, 120)}`);

// 4. Used invite link.
await anon.goto(BASE + invitePath);
t = await text(anon);
say(/expired|used|not valid/i.test(t) ? "PASS" : "FAIL", `used invite link again: ${t.slice(0, 120)}`);
await anon.context().close();

// 5. Two browsers signed in; password change signs the other out.
const b1 = await page(); await signInFast(b1, username, PW1);
const b2 = await page(); await signInFast(b2, username, PW1);
say(!/sign-in/.test(b1.url()) && !/sign-in/.test(b2.url()) ? "PASS" : "FAIL", `new login signs in on two browsers: ${b1.url().replace(BASE, "")} / ${b2.url().replace(BASE, "")}`);
async function changePw(p, current, next) {
  await p.goto(`${BASE}/profile`);
  await p.getByRole("button", { name: "Change password" }).first().click();
  await p.locator("#currentPassword").fill(current);
  await p.locator("#newPassword").fill(next);
  await p.locator("#confirmPassword").fill(next);
  await p.getByRole("dialog").getByRole("button", { name: "Change password" }).click();
  await p.waitForTimeout(1500);
  return (await p.getByRole("dialog").innerText().catch(() => "")).replace(/\s+/g, " ") || (await text(p)).slice(0, 200);
}
t = await changePw(b1, "WrongCurrent#1", PW2);
say(/not right/i.test(t) ? "PASS" : "FAIL", `change password with a wrong current password: ${t.slice(0, 160)}`);
await b1.keyboard.press("Escape");
t = await changePw(b1, PW1, PW2);
say("INFO", `change password: ${t.slice(0, 160)}`);
await b2.goto(`${BASE}/dashboard`); await b2.waitForTimeout(800);
say(/sign-in/.test(b2.url()) ? "PASS" : "FAIL", `other browser after password change: ${b2.url().replace(BASE, "")}`);
await b1.goto(`${BASE}/dashboard`); await b1.waitForTimeout(800);
say(!/sign-in/.test(b1.url()) ? "PASS" : "FAIL", `this browser stays signed in after password change: ${b1.url().replace(BASE, "")}`);
const b3 = await page(); await signInFast(b3, username, PW1);
t = await text(b3);
say(/sign-in/.test(b3.url()) ? "PASS" : "FAIL", `old password no longer works: ${t.match(/(The username|Wrong|not right|does not match)[^.]*\./)?.[0] ?? t.slice(-160)}`);

// 6. Sign out everywhere else.
await signInFast(b2, username, PW2);
await b1.goto(`${BASE}/profile`);
await b1.getByRole("button", { name: "Sign out everywhere else" }).click();
await b1.getByRole("button", { name: /^Sign out \d+ device/ }).click();
await b1.waitForTimeout(1500);
await b2.goto(`${BASE}/dashboard`); await b2.waitForTimeout(800);
say(/sign-in/.test(b2.url()) ? "PASS" : "FAIL", `second browser after "Sign out everywhere else": ${b2.url().replace(BASE, "")}`);
await b1.goto(`${BASE}/dashboard`); await b1.waitForTimeout(800);
say(!/sign-in/.test(b1.url()) ? "PASS" : "FAIL", `first browser stays in: ${b1.url().replace(BASE, "")}`);

// 7. Sign out (menu) ends this session only for this browser.
await signInFast(b2, username, PW2);
const cookiesBefore = await b1.context().cookies();
await b1.goto(`${BASE}/profile`);
await b1.getByRole("button", { name: "Your profile and settings" }).click();
await b1.getByRole("menuitem", { name: /Sign out/ }).first().click().catch(async () => b1.getByRole("button", { name: /^Sign out$/ }).first().click());
await b1.waitForTimeout(1500);
say(/sign-in/.test(b1.url()) ? "PASS" : "FAIL", `sign out from the menu: ${b1.url().replace(BASE, "")}`);
// Replaying the old cookie must not work.
const replay = await page(); await replay.context().addCookies(cookiesBefore);
await replay.goto(`${BASE}/dashboard`); await replay.waitForTimeout(600);
say(/sign-in/.test(replay.url()) ? "PASS" : "FAIL", `old session cookie after sign out: ${replay.url().replace(BASE, "")}`);
await b2.goto(`${BASE}/dashboard`); await b2.waitForTimeout(600);
say(!/sign-in/.test(b2.url()) ? "PASS" : "FAIL", `other browser still in after a plain sign out: ${b2.url().replace(BASE, "")}`);

// 8. Wrong passwords and lockout.
const w = await page();
for (let i = 1; i <= 5; i++) {
  await signInFast(w, username, `Wrong#${i}x2026`);
  t = await text(w);
  say("INFO", `wrong password ${i}: ${t.match(/(The username[^.]*\.|Too many[^.]*\.[^.]*\.|[^.]*more wrong[^.]*\.|[^.]*locked[^.]*\.)/g)?.join(" ") ?? t.slice(-150)}`);
}
await signInFast(w, username, PW2);
t = await text(w);
say(/locked/i.test(t) && /sign-in/.test(w.url()) ? "PASS" : "FAIL", `right password while locked: ${t.match(/[^.]*locked[^.]*\./)?.[0] ?? t.slice(-150)}`);
await b2.goto(`${BASE}/dashboard`); await b2.waitForTimeout(600);
say("INFO", `an existing session while the login is locked: ${b2.url().replace(BASE, "")}`);

// 9. Admin switches the login off: its sessions end.
await admin.goto(`${BASE}/settings/users?q=${encodeURIComponent(username)}`);
await admin.waitForTimeout(800);
await admin.getByRole("link", { name: new RegExp(NAME) }).first().click();
await admin.waitForURL(/\/settings\/users\/[0-9a-f-]{36}/, { timeout: 15000 });
await admin.getByRole("button", { name: "Disable", exact: true }).click();
await admin.getByRole("button", { name: `Disable ${NAME}` }).click();
await admin.waitForTimeout(1500);
say("INFO", `after disable: ${(await text(admin)).match(/[^.]*(disabled|switched off)[^.]*\./i)?.[0] ?? ""}`);
await b2.goto(`${BASE}/dashboard`); await b2.waitForTimeout(600);
say(/sign-in/.test(b2.url()) ? "PASS" : "FAIL", `the disabled login's open session: ${b2.url().replace(BASE, "")}`);
const d = await page(); await signInFast(d, username, PW2);
t = await text(d);
say(/sign-in/.test(d.url()) ? "PASS" : "FAIL", `disabled login signs in: ${t.match(/[^.]*(switched off|locked)[^.]*\./)?.[0] ?? t.slice(-120)}`);
await close();
