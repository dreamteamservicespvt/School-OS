// Layman E: the new LE user signs in, changes the password (wrong current first), signs out, signs in with the new one,
// opens admin pages by address, then tries Forgot password.
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { go, snap, note, close, sleep, mainText, newPage, signIn, BASE, pageState } = await import("../full/selftest-A-h.mjs");
const { logSize, waitLog } = await import("../full/h.mjs");
const fs = await import("node:fs");
const U = JSON.parse(fs.readFileSync(`${process.env.QA_OUT}/le-user.json`, "utf8"));
const settle = async (p) => { await sleep(600); for (let i = 0; i < 40; i++) { const busy = await p.locator('button[aria-busy="true"], button:has(.animate-spin)').count(); if (!busy) break; await sleep(500); } await sleep(800); };
const step = async (p, label, n = 1500) => { await settle(p); const t = (await mainText(p, 5000)); note("pw", `\n--- ${label} [${p.url().replace(BASE, "")}]\n${t}\nPROBLEMS: ${p.problems.join(" ; ")}`); await snap(p, `pw-${label}`, false); console.log(`--- ${label} [${p.url().replace(BASE, "")}]\n${t.slice(0, n)}`); return t; };
const p = await newPage({ width: 1440, height: 900 });
await signIn(p, U.username, U.pw);
await step(p, "01-signed-in", 300);
await go(p, "/profile"); await settle(p);
const btn = p.getByRole("button", { name: /^Change password$/ });
if (await btn.count() > 1 || !(await p.locator("#currentPassword").count())) { await btn.first().click(); await settle(p); }
await p.locator("#currentPassword").fill("WrongPass123");
const NEW = U.pw + "Z9";
await p.locator("#newPassword").fill(NEW); await p.locator("#confirmPassword").fill(NEW);
await p.getByRole("button", { name: /^Change password$/ }).last().click(); await step(p, "02-wrong-current", 600);
const box = await p.locator("#currentPassword").evaluate((e) => e.closest("form")?.innerText ?? "").catch(() => "(form gone)");
console.log("FORM:", box.replace(/\n+/g, " | "));
await p.locator("#currentPassword").fill(U.pw);
await p.locator("#newPassword").fill("password1"); await p.locator("#confirmPassword").fill("password1");
await p.getByRole("button", { name: /^Change password$/ }).last().click(); await settle(p);
console.log("COMMON:", (await p.locator("#newPassword").evaluate((e) => e.closest("form")?.innerText ?? "").catch(() => "(form gone)")).replace(/\n+/g, " | "));
await p.locator("#currentPassword").fill(U.pw);
await p.locator("#newPassword").fill(NEW); await p.locator("#confirmPassword").fill(NEW);
await p.getByRole("button", { name: /^Change password$/ }).last().click(); await settle(p);
const after = await step(p, "03-changed", 200);
console.log("AFTER URL", p.url(), " msg:", (await p.locator('[role="status"], [role="alert"]').allInnerTexts()).join(" | "));
// admin pages by address
for (const u of ["/settings", "/settings/users", "/inventory-management", "/reports-analytics", "/fee-management"]) { await go(p, u); const s = await pageState(p); console.log("URL", u, "->", s.path, s.refused ? "REFUSED" : "OPEN", s.h1); }
fs.writeFileSync(`${process.env.QA_OUT}/le-user.json`, JSON.stringify({ ...U, pw: NEW, oldpw: U.pw }));
// sign out via the menu
await go(p, "/dashboard");
await p.getByRole("button", { name: /LE|Tester|account|profile/i }).last().click().catch(() => {});
await sleep(800);
const so = p.getByRole("menuitem", { name: /Sign out/i }).or(p.getByRole("button", { name: /Sign out/i })).or(p.getByRole("link", { name: /Sign out/i })).first();
await so.click().catch((e) => console.log("no sign out:", e.message.split("\n")[0]));
await sleep(2000); console.log("after sign out:", p.url());
await go(p, "/dashboard"); console.log("dashboard after sign out ->", p.url());
await p.goBack().catch(() => {}); await sleep(1000); console.log("back after sign out ->", p.url(), (await mainText(p, 200)).replace(/\n/g, " | "));
// old password refused, new works
await go(p, "/sign-in");
await p.locator("#username").fill(U.username); await p.locator("#password").fill(U.pw);
await p.getByRole("button", { name: "Sign in", exact: true }).click(); await sleep(3000);
console.log("OLD PW:", p.url(), (await mainText(p, 400)).replace(/\n/g, " | "));
// forgot password
await go(p, "/sign-in");
await p.getByRole("link", { name: /Forgot password/i }).first().click(); await settle(p);
await step(p, "10-forgot", 800);
await close();
