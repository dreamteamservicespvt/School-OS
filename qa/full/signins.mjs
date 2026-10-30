// Every sign-in, typed like a person: the 11 school logins (two-step code from the
// server log), mistakes on purpose, sign out; the invite link for newteacher; the
// three console people.   node qa/full/signins.mjs [school|invite|console]
import { readFileSync } from "node:fs";
import { newPage, go, signIn, mainText, shot, logSize, waitLog, saveJson, close, PASSWORD, VIEWPORTS } from "./h.mjs";

const part = process.argv[2] ?? "all";
const res = [];
const rec = (check, pass, note = "") => { res.push({ check, pass, note }); console.log(`${pass ? "PASS" : "FAIL"} ${check}${note ? " :: " + note : ""}`); };
const squeeze = (t) => t.replace(/\s+/g, " ").slice(0, 220);

async function signOut(page) {
  await page.getByRole("button", { name: "Your profile and settings" }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL((u) => u.pathname.startsWith("/sign-in"), { timeout: 30000 }).catch(() => {});
  const out = new URL(page.url()).pathname.startsWith("/sign-in");
  await go(page, "/dashboard");
  return out && new URL(page.url()).pathname.startsWith("/sign-in");
}

if (part === "all" || part === "school") {
  // Mistakes first, on one page.
  const p = await newPage(VIEWPORTS.phone390);
  await go(p, "/sign-in");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.waitForTimeout(800);
  let t = await mainText(p);
  rec("Empty sign-in form shows what is missing", /Enter your mobile number, email or username/.test(t) && /Enter your password/.test(t), "Enter your mobile number, email or username / Enter your password");
  await p.locator("#username").pressSequentially("store", { delay: 10 });
  await p.locator("#password").pressSequentially("wrongpass123", { delay: 10 });
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.getByText(/password is wrong/).waitFor({ timeout: 30000 }).catch(() => {});
  t = await mainText(p);
  rec("Wrong password is refused with a clear message", new URL(p.url()).pathname === "/sign-in" && /The login or password is wrong/.test(t), (t.match(/The login[^\n]*/) ?? [""])[0]);
  await shot(p, "signin-wrong-password-390", false);
  await p.locator("#username").fill("");
  await p.locator("#username").pressSequentially("nobody.here", { delay: 10 });
  await p.locator("#password").fill(""); await p.locator("#password").pressSequentially("whatever123", { delay: 10 });
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.getByText(/password is wrong/).waitFor({ timeout: 30000 }).catch(() => {});
  t = await mainText(p);
  rec("Unknown username gets the same message (does not reveal who exists)", /The login or password is wrong/.test(t), (t.match(/The login[^\n]*/) ?? [""])[0]);
  await p.context().close();

  // Wrong two-step code, then the right one (accountant).
  const q = await newPage();
  await go(q, "/sign-in");
  await q.locator("#username").pressSequentially("accountant", { delay: 10 });
  await q.locator("#password").pressSequentially(PASSWORD, { delay: 5 });
  const from = logSize();
  await q.getByRole("button", { name: "Sign in", exact: true }).click();
  await q.waitForURL((u) => u.pathname.startsWith("/sign-in/code"), { timeout: 60000 }).catch(() => {});
  const m = await waitLog(from, /\[dev\] one-time code[^\n]*: (\d{4,6})/);
  rec("Accountant is asked for a two-step code and it is in the server log", !!m && q.url().includes("/sign-in/code"));
  const wrong = m ? String((Number(m[1]) + 1) % 1000000).padStart(6, "0") : "000000";
  await q.locator("#code").pressSequentially(wrong, { delay: 20 });
  await q.getByRole("button", { name: /Verify and sign in/ }).click().catch(() => {});
  await q.getByText(/code is not right/).waitFor({ timeout: 30000 }).catch(() => {});
  t = await mainText(q);
  rec("Wrong code is refused with a clear message", q.url().includes("/sign-in/code") && /That code is not right\. \d more tries/.test(t), (t.match(/That code[^\n]*/) ?? [""])[0]);
  await q.locator("#code").fill("");
  await q.locator("#code").pressSequentially(m?.[1] ?? "", { delay: 20 });
  await q.getByRole("button", { name: /Verify and sign in/ }).click().catch(() => {});
  await q.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60000 }).catch(() => {});
  rec("Right code after a wrong one signs in", !q.url().includes("/sign-in"), q.url());
  rec("Accountant signs out and /dashboard then asks to sign in", await signOut(q));
  await q.context().close();

  for (const login of ["principal", "admin", "teacher", "subjectteacher", "librarian", "reception", "transport", "warden", "store", "viceprincipal", "driver"]) {
    const pg = await newPage();
    try {
      await signIn(pg, login);
      const tt = await mainText(pg, 400);
      rec(`${login} signs in and lands on ${new URL(pg.url()).pathname}`, !pg.url().includes("/sign-in") && pg.problems.length === 0, squeeze(tt) + (pg.problems.length ? " PROBLEMS " + pg.problems.join("; ") : ""));
      if (login !== "driver") rec(`${login} signs out`, await signOut(pg));
    } catch (e) { rec(`${login} signs in`, false, e.message.slice(0, 200)); }
    await pg.context().close();
  }
}

if (part === "all" || part === "invite") {
  const token = readFileSync("tools/seed.log", "utf8").match(/\/invite\/([A-Za-z0-9_-]+)/)?.[1];
  const p = await newPage(VIEWPORTS.phone390);
  await go(p, `/invite/${token}`);
  let t = await mainText(p);
  rec("Invite link opens for Meena Iyer", /Meena|password/i.test(t), squeeze(t));
  await shot(p, "invite-open-390", false);
  await p.locator("#password").pressSequentially("abc", { delay: 10 });
  await p.locator("#confirm").pressSequentially("abd", { delay: 10 });
  t = await mainText(p);
  rec("Invite: short password and mismatch are shown while typing", /not the same/i.test(t), squeeze(t));
  await p.getByRole("button", { name: /set|save|create|continue/i }).first().click().catch(() => {});
  await p.waitForTimeout(1000);
  rec("Invite: weak password is not accepted", p.url().includes("/invite/"), p.url());
  const NEW = "Meena@Sunrise2026";
  await p.locator("#password").fill(""); await p.locator("#password").pressSequentially(NEW, { delay: 10 });
  await p.locator("#confirm").fill(""); await p.locator("#confirm").pressSequentially(NEW, { delay: 10 });
  await p.getByRole("button", { name: /set|save|create|continue/i }).first().click();
  await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500);
  t = await mainText(p);
  rec("Invite: a good password is saved", !p.url().includes("/invite/") || /signed in|ready|done|sign in/i.test(t), `${p.url()} ${squeeze(t)}`);
  await shot(p, "invite-done-390", false);
  await p.context().close();
  const q = await newPage();
  try { await signIn(q, "newteacher", NEW); rec("newteacher signs in with the new password", !q.url().includes("/sign-in"), q.url()); } catch (e) { rec("newteacher signs in with the new password", false, e.message.slice(0, 200)); }
  await q.context().close();
  const r = await newPage();
  await go(r, `/invite/${token}`);
  t = await mainText(r);
  rec("The used invite link no longer sets a password", !(await r.locator("#confirm").count()), squeeze(t));
  await r.context().close();
}

if (part === "all" || part === "console") {
  for (const [mobile, who] of [["9849012345", "Owner"], ["9849023456", "Onboarding"], ["9849034567", "Support"]]) {
    const p = await newPage();
    await go(p, "/console/sign-in");
    await p.locator("#login").pressSequentially(mobile, { delay: 10 });
    await p.locator("#password").pressSequentially(PASSWORD, { delay: 5 });
    const from = logSize();
    await p.getByRole("button", { name: /sign in|continue|next/i }).first().click();
    const m = await waitLog(from, /code[^\n]*?(\d{6})/);
    await p.waitForTimeout(1000);
    if (!m) { rec(`Console ${who} gets a code`, false, squeeze(await mainText(p))); await p.context().close(); continue; }
    for (let i = 0; i < 6; i++) await p.getByLabel(`Digit ${i + 1}`).pressSequentially(m[1][i]);
    await p.waitForTimeout(500);
    const verify = p.getByRole("button", { name: /verify|sign in|continue/i }).first();
    if (await verify.isVisible().catch(() => false)) await verify.click().catch(() => {});
    await p.waitForURL((u) => !u.pathname.startsWith("/console/sign-in"), { timeout: 60000 }).catch(() => {});
    const t = await mainText(p, 300);
    rec(`Console ${who} (${mobile}) signs in`, !p.url().includes("/sign-in"), `${new URL(p.url()).pathname} ${squeeze(t)}`);
    await shot(p, `console-${who}-home`, false);
    await p.context().close();
  }
}
saveJson(`signins-${part}.json`, res);
console.log(`\n${res.filter((r) => r.pass).length} of ${res.length} passed`);
await close();
