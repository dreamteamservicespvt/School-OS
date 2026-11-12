// Layman B: one advance with a negative amount; watch the button for 60 s.
import { asRole, go, mainText, sleep, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("accountant");
const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 200)); });
p.on("response", (r) => { if (r.request().method() === "POST") console.log("POST", r.status(), r.url().slice(-60)); });
const dlg = () => p.getByRole("dialog").last();
const amtV = process.argv[2] ?? "-5000", eachV = process.argv[3] ?? "500";
await go(p, "/salary-management/advances"); await sleep(1500);
await p.getByRole("button", { name: /Give advance or loan/ }).or(p.getByRole("link", { name: /Give advance or loan/ })).first().click({ timeout: 90000 }); await sleep(2500);
await dlg().getByLabel(/Staff member/).selectOption({ label: "Saroja Devi · Attendant" });
await dlg().getByLabel(/^Amount/).first().fill(amtV); await dlg().getByLabel(/Recover each month/).fill(eachV);
await dlg().getByLabel(/Reason/).fill("LB- layman negative test");
const b = dlg().getByRole("button", { name: /Send for approval|Sending/ });
await b.click(); const t0 = Date.now();
for (let i = 0; i < 60; i++) { const t = await b.innerText().catch(() => "gone"); if (!/Sending/.test(t)) break; await sleep(1000); }
console.log("after", Math.round((Date.now() - t0) / 1000), "s button:", await b.innerText().catch(() => "gone"), "| open:", await dlg().isVisible().catch(() => false));
console.log("sheet text:", (await dlg().innerText().catch(() => "")).split(/\n/).filter((l) => /must|more than|cannot|Enter|least|Choose|over|limit/i.test(l)).join(" || "));
await snap(p, `sal-adv-${amtV}`, false);
console.log("PAGE ERRS", errs.join(" ; "));
process.exit(0);
