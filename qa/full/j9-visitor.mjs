// Journey E9: the Receptionist registers a visitor (wrong phone first), makes a pass, then signs them out.
import { as } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const rec = (c, pass, note = "") => console.log(`${pass ? "PASS" : "FAIL"} ${c}${note ? " :: " + note : ""}`);
const p = await as("reception");
async function fill(phone) {
  await go(p, "/front-office?do=visitor");
  const d = p.getByRole("dialog").last();
  await d.locator("#vs-phone").fill(phone);
  await d.locator("#vs-name").fill("Ramesh Babu");
  await d.locator("#vs-purpose").selectOption({ label: "Meeting" });
  await d.locator("#vs-meet").selectOption({ index: 1 });
  const b = d.getByRole("button", { name: "Register and make pass" });
  await b.click(); await b.click({ timeout: 800 }).catch(() => {});
  await p.waitForTimeout(3500);
  return d;
}
let d = await fill("12345");
const bad = (await d.innerText().catch(() => "")).replace(/\n+/g, " | ");
rec("Wrong phone refused", /phone|mobile|10 digits|digits/i.test(bad), bad.match(/[^|]*(10|digit|mobile|valid)[^|]*/i)?.[0]);
d = await fill("9849011122");
const after = (await mainText(p, 2500)).replace(/\n+/g, " | ");
console.log("AFTER:", (await p.getByRole("dialog").last().innerText().catch(() => "")).replace(/\n+/g, " | ").slice(0, 500), "||", after.match(/In the building now.{0,80}/)?.[0]);
await go(p, "/front-office/visitors?status=In");
const inList = (await mainText(p, 4000)).replace(/\n+/g, " | ");
const count = (inList.match(/Ramesh Babu/g) ?? []).length;
rec("Visitor in the building once (double click made one)", count === 1, `${count} rows`);
const out = p.locator("main").getByRole("button", { name: /Sign out|Out|Check out/ }).first();
console.log("ROW BUTTONS", await p.locator("main button").allInnerTexts());
if (await out.count()) { await out.click(); await p.waitForTimeout(1500); const dd = p.getByRole("dialog").last(); if (await dd.count()) { const c = dd.getByRole("button", { name: /Sign out|Out|Confirm|Check out/ }).last(); await c.click(); } await p.waitForTimeout(3000); }
await go(p, "/front-office/visitors?status=In");
rec("Visitor signed out", !(await mainText(p, 4000)).includes("Ramesh Babu"));
await shot(p, "j9-visitors", false);
console.log("PROBLEMS", p.problems);
await close();
