// Self-test of the owner's 16 test notes (docs/qa/testing-issues.md, 2026-11-05 PDF).
//   node qa/full/p16-selftest.mjs   (app on :3000 from the SSD build)
import { asUser, go, shot, close, BASE, signIn, newPage, mainText } from "./h.mjs";

const R = [];
const ok = (n, pass, note = "") => { R.push({ n, pass, note }); console.log(pass ? "PASS" : "FAIL", n, note); };
const safe = async (n, f) => { try { await f(); } catch (e) { ok(n, false, "error: " + String(e.message).split("\n")[0].slice(0, 200)); } };

// ---------- School Admin ----------
const ONLY = process.env.ONLY;
const admin = ONLY ? null : await asUser("admin");

if (!ONLY) await safe("2+3 Add class: 12-hour hint, draft kept after closing", async () => {
  await go(admin, "/academic-management");
  await admin.getByRole("button", { name: /^Add class$/ }).first().click();
  const dlg = admin.getByRole("dialog");
  await dlg.waitFor();
  const text = await dlg.innerText();
  ok("2 Add class hint is 12-hour", /7:00 AM/.test(text) && !/7:00 to 8:00/.test(text), text.match(/batch[^\n]*/)?.[0] ?? "");
  const name = dlg.getByLabel(/Class name/);
  await name.fill("");
  await name.pressSequentially("Class QA9", { delay: 10 });
  await admin.keyboard.press("Escape");
  await dlg.waitFor({ state: "hidden" });
  await admin.getByRole("button", { name: /^Add class$/ }).first().click();
  await dlg.waitFor();
  await admin.waitForTimeout(600);
  const v = await dlg.getByLabel(/Class name/).inputValue();
  ok("3 Add class keeps typed name after closing", v === "Class QA9", `value after reopen: "${v}"; hint shown: ${/Draft kept/.test(await dlg.innerText())}`);
  await shot(admin, "p16-add-class-draft");
  const clear = dlg.getByRole("button", { name: /Clear/ }).first();
  if (await clear.isVisible().catch(() => false)) await clear.click();
  await admin.keyboard.press("Escape");
});

if (!ONLY) await safe("4 Add Staff: Next empty marks all, focuses first", async () => {
  await go(admin, "/staff-hr-management/add");
  await admin.getByRole("button", { name: /^Next$/ }).first().click();
  await admin.waitForTimeout(800);
  const focused = await admin.evaluate(() => { const a = document.activeElement; return a ? (a.getAttribute("name") || a.id || a.tagName) : ""; });
  const invalid = await admin.locator('[aria-invalid="true"]').count();
  ok("4 Add Staff Next empty: cursor on first missing box, every missing box marked", invalid >= 2 && /name/i.test(focused), `focused=${focused}, marked=${invalid}`);
  await shot(admin, "p16-add-staff-empty-next");
});

if (!ONLY) await safe("6+7b Student profile menu and ID card", async () => {
  await go(admin, "/student-management");
  const href = await admin.locator('a[href*="/student-management/students/"]').first().getAttribute("href");
  await go(admin, href);
  await admin.getByRole("button", { name: /more|More/ }).first().click();
  await admin.waitForTimeout(400);
  const item = admin.getByRole("menuitem", { name: /Print ID card/ }).or(admin.getByRole("link", { name: /Print ID card/ })).first();
  const box = await item.boundingBox();
  const vh = admin.viewportSize().height;
  ok("7b Student profile '...' menu fully visible", !!box && box.y >= 0 && box.y + box.height <= vh, JSON.stringify(box));
  await shot(admin, "p16-profile-menu");
  const idHref = await item.getAttribute("href");
  const r = await admin.request.get(BASE + idHref, { timeout: 180000 });
  const ct = r.headers()["content-type"] ?? "";
  const body = await r.body();
  ok("6 Print ID card gives a PDF", r.status() === 200 && /pdf/.test(ct) && body.subarray(0, 5).toString() === "%PDF-", `${r.status()} ${ct} ${body.length} bytes`);
});

// ---------- Accountant ----------
const acc = await asUser("accountant");
await safe("10 UTR 12 digits + 9b receipt PDF", async () => {
  await go(acc, "/fee-management/collect/00a1f17b-126f-4879-bb40-a67a0be56d96");
  await acc.getByRole("button", { name: /^UPI$/ }).or(acc.getByRole("radio", { name: /UPI/ })).first().click();
  const utr = acc.getByLabel(/UTR|transaction number/i).first();
  await utr.pressSequentially("jmhgf98765432156&^%$#@1234", { delay: 5 });
  const v = await utr.inputValue();
  ok("10 UTR box keeps only 12 digits", /^\d{12}$/.test(v), `typed letters+symbols+16 digits, box holds "${v}"`);
  await shot(acc, "p16-utr");
  // A receipt that already exists
  const rc = "/fee-management/payments/3f1157cf-396d-45a6-bced-0169636629a4/receipt";
  const r = await acc.request.get(BASE + rc, { timeout: 180000 });
  const b = await r.body();
  ok("9b Receipt PDF downloads", r.status() === 200 && b.subarray(0, 5).toString() === "%PDF-", `${r.status()} ${r.headers()["content-type"]} ${b.length} bytes`);
});

// ---------- Sign-in: wrong passwords ----------
if (!ONLY) await safe("11 Wrong password: no timer", async () => {
  const p = await newPage();
  let last = "";
  for (let i = 0; i < 6; i++) {
    await go(p, "/sign-in");
    await p.locator("#username").fill("subjectteacher");
    await p.locator("#password").fill("wrong-password-" + i);
    await p.getByRole("button", { name: "Sign in", exact: true }).click();
    await p.waitForLoadState("networkidle").catch(() => {});
    await p.waitForTimeout(800);
    last = await mainText(p, 600);
  }
  ok("11 Locked message has no minutes/seconds", !/\d+\s*(minute|second)/i.test(last) && /Forgot password|locked/i.test(last), last.replace(/\n/g, " | ").slice(0, 250));
  await shot(p, "p16-locked");
});

console.log("\nSUMMARY", R.filter((r) => r.pass).length, "of", R.length, "passed");
console.log(JSON.stringify(R, null, 1));
await close();
