// Browser check of the 16-note leftovers (HANDOFF Next step 3): Add Staff and Datesheet keep a
// draft after a reload, and an invite says "sent" only when the provider took it.
//   MSYS_NO_PATHCONV=1 node qa/full/leftovers-check.mjs   (app on :3000 from the SSD build)
import { asUser, go, shot, close, mainText } from "./h.mjs";

const R = [];
const ok = (n, pass, note = "") => { R.push({ n, pass, note }); console.log(pass ? "PASS" : "FAIL", n, note); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const admin = await asUser("admin");

// 1. Add Staff: type a name and phone, reload, the draft comes back.
await go(admin, "/staff-hr-management/add");
await wait(1500);
await admin.getByLabel("Full name").first().fill("QA Draft Person");
await admin.getByLabel("Phone").first().fill("9000000777");
await wait(1500);
await admin.reload({ waitUntil: "load" });
await wait(2500);
const name = await admin.getByLabel("Full name").first().inputValue().catch(() => "");
const kept = await admin.getByText("Draft kept: what you typed last time.").first().isVisible().catch(() => false);
ok("Add Staff draft after reload", name === "QA Draft Person", `name="${name}", note shown: ${kept}`);
await shot(admin, "leftovers-add-staff-draft");

// 2. Invite: Settings > Users > new invite. Local provider is test mode, so it must NOT say "was sent".
await go(admin, "/settings/users/new");
await wait(1500);
const stamp = Date.now().toString().slice(-5);
await admin.getByLabel("Full name").first().fill(`QA Invite ${stamp}`);
await admin.getByLabel("Username").first().fill(`qainvite${stamp}`);
await admin.getByLabel("Phone").first().fill(`90000${stamp}`);
const role = admin.getByRole("checkbox").first();
if (await role.isVisible().catch(() => false)) await role.check().catch(() => {});
await admin.getByRole("button", { name: "Send invite" }).click();
await admin.waitForLoadState("networkidle").catch(() => {});
await wait(3000);
const after = await mainText(admin, 1500);
const saysSent = /was sent to them by/i.test(after);
const saysWhy = /on its way|not sent|test mode|could not be sent|not be sent|copy the link|share the link/i.test(after);
ok("Invite does not claim 'sent' in test mode", !saysSent && saysWhy, after.replace(/\n/g, " | ").slice(0, 400));
await shot(admin, "leftovers-invite");

// 3. Datesheet (Principal): type a title, reload, it comes back.
const pr = await asUser("principal");
await go(pr, "/examination-results/datesheet/new");
await wait(2000);
const title = pr.getByLabel("Title").first();
if (await title.isVisible().catch(() => false)) {
  await title.fill("QA Draft Exam");
  await wait(1500);
  await pr.reload({ waitUntil: "load" });
  await wait(2500);
  const t = await pr.getByLabel("Title").first().inputValue().catch(() => "");
  ok("Datesheet draft after reload", t === "QA Draft Exam", `title="${t}"`);
} else ok("Datesheet draft after reload", false, (await mainText(pr, 400)).replace(/\n/g, " | "));
await shot(pr, "leftovers-datesheet-draft");

console.log("\nSUMMARY", R.filter((r) => r.pass).length, "of", R.length, "passed");
await close();
