// Self-test B recheck after the 16:50 rebuild: B1-B8 at 390 px, light + dark. Sessions reused.
//   MSYS_NO_PATHCONV=1 node qa/full/selftest-B-recheck.mjs [part]
import { asB, go, mainText, close, sleep, PHONE, DESK, snap, rec, phoneCheck } from "./selftest-B-h.mjs";
import { launch } from "../lib.mjs";
const only = process.argv[2];
const flat = async (p, n = 3000) => (await mainText(p, n)).replace(/\n+/g, " | ");
const run = async (name, fn) => { if (only && only !== name) return; try { await fn(); } catch (e) { rec(`${name}: script error`, false, String(e.message).split("\n")[0]); } };

await run("fee", async () => {
  for (const [scheme, sid] of [["light", "b03365a7-1cd2-451f-ad5e-22f44c6361bf"], ["dark", "552009cd-9b73-49f0-95e2-7403cba5f288"]]) {
    const p = await asB("accountant", PHONE, scheme);
    await go(p, `/fee-management/collect/${sid}`); await sleep(1500);
    const link = p.getByRole("button", { name: /Discount, waiver, date or note|Date or note/ }).first();
    const lb = await link.boundingBox();
    rec(`B2 ${scheme}: discount link at least 40px`, !!lb && lb.height >= 40, JSON.stringify(lb && Math.round(lb.height)));
    const amt = p.locator("#pay-amt"); await amt.scrollIntoViewIfNeeded(); await amt.fill(""); await sleep(400);
    const btn = p.locator("form button[type=submit]").first();
    const bt = (await btn.innerText()).trim(); const op = await btn.evaluate((b) => getComputedStyle(b).opacity);
    rec(`B3 ${scheme}: empty amount button dimmed and says Enter the amount`, /Enter the amount/.test(bt) && Number(op) < 1, `"${bt}" opacity ${op}`);
    await snap(p, `re-fee-${scheme}-empty`);
    await amt.fill(""); await amt.pressSequentially("500", { delay: 20 });
    await p.getByRole("radio", { name: "Cash", exact: true }).tap();
    await p.getByRole("button", { name: /^Collect ₹/ }).first().tap(); await sleep(9000);
    const d = (await p.getByRole("dialog").last().innerText().catch(() => "")).replace(/\n+/g, " | ");
    rec(`B1 ${scheme}: receipt words honest in Test mode`, /Test mode/.test(d) && !/got the receipt/.test(d), d.slice(0, 220));
    await snap(p, `re-fee-${scheme}-receipt`);
    const c = await phoneCheck(p); rec(`fee ${scheme}: no sideways scroll`, c.scrollWidth <= 390, String(c.scrollWidth));
    await p.context().close();
  }
});

await run("marks", async () => {
  for (const scheme of ["light", "dark"]) {
    const p = await asB("teacher", PHONE, scheme);
    await go(p, "/examination-results/marks/dceaeaa4-bd1d-445d-9f50-56e5614ddc19/3f6b76ae-e96a-4b9d-917b-c977c3b649fc"); await sleep(2500);
    await p.getByLabel("Go to student").selectOption("0"); await sleep(500);
    const internal = p.getByRole("button", { name: /^Internal \/ 20/ }).first();
    await internal.scrollIntoViewIfNeeded(); await internal.tap(); await sleep(300);
    const was = (await internal.innerText()).replace(/\s+/g, " ");
    await snap(p, `re-marks-${scheme}-chosen`);
    const k = (x) => p.getByRole("button", { name: x, exact: true }).first();
    const target = scheme === "light" ? ["1", "5"] : ["1", "8"];
    for (const x of target) { await k(x).tap(); await sleep(150); }
    const v = (await internal.innerText()).replace(/\s+/g, " ");
    rec(`B4 ${scheme}: key replaces the mark in a chosen box`, new RegExp(`/ 20 ${target.join("")}$`).test(v.trim()), `before "${was}" after "${v}"`);
    await p.getByRole("button", { name: /Save now/ }).tap(); await sleep(3500);
    const bar = (await p.locator("[aria-live=polite]").filter({ hasText: /Save now/ }).first().innerText()).replace(/\s+/g, " ");
    rec(`B4 ${scheme}: phone shows the save line`, /saved|Saving/i.test(bar), bar.slice(0, 100));
    await snap(p, `re-marks-${scheme}-saved`);
    await p.context().close();
  }
});

await run("attendance", async () => {
  // Today is locked at 11:00; the School Admin moves the lock for the run and puts it back.
  const adm = await asB("admin", DESK);
  const setLock = async (v) => { await go(adm, "/attendance-management/settings?tab=late"); await sleep(1500); const b = adm.getByLabel(/Attendance locks at/).first(); const old = await b.inputValue(); await b.fill(v); await b.press("Tab").catch(() => {}); await adm.getByRole("button", { name: "Save late rules" }).click(); await sleep(3000); console.log("lock", old, "->", v); return old; };
  const old = await setLock("23:30");
  try {
    for (const scheme of ["light", "dark"]) {
      const p = await asB("teacher", PHONE, scheme);
      await go(p, "/attendance-management"); await sleep(2500);
      const note = p.locator("main button", { hasText: /Add note/ }).first();
      const nb = await note.boundingBox();
      rec(`B5 ${scheme}: Add note at least 40px`, !!nb && nb.height >= 40, JSON.stringify(nb && Math.round(nb.height)));
      const save = p.getByRole("button", { name: /^Save attendance|^Saved/ }).first();
      if (/^Save attendance/.test(await save.innerText())) { await save.tap(); await sleep(4000); }
      const st = await save.evaluate((b) => { const cs = getComputedStyle(b); return { color: cs.color, bg: cs.backgroundColor, op: cs.opacity, text: b.innerText.trim() }; });
      const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = (c) => { const [r, g, b] = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const L1 = lum(rgb(st.color)), L2 = lum(rgb(st.bg)); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      rec(`B5 ${scheme}: Saved bar contrast >= 4.5`, /Saved/.test(st.text) && ratio >= 4.5 && Number(st.op) === 1, `${st.text} ${st.color} on ${st.bg} ratio ${ratio.toFixed(2)} opacity ${st.op}`);
      await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await sleep(400);
      await snap(p, `re-att-${scheme}-saved`);
      await p.context().close();
    }
  } finally { await setLock(old || "11:00"); }
});

await run("register", async () => {
  const p = await asB("admin", DESK);
  await go(p, "/attendance-management/register?section=528c10a8-b5b3-437d-8c82-21b1dea7daec&month=2026-11"); await sleep(2500);
  const t = await p.evaluate(() => document.querySelector("main").innerText);
  const before = t.match(/Ananya Verma, (2|3|9|10|11) November 2026: [^\n]*/g) ?? [];
  rec("B7: 5 B register shows Ananya as not in this section yet before the move", before.length > 0 && before.every((l) => /not in this section yet/.test(l)), before.slice(0, 3).join(" / "));
  console.log("5B header:", (t.match(/Class 5 B · [^\n]*/) ?? [""])[0]);
  await snap(p, "re-register-5B", true);
  await go(p, "/attendance-management/register?section=47cfe8fa-64c4-4d99-8225-91808e82644c&month=2026-11"); await sleep(2500);
  const a = await p.evaluate(() => document.querySelector("main").innerText);
  rec("B7: 5 A register keeps her November marks", /Ananya Verma, 11 November 2026: (Present|Absent|Late)/.test(a), (a.match(/Ananya Verma, 11 November 2026: [^\n]*/) ?? ["(no row)"])[0]);
  await p.context().close();
});

await run("forms", async () => {
  for (const scheme of ["light", "dark"]) {
    const p = await asB("admin", PHONE, scheme);
    for (const [name, url, btn] of [
      ["Change section", "/student-management/students/0fc75c33-d253-4aec-a319-cb4f85698334/section", "Change section"],
      ["Counselling note", "/student-management/behaviour/counselling/new", null],
      ["Behaviour incident", "/student-management/behaviour/new", null],
    ]) {
      await go(p, url); await sleep(2000);
      const b = btn ? p.getByRole("button", { name: btn }).last() : p.locator("main form button[type=submit]").first();
      if (!(await b.isVisible().catch(() => false))) { rec(`B8 ${scheme}: ${name}`, false, `no submit button at ${new URL(p.url()).pathname}: ${await flat(p, 300)}`); continue; }
      await b.tap(); await sleep(1200);
      const bad = await p.evaluate(() => document.querySelectorAll("[aria-invalid=true]").length);
      const msgs = await p.evaluate(() => [...document.querySelectorAll("[data-field] p.text-bad")].map((x) => x.innerText).slice(0, 3));
      rec(`B8 ${scheme}: ${name} empty submit shows our own message`, bad > 0 && msgs.length > 0, `${bad} red boxes: ${msgs.join(" / ")}`);
      await snap(p, `re-form-${scheme}-${name.replace(/\s+/g, "-").toLowerCase()}`);
    }
    await p.context().close();
  }
});

await run("forgot", async () => {
  for (const scheme of ["light", "dark"]) {
    const ctx = await (await launch()).newContext({ ...PHONE, colorScheme: scheme });
    const p = await ctx.newPage();
    const tryLogin = async (login) => {
      await go(p, "/sign-in"); await sleep(800);
      await p.getByRole("button", { name: /Forgot password/ }).tap(); await sleep(300);
      await p.locator("#username").fill(login);
      await p.getByRole("button", { name: "Send code" }).tap();
      await p.waitForURL(/\/sign-in\/code/, { timeout: 20000 }).catch(() => {});
      await sleep(1500);
      return { path: new URL(p.url()).pathname, text: await flat(p, 1500) };
    };
    const u = await tryLogin(`nosuch${scheme}${Date.now() % 1000}`);
    await snap(p, `re-forgot-${scheme}-unknown`);
    await p.getByLabel("6-digit code").pressSequentially("123456");
    await p.getByRole("button", { name: /Verify and sign in/ }).tap().catch(() => {}); await sleep(2500);
    const wrong = await flat(p, 1500);
    await ctx.clearCookies();
    const k = scheme === "light" ? await tryLogin("subjectteacher") : null;
    rec(`B6 ${scheme}: unknown login goes to the code page`, u.path === "/sign-in/code" && /Enter the code/.test(u.text), u.text.slice(0, 200));
    rec(`B6 ${scheme}: wrong code on the decoy answers like a real one`, /That code is not right\. 4 more tries\./.test(wrong), (wrong.match(/That code[^|]*/) ?? [wrong.slice(0, 120)])[0]);
    if (k) rec("B6: known and unknown code pages read the same", k.text === u.text, `known: ${k.text.slice(0, 200)}`);
    await ctx.close();
  }
});
await close();
