// Layman A recheck: emoji-only child name, past follow-up date, bad email: are they refused?
import { asRole, go, mainText, sleep, close, snap } from "../full/selftest-A-h.mjs";
const p = await asRole("admin");
const S = Date.now().toString().slice(-5);
const dlg = () => p.getByRole("dialog", { name: "Add enquiry" });
const f = (n) => dlg().locator(`[name=${n}]`);
const msgs = async () => (await dlg().innerText().catch(() => "")).split("\n").filter((l) => /needed|valid|must|cannot|can.t|digits|Check|Pick|letters|past|before|after|email/i.test(l) && l.length < 160 && !/^(Kept as|Set by|We check)/.test(l));
await go(p, "/admission-management/enquiries"); await sleep(800);
await p.getByRole("button", { name: "Add enquiry" }).click(); await sleep(1000);
await f("childName").fill("😀😀");
await f("parentName").fill("LA-emoji test " + S);
await f("phone").fill("93900" + S); await p.keyboard.press("Tab"); await sleep(800);
await f("classId").selectOption({ index: 3 }); await sleep(300);
if (!(await f("ownerStaffId").inputValue())) await f("ownerStaffId").selectOption({ index: 1 });
const d = dlg().locator("input[id$=-d]"); await d.fill(""); await d.pressSequentially("01-01-2020", { delay: 15 }); await p.keyboard.press("Tab");
await dlg().getByRole("button", { name: "More details" }).click().catch(() => {}); await sleep(300);
await f("email").fill("not-an-email");
await dlg().getByRole("button", { name: /^Add enquiry/ }).click(); await sleep(3500);
console.log("open?", await dlg().isVisible().catch(() => false), "msgs", JSON.stringify(await msgs()));
await snap(p, "enq3-after", false);
if (await dlg().isVisible().catch(() => false)) {
  await f("email").fill(""); await dlg().getByRole("button", { name: /^Add enquiry/ }).click(); await sleep(3500);
  console.log("no email: open?", await dlg().isVisible().catch(() => false), "msgs", JSON.stringify(await msgs()));
}
await go(p, `/admission-management/enquiries?q=${S}`); await sleep(1200);
const t = await mainText(p, 4000); console.log("LIST", t.slice(t.indexOf("Open |") > 0 ? t.indexOf("Open |") : t.indexOf("Enquiries\n\tChild"), t.indexOf("Showing") + 20).replace(/\n/g, " | ").slice(0, 600));
await close();
