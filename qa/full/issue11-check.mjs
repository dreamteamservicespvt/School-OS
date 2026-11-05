// Browser check of live-test issue 11 (link an existing login to a new staff record) and 32 (refund sheet closes).
//   MSYS_NO_PATHCONV=1 node qa/full/issue11-check.mjs   (app on :3000 from the SSD build)
import { asUser, go, shot, close, mainText } from "./h.mjs";

const R = [];
const ok = (n, pass, note = "") => { R.push({ n, pass, note }); console.log(pass ? "PASS" : "FAIL", n, note); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const count = (t) => Number((t.match(/(\d+) people can sign in but have no staff record/) ?? [])[1] ?? (/1 person can sign in/.test(t) ? 1 : 0));

const a = await asUser("admin");

// 11a: Staff List names the logins with no staff record.
await go(a, "/staff-hr-management");
await wait(2000);
const list1 = await mainText(a, 4000);
const before = count(list1);
ok("11 Staff List shows the no-record notice", before > 0, `${before} people`);
await shot(a, "issue11-list-before");

// 11b: Add staff record for Naresh Kumar (frontdesk) opens Add Staff prefilled.
// The first person in the notice (the run before linked Naresh Kumar, frontdesk).
const link = a.getByRole("link", { name: /^Add staff record for / }).first();
const hasLink = await link.isVisible().catch(() => false);
const who = hasLink ? (await link.getAttribute("aria-label")).replace("Add staff record for ", "") : "";
ok("11 'Add staff record' link", hasLink, who);
if (hasLink) {
  await link.click();
  await a.waitForURL(/\/staff-hr-management\/add\?login=/, { timeout: 30000 });
  await wait(2500);
  const name = await a.getByLabel("Full name").first().inputValue().catch(() => "");
  ok("11 name prefilled from the login", name === who, name);
  const phone = a.getByLabel(/^Phone/).first();
  if (!(await phone.inputValue().catch(() => ""))) await phone.fill("9123499001");
  await shot(a, "issue11-add-step1");
  await a.getByRole("button", { name: /^Next/ }).first().click();
  await wait(3000);
  // The linked login's own phone is never a duplicate (unit test). The local seed has a SECOND login, "reception",
  // also Naresh Kumar with the same phone, so here the warning is right; tick "different person" and go on.
  if (await a.getByText("This may be someone already on file").isVisible().catch(() => false)) {
    console.log("note: duplicate warning shown:", (await mainText(a, 3000)).match(/This (phone|email) belongs[^\n]*/)?.[0]);
    await a.getByLabel("It is a different person. Save anyway.").check();
    await a.getByRole("button", { name: /^Next/ }).first().click();
    await wait(3000);
  }
  const step2 = await mainText(a, 3000);
  ok("11 step 2 says they already have a login", /They already have a login/.test(step2), (step2.match(/[^\n]*linked to the login[^\n]*/) ?? ["(not found)"])[0].slice(0, 200));
  ok("11 step 2 has no 'Give a login' box", !(await a.getByLabel("Give a login to School OS").isVisible().catch(() => false)));
  await shot(a, "issue11-add-step2");
  await a.getByRole("button", { name: /^Next/ }).first().click();
  await wait(1500);
  const save = a.getByRole("button", { name: /Add staff|Save|Create/ }).last();
  await save.click();
  await wait(6000);
  const done = await mainText(a, 3000);
  ok("11 saved, summary shows the existing login", /is now on the staff/.test(done) && !/No login/.test(done), done.replace(/\n/g, " | ").slice(0, 250));
  ok("11 no stale 'already belongs' warning after saving", !/already belongs to/.test(done));
  await shot(a, "issue11-add-done");

  await go(a, "/staff-hr-management");
  await wait(2000);
  const after = count(await mainText(a, 4000));
  ok("11 notice count went down by one", after === before - 1, `${before} -> ${after}`);
  ok("11 they are gone from the notice", !(await a.getByRole("link", { name: `Add staff record for ${who}` }).isVisible().catch(() => false)));
  await shot(a, "issue11-list-after");
}

// 32: refund sheet closes after "Send for approval".
const ac = await asUser("accountant");
await go(ac, "/fee-management/concessions?tab=refunds&do=refund&student=8b575761-8012-4b2b-8692-9e3a084afcac");
await wait(2500);
const sheet = ac.getByRole("dialog");
const open1 = await sheet.isVisible().catch(() => false);
ok("32 refund sheet opens", open1);
if (open1) {
  await sheet.getByLabel("Amount").first().fill("1");
  await sheet.getByLabel("Reason").first().fill("QA recheck of issue 32: one rupee test refund");
  await shot(ac, "issue32-before-send");
  await sheet.getByRole("button", { name: /Send for approval|Send|Save/ }).last().click();
  await wait(5000);
  const still = await ac.getByRole("dialog").isVisible().catch(() => false);
  const page = await mainText(ac, 3000);
  ok("32 sheet closed after sending", !still, ac.url());
  ok("32 page says the refund went for approval", /refund/i.test(page) && /(approval|Principal|sent)/i.test(page), (page.match(/[^\n]*[Rr]efund[^\n]*/) ?? [""])[0].slice(0, 200));
  await shot(ac, "issue32-after-send");
}

await close();
const failed = R.filter((r) => !r.pass);
console.log(`\n${R.length - failed.length} of ${R.length} pass`);
process.exit(failed.length ? 1 : 0);
