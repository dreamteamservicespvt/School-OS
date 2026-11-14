// Self-test 14 Nov, flow 2 (Accountant): add a component, give it to one person with DA/HRA off (Revise),
// check the saved gross, then remove the component in Salary Settings and check it left the structure.
import { asRole, close, snap, sleep, mainText } from "./nc-h.mjs";
const out = [];
const go = async (p, path) => { await p.goto(new URL(path, p.url()).href); await p.waitForLoadState("networkidle").catch(() => {}); };
const comp = `QA allowance ${Date.now() % 10000}`;
const a = await asRole("accountant");

// 1. Add a fixed earning in Salary Settings.
await go(a, "/salary-management/settings?do=component");
const add = a.getByRole("dialog");
await add.waitFor({ timeout: 60000 });
await add.getByLabel("Name").fill(comp);
await add.getByRole("button", { name: "Add component" }).click();
await sleep(4000);
out.push(`component added: ${(await mainText(a, 4000)).includes(comp)}`);

// 2. Revise Ravi Teja: basic 35,000, the new allowance 1,000, DA and HRA off.
await go(a, "/salary-management/structures?q=ravi");
await sleep(1500);
await a.locator("a[href*=\"open=\"]").first().click();
await a.getByRole("link", { name: "Revise" }).first().click();
const rv = a.getByRole("dialog").filter({ hasText: "Revise" });
await rv.getByLabel("Basic pay").waitFor({ timeout: 60000 });
await rv.getByLabel("Basic pay").fill("35000");
for (const l of ["Conveyance", "Special allowance"]) await rv.getByLabel(l).fill("").catch(() => {});
await rv.getByLabel(comp).fill("1000");
for (const sw of [/Dearness allowance/, /House rent allowance/]) {
  const s = rv.getByRole("switch", { name: sw });
  if ((await s.getAttribute("aria-checked")) === "true") await s.click();
}
await sleep(500);
const shown = ((await rv.innerText()).match(/Gross:\s*₹([\d,]+)/) ?? [])[1];
out.push(`revise form gross with DA/HRA off = ₹${shown}`);
await rv.getByLabel("Reason").fill("QA self-test: DA and HRA off");
await snap(a, "e2e-salary-revise", false);
await rv.getByRole("button", { name: "Save new version" }).click();
await sleep(5000);
let txt = await mainText(a, 6000);
out.push(`saved message: ${(txt.match(/New version for Ravi Teja[^.]*\./) ?? ["(none)"])[0]}`);

// 3. Remove the component in Settings: it should leave Ravi's structure from the first open month.
await go(a, "/salary-management/settings");
await a.getByRole("link", { name: `Archive ${comp}` }).first().click().catch(async () => a.getByRole("button", { name: `Archive ${comp}` }).first().click());
const cf = a.getByRole("dialog");
await cf.waitFor({ timeout: 60000 });
out.push(`confirm text: ${(await cf.innerText()).replace(/\n+/g, " | ").slice(0, 220)}`);
await cf.getByRole("button", { name: "Archive component" }).click();
await sleep(5000);
txt = await mainText(a, 6000);
out.push(`removed message: ${(txt.match(new RegExp(`${comp} removed[^]*?(recalculate it\\.|used it\\.)`)) ?? ["(none)"])[0].replace(/\n+/g, " ")}`);
await snap(a, "e2e-salary-removed", false);

// 4. Ravi's current structure no longer has it.
await go(a, "/salary-management/structures?q=ravi");
await sleep(1500);
await a.locator("a[href*=\"open=\"]").first().click();
await sleep(2500);
const sheet = await a.getByRole("dialog").innerText().catch(() => "");
out.push(`Ravi's structure still lists ${comp}: ${sheet.includes(comp)}; header: ${sheet.split("\n").slice(0, 3).join(" | ")}`);
await snap(a, "e2e-salary-after", false);
await a.context().close();
console.log(out.join("\n"));
await close();
