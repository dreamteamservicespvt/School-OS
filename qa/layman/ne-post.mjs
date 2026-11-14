// Self-test 14 Nov, flow 3 (HR): Add Staff refuses a missing post; Change post fixes a wrong one and the warning shrinks.
import { asRole, close, snap, sleep, mainText } from "./nc-h.mjs";
const out = [];
const go = async (p, path) => { await p.goto(new URL(path, p.url()).href); await p.waitForLoadState("networkidle").catch(() => {}); };
const count = async (p) => { const m = (await mainText(p, 6000)).match(/(\d+) people's posts may be wrong|(1) person's post may be wrong/); return m ? Number(m[1] ?? m[2]) : 0; };
const h = await asRole("hr");

// 1. Add Staff with no post chosen.
await go(h, "/staff-hr-management/add");
await h.getByLabel("Full name").waitFor({ timeout: 60000 });
await h.getByLabel("Full name").fill("QA Post Check");
await h.getByRole("textbox", { name: "Phone" }).fill("9390011378");
await h.getByRole("button", { name: /^Next/ }).first().click();
await sleep(3000);
const t1 = await mainText(h, 6000);
out.push(`Add Staff with no post: stays on step 1 = ${/Designation/.test(t1) && !/Pick one or more/.test(t1)}; message = ${(t1.match(/[^\n]*[Dd]esignation[^\n]*(choose|Choose|required|list)[^\n]*/) ?? ["(no designation message)"])[0].slice(0, 140)}`);
await snap(h, "e2e-addstaff-nopost", false);

// 2. Staff List warning, then Change post for Naresh Kumar (Receptionist login).
await go(h, "/staff-hr-management");
const before = await count(h);
out.push(`warning before: ${before}`);
await h.getByRole("link", { name: "Change the post of Naresh Kumar" }).click();
const dlg = h.getByRole("dialog", { name: /Employment/ });
await dlg.waitFor({ timeout: 60000 });
const sel = dlg.getByLabel("Designation");
const opts = await sel.locator("option").allInnerTexts();
const pick = opts.find((o) => /recept|front office/i.test(o));
out.push(`Employment edit opened; a reception post exists: ${pick ?? "no (only " + opts.slice(0, 12).join(", ") + ")"}`);
if (pick) {
  await sel.selectOption({ label: pick });
  await dlg.getByRole("button", { name: "Save employment" }).click();
  await sleep(4000);
  await go(h, "/staff-hr-management");
  out.push(`warning after changing Naresh to ${pick}: ${await count(h)}`);
}
await snap(h, "e2e-post-after", false);
await h.context().close();
console.log(out.join("\n"));
await close();
