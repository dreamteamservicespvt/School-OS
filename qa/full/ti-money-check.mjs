// Browser re-check of testing issues 4, 5, 29 and 30 (docs/qa/testing-issues.md) on Collect Fee,
// as the Accountant, with real key presses. Collects nothing: every Collect press carries a
// discount above the counter limit, which the server refuses. The one approval request it sends
// is withdrawn again at the end (it stays on record as Withdrawn).
//   QA_SERVER_LOG=<app log> MSYS_NO_PATHCONV=1 node qa/full/ti-money-check.mjs [studentId]
import { asUser, go, shot, close, mainText, sleep } from "./h.mjs";

const R = [];
const ok = (n, pass, note = "") => { R.push({ n, pass, note }); console.log(pass ? "PASS" : "FAIL", n, note ? `:: ${note}` : ""); };
const rupees = (s) => Number(String(s ?? "").replace(/[^\d.]/g, "") || 0);
const inr = (n) => `₹${n.toLocaleString("en-IN")}`;
const REASON = "Sibling concession agreed by phone";
const NOTE = "Counter note for the office copy";

/** Withdraws this login's own waiting requests whose title holds `text` (they stay on record as Withdrawn). */
async function withdrawMine(page, text) {
  let done = 0;
  for (let i = 0; i < 6; i++) {
    await go(page, "/approvals?view=asked&status=open"); await sleep(1500);
    const link = page.locator('a[href^="/approvals/"]').filter({ hasText: text }).first();
    if (!(await link.isVisible().catch(() => false))) break;
    await link.click(); await page.waitForURL(/\/approvals\/[0-9a-f-]{36}/, { timeout: 60000 }); await sleep(1200);
    const w = page.getByRole("button", { name: "Withdraw my request" });
    if (!(await w.isVisible().catch(() => false))) break;
    await w.click(); await sleep(600);
    await page.getByRole("button", { name: "Withdraw", exact: true }).click(); await sleep(2500);
    done++;
  }
  return done;
}

const p = await asUser("accountant", { width: 1440, height: 900 });
try {
  // A student who owes enough for a part payment and a discount above the limit.
  let studentId = process.argv[2];
  if (!studentId) {
    await go(p, "/fee-management/defaulters"); await sleep(1500);
    const hrefs = await p.evaluate(() => [...new Set([...document.querySelectorAll('a[href^="/fee-management/collect/"]')].map((a) => a.getAttribute("href")))]);
    console.log("defaulters with a Collect link:", hrefs.length);
    for (const h of hrefs.slice(0, 8)) {
      await go(p, h); await sleep(1200);
      const head = (await mainText(p, 4000)).match(/(\d+) rows? · ₹([\d,]+)/);
      if (head && rupees(head[2]) >= 6000) { studentId = h.split("/").pop(); break; }
    }
  }
  if (!studentId) throw new Error("no student with ₹6,000 or more ticked was found");
  await go(p, `/fee-management/collect/${studentId}`); await sleep(1500);
  const name = (await p.locator("h1").first().innerText()).trim();
  const head = (await mainText(p, 4000)).match(/(\d+) rows? · ₹([\d,]+)/);
  const total = rupees(head?.[2]);
  const paidBefore = (await mainText(p, 4000)).match(/Paid\s*₹[\d,]+/)?.[0];
  console.log(`student ${name} (${studentId}); ticked ${head?.[0]}; ${paidBefore}`);

  const amt = p.locator("#pay-amt");
  const collect = p.locator("button[type=submit]").filter({ hasText: /^(Collect ₹|Enter the amount)/ }).first();
  ok("amount starts empty (no pre-filled full due)", (await amt.inputValue()) === "", JSON.stringify(await amt.inputValue()));

  // ---- Issue 4: a typed discount lowers the amount and the Collect button.
  await p.getByRole("group", { name: "Quick amount" }).getByRole("button").first().click(); await sleep(400);
  ok("4: Full fills the ticked total", rupees(await amt.inputValue()) === total, `${await amt.inputValue()} of ${total}`);
  await p.getByRole("button", { name: /Discount, waiver, date or note/ }).click(); await sleep(500);
  const disc = p.locator("#pay-disc"); const reason = p.locator("#pay-disc-why"); const note = p.locator("#pay-note");
  const limit = rupees((await mainText(p, 6000)).match(/Up to ₹([\d,]+)/)?.[1]);
  console.log("counter discount limit:", inr(limit));
  await disc.click(); await disc.pressSequentially("500", { delay: 25 });
  await reason.click(); await reason.pressSequentially(REASON, { delay: 5 });
  await note.click(); await note.pressSequentially(NOTE, { delay: 5 }); await sleep(500);
  ok("4: amount received follows the discount", rupees(await amt.inputValue()) === total - 500, `${await amt.inputValue()} (wanted ${total - 500})`);
  const btn1 = (await collect.innerText()).trim();
  ok("4: Collect button names the lower amount", btn1.startsWith(`Collect ${inr(total - 500)}`), btn1);
  const t4 = await mainText(p, 6000);
  const sum = t4.match(/Fees ₹[\d,]+ − discount ₹[\d,]+ = ₹[\d,]+/)?.[0];
  ok("4: the sum is shown under the amount", sum === `Fees ${inr(total)} − discount ₹500 = ${inr(total - 500)}`, sum ?? "(no line)");
  ok("4: no 'held as advance' line for a discount", !/held as advance/i.test(t4));
  await shot(p, "ti4-discount-follows", false);

  // ---- Issue 29: a typed amount is never overwritten by a discount.
  await amt.click(); await amt.fill(""); await amt.pressSequentially("2000", { delay: 25 });
  await disc.click(); await disc.fill(""); await disc.pressSequentially("700", { delay: 25 }); await sleep(500);
  ok("29: typed amount stays when the discount changes", (await amt.inputValue()) === "2000", await amt.inputValue());
  const btn2 = (await collect.innerText()).trim();
  ok("29: Collect button keeps the typed amount", btn2.startsWith("Collect ₹2,000"), btn2);
  const t29 = await mainText(p, 6000);
  ok("29: no 'more than the dues' line for a part payment", !/more than the dues|held as advance/i.test(t29));
  const stays = t29.match(/₹[\d,]+ stays due/)?.[0];
  ok("29: 'stays due' counts the discount", stays === `${inr(total - 700 - 2000)} stays due`, stays ?? "(no line)");
  await shot(p, "ti29-typed-amount-kept", false);

  // ---- Issues 5 and 30: a discount above the limit.
  const over = limit + 500;
  await disc.click(); await disc.fill(""); await disc.pressSequentially(String(over), { delay: 25 }); await sleep(500);
  const early = (await mainText(p, 6000)).match(/More than ₹[\d,]+ needs the principal.s approval/)?.[0];
  ok("5: the Discount box says 'needs approval' before Collect is pressed", !!early, early ?? "(nothing)");
  await collect.click();
  await p.getByText("Above your discount limit.").waitFor({ timeout: 60000 }).catch(() => {});
  await sleep(800);
  const t5 = await mainText(p, 8000);
  ok("5: Collect is refused with 'Ask for approval'", /Above your discount limit\./.test(t5) && (await p.getByRole("button", { name: "Ask for approval" }).isVisible().catch(() => false)));
  ok("5: no receipt was made", (await p.locator("dialog[open]").count()) === 0 && !/Just collected/.test(t5));
  ok("5/30: typed Reason kept after the refusal", (await reason.inputValue()) === REASON, JSON.stringify(await reason.inputValue()));
  ok("30: typed Note kept after the refusal", (await note.inputValue()) === NOTE, JSON.stringify(await note.inputValue()));
  ok("30: typed amount kept after the refusal", (await amt.inputValue()) === "2000", await amt.inputValue());
  await shot(p, "ti5-refused", false);

  // 30: the refusal goes once the discount changes.
  await disc.click(); await disc.fill(""); await disc.pressSequentially("300", { delay: 25 }); await sleep(600);
  const t30 = await mainText(p, 8000);
  ok("30: refusal box goes once the discount changes", !/Above your discount limit|need the principal.s approval/i.test(t30), t30.match(/[^\n]*principal.s approval[^\n]*/i)?.[0] ?? "gone");
  await disc.fill(""); await sleep(500);
  ok("30: nothing stale with the discount cleared", !/principal.s approval/i.test(await mainText(p, 8000)));
  ok("30: Reason still there after changing the discount", (await reason.inputValue()) === REASON);
  await shot(p, "ti30-cleared", false);

  // 5: ask for approval; one request, a clear "sent" message, no old red text, no duplicate.
  const title = `Discount: ${inr(over)} off for ${name}`;
  const typed = { amount: await amt.inputValue() };
  const left = await withdrawMine(p, title);
  if (left) console.log(`withdrew ${left} waiting request(s) left by an earlier run`);
  await go(p, `/fee-management/collect/${studentId}`); await sleep(1500);
  await amt.click(); await amt.pressSequentially(typed.amount, { delay: 25 });
  await p.getByRole("button", { name: /Discount, waiver, date or note/ }).click(); await sleep(500);
  await reason.click(); await reason.pressSequentially(REASON, { delay: 5 });
  await disc.click(); await disc.pressSequentially(String(over), { delay: 25 }); await sleep(400);
  await collect.click();
  await p.getByRole("button", { name: "Ask for approval" }).waitFor({ timeout: 60000 });
  await p.getByRole("button", { name: "Ask for approval" }).click();
  await p.getByText("Sent to the principal").waitFor({ timeout: 60000 }).catch(() => {});
  await sleep(800);
  const tAsk = await mainText(p, 8000);
  ok("5: 'Sent to the principal' with the amount", /Sent to the principal/.test(tAsk) && tAsk.includes(`Discount of ${inr(over)} sent to the principal for approval`), tAsk.match(/Discount of [^\n]*/)?.[0] ?? "(no message)");
  ok("5: Open Approvals link shown", await p.getByRole("link", { name: "Open Approvals" }).first().isVisible().catch(() => false));
  const stale = tAsk.match(/[^\n]*(Above your discount limit|Ask for approval, then collect|Give a reason of at least)[^\n]*/)?.[0];
  ok("5: no old red text left after the request went", !stale, stale ?? "none");
  ok("5: Reason still shown after asking", (await reason.inputValue()) === REASON, JSON.stringify(await reason.inputValue()));
  await shot(p, "ti5-asked", false);

  // The same request again: Collect (refused again), then Ask again.
  await collect.click();
  await p.getByRole("button", { name: "Ask for approval" }).waitFor({ timeout: 60000 });
  await sleep(500);
  await p.getByRole("button", { name: "Ask for approval" }).click();
  await p.getByText(/already waiting for the principal/).waitFor({ timeout: 60000 }).catch(() => {});
  const tDup = await mainText(p, 8000);
  ok("5: a second identical request is refused", /already waiting for the principal/.test(tDup), tDup.match(/[^\n]*already waiting[^\n]*/)?.[0] ?? "(no message)");
  await shot(p, "ti5-duplicate", false);

  // Nothing was collected.
  await go(p, `/fee-management/collect/${studentId}`); await sleep(1200);
  const paidAfter = (await mainText(p, 4000)).match(/Paid\s*₹[\d,]+/)?.[0];
  ok("no payment was made in this run", paidAfter === paidBefore, `${paidBefore} -> ${paidAfter}`);

  // Exactly one request went, with the typed reason; then withdraw it (kept on record as Withdrawn).
  await go(p, "/approvals?view=asked&status=open"); await sleep(1500);
  const links = p.locator('a[href^="/approvals/"]').filter({ hasText: title });
  const n = await links.count();
  ok("5: exactly one waiting request under Asked by me", n === 1, `${n} found`);
  if (n >= 1) ok("5: the request carries the typed reason", ((await links.first().innerText()) ?? "").includes(REASON));
  const gone = await withdrawMine(p, title);
  ok("clean-up: the request is withdrawn", gone === n, `${gone} of ${n}`);
  if (p.problems.length) console.log("PROBLEMS", p.problems);
} catch (e) {
  console.log("STOPPED:", e.message.split("\n")[0]);
  await shot(p, "ti-money-stopped", false).catch(() => {});
} finally {
  await close();
}
const fails = R.filter((r) => !r.pass);
console.log(`\n${R.length - fails.length} of ${R.length} passed${fails.length ? "; FAILED: " + fails.map((f) => f.n).join(" | ") : ""}`);
