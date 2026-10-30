// Journey E1, part 6: the Principal decides on an application on Admission Decision.
//   MSYS_NO_PATHCONV=1 node qa/full/j1f-decide.mjs <applicationId> [buttonInCard] [confirmButton] [remark]
import { as } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const [APP, btn, confirm, remark] = process.argv.slice(2);
const p = await as("principal");
await go(p, `/admission-management/decision?focus=${APP}`);
const card = p.locator("main article, main li, main [data-slot=card]").filter({ has: p.locator(`a[href$="${APP}"]`) }).first();
console.log("CARD BUTTONS", (await card.locator("button").allInnerTexts()).join(" | "));
if (btn) {
  await card.getByRole("button", { name: btn, exact: true }).click();
  await p.waitForTimeout(1200);
  const d = p.getByRole("dialog").last();
  console.log("DIALOG", (await d.innerText().catch(() => "")).replace(/\n+/g, " | ").slice(0, 900));
  if (remark) { const t = d.locator("textarea").first(); if (await t.count()) await t.pressSequentially(remark, { delay: 3 }); }
  if (confirm) {
    const b = d.getByRole("button", { name: confirm, exact: true });
    for (let i = 0; i < 2; i++) await b.click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(3000);
    console.log("AFTER", (await mainText(p, 900)).replace(/\n+/g, " | "));
    console.log("DIALOG2", (await p.getByRole("dialog").last().innerText().catch(() => "")).replace(/\n+/g, " | ").slice(0, 600));
  }
}
await shot(p, `j1f-${(btn ?? "look").replace(/\W+/g, "_")}`, false);
if (p.problems.length) console.log("PROBLEMS", p.problems);
await close();
