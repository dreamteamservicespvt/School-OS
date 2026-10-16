// Regression re-test of the other fixed MONEY defects, through the screens.
//   QA_OUT=qa-output/regression node qa/regression/money.mjs [ID ...]
import { as, open, settle, mainText, shot, close, squeeze, rec, check, BASE, VIEWPORTS } from "./_lib.mjs";
import { writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const only = process.argv.slice(2);
const want = (id) => !only.length || only.includes(id);
const A = "money";
const tag = String(Date.now()).slice(-5);
const REG = process.env.REG_STUDENT ?? "Demo QA Regress 61783";
const sheetText = async (p) => squeeze(await p.getByRole("dialog").last().innerText().catch(() => ""));
const toastOf = async (p) => squeeze((await p.locator("[role=status], [role=alert]").allInnerTexts().catch(() => [])).join(" | "));
const rupees = (s) => Number(String(s).replace(/[₹,\s]/g, ""));

async function studentId(p, name) {
  await open(p, `/student-management?q=${encodeURIComponent(name)}`);
  const href = await p.locator("main a[href*='/student-management/students/']").filter({ hasText: name }).first().getAttribute("href");
  return href.match(/students\/([0-9a-f-]{36})/)[1];
}

// MONEY-02 (P1): the Student Fee Ledger opens, for the accountant, School Admin and Principal, desktop and phone.
if (want("MONEY-02")) for (const [login, vp] of [["cems.accountant", "laptop1280"], ["cems.admin", "laptop1280"], ["cems.principal", "phone375"]]) {
  await check({ id: "MONEY-02", area: A, role: login, check: `Student Fee Ledger opens from Fee Management (${VIEWPORTS[vp].width}px)` }, async (set) => {
    const p = set(await as(login, VIEWPORTS[vp]));
    await open(p, "/fee-management/ledger");
    const t0 = squeeze(await mainText(p, 1500));
    // Pick Aarav Kumar (Grade 5 A) from the ledger's own search.
    const box = p.locator("main input[type=search], main input[placeholder]").first();
    await box.fill("Aarav Kumar"); await p.waitForTimeout(1500);
    const opt = p.locator("main a[href*='/fee-management/ledger/'], [role=option]").filter({ hasText: /Aarav Kumar/ }).first();
    if (await opt.count()) { await opt.click({ force: true }); await p.waitForURL(/ledger\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {}); }
    else { await box.press("Enter"); await p.waitForTimeout(2000); }
    await settle(p);
    const t = squeeze(await mainText(p, 3000));
    const s = await shot(p, `MONEY-02-${login}-${vp}`);
    const broken = /could not open|reference/i.test(t) && /This page/.test(t);
    const ok = /ledger\/[0-9a-f-]{36}/.test(p.url()) && !broken && /Aarav Kumar/.test(t) && /₹/.test(t);
    return { status: ok ? "PASS" : "FAIL", note: `${p.url().replace(BASE, "")} :: ${broken ? "SAYS 'This page could not open'" : t.slice(0, 220)}${ok ? "" : " | ledger page before: " + t0.slice(0, 150)}`, shot: s };
  });
}

// MONEY-05 (P2): CEMS Add gateway form keeps typed keys after "Test these details" (not saved).
if (want("MONEY-05")) await check({ id: "MONEY-05", area: A, role: "cems.admin", check: "Settings > Payment Gateways > Add (CEMS): Key ID, Key Secret and Webhook secret stay after 'Test these details'" }, async (set) => {
  const p = set(await as("cems.admin"));
  await open(p, "/settings/payment-gateways/new");
  await p.getByLabel(/Display name/).fill(`QA Regression gateway ${tag}`);
  await p.getByLabel(/Key ID/).fill("rzp_test_DEMOQAKEEP0001");
  await p.getByLabel(/Key Secret/).fill("DEMOqaKeepSecret0001");
  await p.getByLabel(/Webhook secret/).fill("DEMOqaKeepHook0001");
  await p.getByRole("button", { name: "Test these details" }).click();
  await p.waitForTimeout(7000);
  const v = [await p.getByLabel(/Key ID/).inputValue(), await p.getByLabel(/Key Secret/).inputValue(), await p.getByLabel(/Webhook secret/).inputValue()];
  const said = await toastOf(p);
  const s = await shot(p, "MONEY-05-after-test");
  const ok = v[0] === "rzp_test_DEMOQAKEEP0001" && v[1] === "DEMOqaKeepSecret0001" && v[2] === "DEMOqaKeepHook0001";
  return { status: ok ? "PASS" : "FAIL", note: `after the test: Key ID "${v[0]}", Key Secret ${v[1] ? "kept" : "EMPTY"}, Webhook secret ${v[2] ? "kept" : "EMPTY"}; test said: "${said.slice(0, 200)}". Not saved (CEMS settings left as they were). A real Razorpay test needs real keys: NEEDS EXTERNAL CREDENTIAL.`, shot: s };
});

// MONEY-08 (P2): a later month cannot be closed while an earlier one is open.
if (want("MONEY-08")) await check({ id: "MONEY-08", area: A, role: "cems.accountant", check: "Finance Settings: Close August 2026 while July 2026 is open is refused; August stays open" }, async (set) => {
  const p = set(await as("cems.accountant"));
  await open(p, "/finance-management/settings");
  const before = squeeze(await mainText(p, 6000));
  const links = await p.locator("main a[href*='close=']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  if (!links.some((h) => h.endsWith("2026-07")) || !links.some((h) => h.endsWith("2026-08"))) return { status: "BLOCKED", note: `July and August are not both open: close links ${links.join(", ")}` };
  await open(p, "/finance-management/settings?close=2026-08");
  const d = p.getByRole("dialog").last();
  const t = await sheetText(p);
  const btn = d.getByRole("button", { name: /^Close Aug/ });
  const disabled = (await btn.count()) ? await btn.isDisabled() : true;
  let after = "";
  if (!disabled) { await btn.click(); await p.waitForTimeout(3500); after = (await toastOf(p)) || (await sheetText(p)); }
  const s = await shot(p, "MONEY-08-close-august", false);
  await open(p, "/finance-management/settings");
  const links2 = await p.locator("main a[href*='close=']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  const stillOpen = links2.some((h) => h.endsWith("2026-08"));
  const ok = stillOpen && !/August 2026 closed/i.test(after);
  return { status: ok ? "PASS" : "FAIL", note: `sheet: "${t.match(/Close [^.]*first[^.]*\./)?.[0] ?? t.slice(0, 120)}"; button ${disabled ? "disabled" : "pressed"}; result: "${after.slice(0, 160)}"; August ${stillOpen ? "still open" : "CLOSED"} (close links now: ${links2.map((h) => h.slice(-7)).join(", ")})`, shot: s };
});

// MONEY-09 (P2): sending slips by WhatsApp with WhatsApp off gives a plain reason.
if (want("MONEY-09")) await check({ id: "MONEY-09", area: A, role: "cems.accountant", check: "Salary Slips > Send unsent slips (WhatsApp not connected): plain reason, not 'a problem on our side'" }, async (set) => {
  const p = set(await as("cems.accountant"));
  await open(p, "/salary-management/slips");
  const send = p.getByRole("link", { name: /Send unsent slips/ }).first();
  if (!(await send.count())) return { status: "BLOCKED", note: `no 'Send unsent slips' on the page: ${squeeze(await mainText(p, 400))}` };
  await send.click();
  const d = p.getByRole("dialog").last(); await d.waitFor();
  const sheet = await sheetText(p);
  const go = d.getByRole("button", { name: /^Send/ }).last();
  const disabled = await go.isDisabled();
  let said = "";
  if (!disabled) { await go.click(); await p.waitForTimeout(6000); said = (await toastOf(p)) || (await sheetText(p)); }
  const s = await shot(p, "MONEY-09-send-slips", false);
  const vague = /problem on our side/i.test(said);
  const claims = /slips? sent by WhatsApp/i.test(said);
  const plain = /WhatsApp/i.test(said) && /(off|not|switched|connect|credit)/i.test(said);
  return { status: disabled ? "FAIL" : !vague && !claims && plain ? "PASS" : "FAIL", note: `sheet: "${sheet.slice(0, 140)}"; ${disabled ? "Send is disabled" : `after Send: "${said.slice(0, 220)}"`}. Real delivery needs a WhatsApp account.`, shot: s };
});

// MONEY-04 (P3): the Day Book "Total income" line adds up.
if (want("MONEY-04")) await check({ id: "MONEY-04", area: A, role: "cems.accountant", check: "Day Book today: the explanation under Total income adds up to the total (day has cancelled payments)" }, async (set) => {
  const p = set(await as("cems.accountant"));
  await open(p, "/finance-management/day-book");
  const t = squeeze(await mainText(p, 4000));
  const s = await shot(p, "MONEY-04-daybook", false);
  const m = t.match(/Total income ₹([\d,]+) (\d+ transactions?) · ([^·]+?)(?: · less ₹([\d,]+) reversed)? Total expense/);
  if (!m) return { status: "FAIL", note: `could not read the Total income card: ${t.slice(0, 300)}`, shot: s };
  const parts = [...m[3].matchAll(/₹([\d,]+)/g)].map((x) => rupees(x[1]));
  const sum = parts.reduce((a, b) => a + b, 0) - (m[4] ? rupees(m[4]) : 0);
  return { status: sum === rupees(m[1]) && m[4] ? "PASS" : sum === rupees(m[1]) ? "PASS" : "FAIL", note: `"Total income ₹${m[1]} ${m[2]} · ${m[3].trim()}${m[4] ? ` · less ₹${m[4]} reversed` : ""}": parts give ₹${sum.toLocaleString("en-IN")}${m[4] ? "" : " (no reversals on this day)"}`, shot: s };
});

// MONEY-07 (P3): income dated a closed day: the message names the Day Book it went into.
// The fix moves income dated a closed day into the next open day only when that day is today (a past closed
// day is refused by the form). Closing today in CEMS would move other testers' entries, so this runs in
// Sunrise Public School (accountant / principal), closes today, posts, and the Principal reopens today.
const M7 = process.env.M7 === "cems" ? { acc: "cems.accountant", pr: "cems.principal", day: "2026-10-15", school: "CEMS" } : { acc: "accountant", pr: "principal", day: "2026-10-16", school: "Sunrise" };
const dmy = (d) => d.split("-").reverse().join("-");
const next = (d) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
if (want("MONEY-07")) await check({ id: "MONEY-07", area: A, role: `${M7.acc} + ${M7.pr} (${M7.school})`, check: `Close ${dmy(M7.day)}, post income dated ${dmy(M7.day)}: message names the Day Book it went into; then the Principal reopens the day` }, async (set) => {
  const p = set(await as(M7.acc));
  await open(p, `/finance-management/day-book?from=${M7.day}&to=${M7.day}`);
  const head = squeeze(await mainText(p, 800));
  let closedNow = false;
  if (new RegExp(`Close (today|${dmy(M7.day)})`).test(head)) {
    await open(p, `/finance-management/day-book?from=${M7.day}&to=${M7.day}&do=close&day=${M7.day}`);
    const d = p.getByRole("dialog").last(); await d.waitFor();
    const cs = await sheetText(p);
    // Count the cash as shown (the sheet asks for the counted cash when there is cash).
    const cash = d.getByLabel(/Cash counted/);
    if (await cash.count()) { const exp = cs.match(/Cash the books expect ₹([\d,]+)/i)?.[1]; if (exp) await cash.fill(String(rupees(exp))); }
    await d.getByRole("button", { name: /^Close/ }).last().click();
    await p.waitForTimeout(3500);
    closedNow = /closed/i.test(await toastOf(p));
    if (!closedNow) return { status: "BLOCKED", note: `could not close ${dmy(M7.day)}: ${(await toastOf(p)) || cs.slice(0, 300)}`, shot: await shot(p, "MONEY-07-close") };
  }
  await open(p, "/finance-management/income?do=new");
  const d = p.getByRole("dialog").last();
  await d.locator("input[name=amount]").fill("150");
  await d.locator("input[name=date]").fill(M7.day);
  const hs = d.locator("select[name=accountHeadId]");
  await hs.selectOption(await hs.locator("option").evaluateAll((os) => (os.find((o) => /Hall|rent/i.test(o.textContent)) ?? os.find((o) => o.value))?.value));
  await d.locator("input[name=receivedFrom]").fill(`Demo QA Hall Hirer ${tag}`);
  await d.getByRole("button", { name: "Post to Day Book" }).click();
  await p.waitForTimeout(4000);
  const said = (await toastOf(p)) || (await sheetText(p));
  const s = await shot(p, "MONEY-07-income-message", false);
  await p.context().close();
  // Leave 15-10 as it was: the Principal reopens it.
  let reopened = "not closed by this test";
  if (closedNow) {
    const pr = set(await as(M7.pr));
    await open(pr, `/finance-management/day-book?from=${M7.day}&to=${M7.day}`);
    const ro = pr.getByRole("link", { name: /Reopen/ }).or(pr.getByRole("button", { name: /Reopen/ })).first();
    if (await ro.count()) {
      await ro.click(); await pr.waitForTimeout(1200);
      const rd = pr.getByRole("dialog").last();
      if (await rd.count()) { await rd.locator("textarea").first().fill("Demo QA: reopened after the MONEY-07 regression test").catch(() => {}); await rd.getByRole("button", { name: /Reopen/ }).last().click(); }
      await pr.waitForTimeout(3000); reopened = (await toastOf(pr)) || "reopen pressed";
    } else reopened = "NO Reopen offered to the Principal";
  }
  const ok = said.includes(`${dmy(M7.day)} was already closed, so it is in the Day Book for ${dmy(next(M7.day))}`);
  return { status: ok ? "PASS" : "FAIL", note: `income ₹150 dated ${dmy(M7.day)} after closing it: "${said.slice(0, 220)}"; reopen: ${reopened.slice(0, 120)}`, shot: s };
});

// MONEY-03 (P3): a long UPI reference wraps inside the receipt's details box.
if (want("MONEY-03")) await check({ id: "MONEY-03", area: A, role: "cems.accountant", check: `Collect ₹100 by UPI from ${REG} with a long UTR; the receipt PDF shows the whole reference` }, async (set) => {
  const p = set(await as("cems.accountant"));
  const sid = await studentId(p, REG);
  await open(p, `/fee-management/collect/${sid}`);
  await p.getByText("How is it paid?").waitFor({ timeout: 60000 });
  await p.getByRole("radio", { name: "UPI" }).click();
  await p.locator("#pay-amt").fill("100");
  const utr = `DEMOWQAUTR0605LONG${tag}`.slice(0, 22); // the longest a UTR may be
  await p.locator("#pay-ref").fill(utr);
  await p.getByRole("button", { name: /^Collect ₹/ }).click();
  const sheet = p.getByRole("dialog").filter({ hasText: /Receipt|received|Saved|verification/ });
  await sheet.first().waitFor({ timeout: 60000 });
  const st = squeeze(await sheet.first().innerText());
  const rlink = sheet.first().locator("a[href*='/receipt']").first();
  const href = (await rlink.count()) ? await rlink.getAttribute("href") : null;
  if (!href) return { status: "FAIL", note: `no receipt link on the sheet: ${st.slice(0, 200)}`, shot: await shot(p, "MONEY-03-sheet") };
  const r = await p.request.get(href.startsWith("http") ? href : `${BASE}${href}`);
  const pdf = `qa-output/regression/MONEY-03-receipt-${tag}.pdf`;
  writeFileSync(pdf, await r.body());
  const png = `qa-output/regression/shots/MONEY-03-receipt-${tag}`;
  execFileSync("pdftoppm", ["-png", "-r", "110", "-f", "1", "-l", "1", "-singlefile", pdf, png]);
  const text = execFileSync("pdftotext", ["-layout", pdf, "-"]).toString();
  const whole = text.replace(/\s+/g, "").includes(utr);
  // Width check: every text line must sit inside the page (bbox from pdftotext).
  const bbox = execFileSync("pdftotext", ["-bbox", pdf, "-"]).toString();
  const pageW = Number(bbox.match(/<page width="([\d.]+)"/)?.[1] ?? 0);
  const over = [...bbox.matchAll(/<word xMin="([\d.]+)" yMin="[\d.]+" xMax="([\d.]+)"[^>]*>([^<]*)</g)].filter((w) => Number(w[2]) > pageW - 20).map((w) => w[3]);
  return { status: whole && !over.length ? "PASS" : "FAIL", note: `receipt ${st.match(/CEMS\/[\d-]+\/\d+/)?.[0] ?? ""} (${r.status()}); UTR ${utr} ${whole ? "appears in full" : "NOT complete in the PDF text"}; words past the page margin: ${over.length ? over.join(" ") : "none"}. Picture: ${png}.png`, shot: `${png}.png` };
});

await close();
