// 14 Nov: (1) Accountant: DA/HRA switches on Add/Revise structure, gross follows them. (2) HR: Staff List warns
// about posts that do not fit the role (Add Staff once chose "Teacher" for everyone); Add Staff has no post chosen.
import { asRole, close, snap, sleep, mainText } from "./nc-h.mjs";
const out = [];
const open = async (p, path) => { await p.goto(new URL(path, p.url()).href); await p.waitForLoadState("networkidle").catch(() => {}); };

for (const [vp, tag] of [[{ width: 1440, height: 900 }, "1440"], [{ width: 390, height: 844 }, "390"]]) {
  const a = await asRole("accountant", vp);
  await open(a, "/salary-management/structures");
  await a.getByRole("link", { name: "Add structure" }).first().click();
  const sw = a.getByRole("switch", { name: /House rent allowance/ });
  await sw.waitFor({ timeout: 45000 }).catch(() => {});
  out.push(`${tag} accountant: HRA switch shown = ${await sw.isVisible().catch(() => false)}, DA switch = ${await a.getByRole("switch", { name: /Dearness allowance/ }).isVisible().catch(() => false)}`);
  const basic = a.getByLabel("Basic pay").first();
  await basic.fill("35000").catch(() => {});
  await sleep(400);
  const grossOf = async () => ((await mainText(a, 20000)).match(/Gross:\s*₹([\d,]+)/) ?? [])[1];
  out.push(`${tag} accountant: gross with DA+HRA on = ₹${await grossOf()}`);
  await a.getByRole("switch", { name: /House rent allowance/ }).click().catch(() => {});
  await a.getByRole("switch", { name: /Dearness allowance/ }).click().catch(() => {});
  await sleep(400);
  out.push(`${tag} accountant: gross with both off = ₹${await grossOf()}`);
  await snap(a, `salary-switches-${tag}`, false);
  await a.context().close();

  const h = await asRole("hr", vp);
  await open(h, "/staff-hr-management");
  await sleep(1500);
  const t = await mainText(h, 4000);
  const m = t.match(/(\d+ people's posts may be wrong|1 person's post may be wrong)/);
  out.push(`${tag} hr: staff list warning = ${m ? m[1] : "none shown"}`);
  if (m) out.push("  " + (t.slice(t.indexOf(m[1]), t.indexOf(m[1]) + 400).replace(/\n+/g, " | ")));
  await snap(h, `staff-post-warning-${tag}`, false);
  await open(h, "/staff-hr-management/add");
  const des = h.getByLabel("Designation");
  await des.waitFor({ timeout: 30000 }).catch(() => {});
  out.push(`${tag} hr: Add Staff post chosen at start = "${await des.inputValue().catch(() => "?")}"`);
  await h.context().close();
}
console.log(out.join("\n"));
await close();
