// Parent Link for a guardian: send it as the School Admin, open it as the parent
// (phone, no login), confirm the phone with the one-time code, read fees, press Pay.
//   node qa/e2e/money/02-parentlink.mjs <step> [guardianId] [studentId]
// steps: send | open | pay | office
import { as, anon, visit, text, shot, sql, one, layoutIssues, VIEWPORTS, BASE, note, squeeze } from "./h.mjs";
import { close } from "../../lib.mjs";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const step = process.argv[2] ?? "send";
const GUARDIAN = process.argv[3] ?? "bb3efb65-406f-4d11-9468-34a8f2fa6158"; // Suresh Varma
const STUDENT = process.argv[4] ?? "5323a56e-27dd-4d83-a914-3e95790b75a7"; // Rithvik Varma
const vp = process.env.VP ?? "phone390";
const OUTF = path.join(process.env.QA_OUT, `parentlink-${GUARDIAN.slice(0, 8)}.json`);
const mem = existsSync(OUTF) ? JSON.parse(readFileSync(OUTF, "utf8")) : {};
const save = () => writeFileSync(OUTF, JSON.stringify(mem, null, 2));

// Message History keeps ⟦parent-link:<id>⟧ instead of the link (by design), and
// staff never see the link itself. The staff preview shows what the parent sees.
function linkUrl() { return null; }
const linkId = () => one(`select id from parent_link where guardian_id='${GUARDIAN}' and status='ACTIVE' order by created_at desc limit 1`);

if (step === "preview") {
  const page = await as(process.env.LOGIN ?? "admin", VIEWPORTS[vp]);
  await visit(page, `/communication/parent-link/${linkId()}/preview`, 2500);
  const t = squeeze(await page.locator("body").innerText());
  note("PREVIEW:", t.slice(0, 3500));
  note("layout", JSON.stringify(await layoutIssues(page)));
  await shot(page, `pl-preview-${vp}-${process.env.TAG ?? ""}`);
  const pay = page.getByRole("button", { name: /Pay/ }).or(page.getByRole("link", { name: /Pay/ }));
  note("Pay controls:", await pay.count(), await pay.count() ? squeeze(await pay.first().innerText()) + ` disabled=${await pay.first().isDisabled().catch(() => "?")}` : "");
  if (await pay.count() && process.env.CLICK_PAY) {
    await pay.first().click();
    await page.waitForTimeout(5000);
    note("AFTER PAY:", page.url().replace(BASE, ""), squeeze(await page.locator("body").innerText()).slice(0, 1200));
    await shot(page, `pl-preview-pay-${vp}`);
  }
  note("problems", JSON.stringify(page.problems));
}

if (step === "send") {
  const page = await as(process.env.LOGIN ?? "admin");
  await visit(page, `/student-management/guardians/${GUARDIAN}`, 1200);
  await page.getByRole("button", { name: /Resend Parent Link|Send Parent Link/ }).first().click();
  await page.waitForTimeout(1500);
  const dlg = page.locator("dialog[open], [role=dialog]").last();
  if (await dlg.count()) {
    note("DIALOG:", squeeze(await dlg.innerText()));
    await dlg.getByRole("button", { name: /Resend|Send/ }).last().click();
    await page.waitForTimeout(4000);
  }
  note("AFTER:", (await text(page, 1500)).slice(0, 600));
  await shot(page, "pl-send-admin");
  mem.url = linkUrl();
  note("LINK URL from Message History text:", mem.url);
  save();
  note("problems", JSON.stringify(page.problems));
}

if (step === "open" || step === "pay") {
  const url = mem.url ?? linkUrl();
  if (!url) { note("no link url"); process.exit(1); }
  const page = await anon(VIEWPORTS[vp]);
  const stateFile = path.join(process.env.QA_OUT, "state", `parent-${GUARDIAN.slice(0, 8)}.json`);
  if (existsSync(stateFile)) await page.context().addCookies(JSON.parse(readFileSync(stateFile, "utf8")).cookies);
  await page.goto(url.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  let t = squeeze(await page.locator("body").innerText());
  note("OPEN:", t.slice(0, 600));
  await shot(page, `pl-open-${vp}`);
  if (/code/i.test(t) && !/Fees|Pay/.test(t.slice(0, 300))) {
    const send = page.getByRole("button", { name: /Send.*code|Get.*code|Send/i }).first();
    const before = one(`select count(*) from message_recipient where guardian_id='${GUARDIAN}'`);
    await send.click();
    await page.waitForTimeout(5000);
    t = squeeze(await page.locator("body").innerText());
    note("AFTER SEND CODE:", t.slice(0, 400));
    // The code: server log first, else the sandbox message text (Message History).
    let code = null;
    const log = readFileSync(process.env.QA_SERVER_LOG, "utf8").split("\n").reverse().find((l) => /\b\d{6}\b/.test(l) && /code/i.test(l));
    if (log) code = log.match(/\b(\d{6})\b/)[1];
    const msg = sql(`select r.text from message_recipient r where r.guardian_id='${GUARDIAN}' order by r.queued_at desc nulls last limit 1`)[0]?.[0] ?? "";
    note("server log line:", log ?? "(none)", "| latest message to guardian:", msg.slice(0, 160), "| msgs", before, "->", one(`select count(*) from message_recipient where guardian_id='${GUARDIAN}'`));
    code = msg.match(/\b(\d{6})\b/)?.[1] ?? code;
    if (code) {
      await page.locator("input[name=code], input[inputmode=numeric]").first().fill(code);
      await page.getByRole("button", { name: /Confirm|Verify|Continue|Open/i }).first().click();
      await page.waitForTimeout(4000);
      writeFileSync(stateFile, JSON.stringify(await page.context().storageState()));
    }
    t = squeeze(await page.locator("body").innerText());
  }
  note("PARENT LINK HOME:", t.slice(0, 2500));
  note("layout", JSON.stringify(await layoutIssues(page)));
  await shot(page, `pl-home-${vp}`);
  if (step === "pay") {
    const before = { links: one(`select count(*) from payment_link where student_id='${STUDENT}'`), orders: one(`select count(*) from payment_link_order o join payment_link l on l.id=o.link_id where l.student_id='${STUDENT}'`), pays: one(`select count(*) from payment where student_id='${STUDENT}'`) };
    const pay = page.getByRole("button", { name: /^Pay/ }).or(page.getByRole("link", { name: /^Pay/ })).first();
    note("Pay control:", await pay.count() ? squeeze(await pay.innerText()) : "none", await pay.count() ? `disabled=${await pay.isDisabled()}` : "");
    if (await pay.count()) {
      await pay.click();
      await page.waitForTimeout(6000);
      note("AFTER PAY url:", page.url().replace(BASE, ""));
      note("AFTER PAY:", squeeze(await page.locator("body").innerText()).slice(0, 1500));
      await shot(page, `pl-after-pay-${vp}`);
    }
    const after = { links: one(`select count(*) from payment_link where student_id='${STUDENT}'`), orders: one(`select count(*) from payment_link_order o join payment_link l on l.id=o.link_id where l.student_id='${STUDENT}'`), pays: one(`select count(*) from payment where student_id='${STUDENT}'`) };
    note("DB before", JSON.stringify(before), "after", JSON.stringify(after));
  }
  note("problems", JSON.stringify(page.problems));
}
await close();
