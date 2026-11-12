// Layman E: admin invites a new LE user (bad values first), the new person sets a password,
// changes it in My profile, signs out, uses Forgot password. The admin then disables the login.
process.env.QA_OUT ??= "D:/all/Projects/School-OS/qa-output/layman-e";
const { asRole, go, snap, note, close, sleep, mainText, newPage, BASE } = await import("../full/selftest-A-h.mjs");
const { logSize, waitLog } = await import("../full/h.mjs");
const a = await asRole("admin");
const settle = async (p) => { await sleep(600); for (let i = 0; i < 40; i++) { const busy = await p.locator('button[aria-busy="true"], button:has(.animate-spin)').count(); if (!busy) break; await sleep(500); } await sleep(800); };
const step = async (p, label) => { await settle(p); const t = (await mainText(p, 4000)); note("user", `\n--- ${label} [${p.url().replace(BASE, "")}]\n${t}\nPROBLEMS: ${p.problems.join(" ; ")}`); await snap(p, `user-${label}`, false); console.log(`--- ${label} [${p.url().replace(BASE, "")}]\n${t.slice(0, 900)}`); return t; };
await go(a, "/settings/users/new"); await settle(a);
const send = () => a.getByRole("button", { name: /Send invite/ });
await send().click(); await step(a, "01-empty");
await a.getByLabel("Full name").fill("LE-" + "క".repeat(150));
await a.getByLabel("Phone", { exact: false }).first().fill("12ab");
await send().click(); await step(a, "02-long-badphone");
const n = String(Date.now()).slice(-5);
await a.getByLabel("Full name").fill(`LE కిరణ్ Tester ${n}`);
console.log("username made:", await a.getByLabel("Username").inputValue());
await a.getByLabel("Username").fill(`le.tester${n}`);
await a.getByLabel("Phone", { exact: false }).first().fill(`90000${n}`);
await a.getByText(/^Librarian$/).first().click().catch(async () => { await a.getByLabel(/Librarian/).first().check(); });
const from = logSize();
await send().dblclick(); const t3 = await step(a, "03-sent");
const m = await waitLog(from, /\[dev\] invite link[^\n]*: (http\S+)/, 15000);
console.log("invite:", Boolean(m));
const links = (await import("node:fs")).readFileSync(process.env.QA_SERVER_LOG ?? "tools/app.log", "utf8").slice(from).match(/\[dev\] invite link[^\n]*/g) ?? [];
console.log("invite log lines after double click:", links.length);
note("user", `USER le.tester${n} phone 90000${n} invites=${links.length}`);
if (!m) { await close(); process.exit(); }
// the new person
const u = await newPage({ width: 390, height: 844 });
await go(u, m[1]); await step(u, "10-invite-page");
await u.locator("#password").fill("abc"); await u.locator("#confirm").fill("abd"); await step(u, "11-weak-mismatch");
const NEWPW = `Le!Test${n}x`;
await u.locator("#password").fill(NEWPW); await u.locator("#confirm").fill(NEWPW);
await u.getByRole("button", { name: /Set my/ }).click(); await step(u, "12-set");
console.log("after set url:", u.url());
(await import("node:fs")).writeFileSync(`${process.env.QA_OUT}/le-user.json`, JSON.stringify({ username: `le.tester${n}`, pw: NEWPW, phone: `90000${n}` }));
await close();
