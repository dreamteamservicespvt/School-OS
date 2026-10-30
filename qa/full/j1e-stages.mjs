// Journey E1, part 5: clicks a stage button on the application and confirms it in its dialog.
//   MSYS_NO_PATHCONV=1 node qa/full/j1e-stages.mjs <login> <applicationId> "Button" ["Confirm button"]
import { as } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const [login, APP, btn, confirm] = process.argv.slice(2);
const p = await as(login);
await go(p, `/admission-management/applications/${APP}`);
await p.locator("main").getByRole("button", { name: btn, exact: true }).click();
await p.waitForTimeout(1200);
const d = p.getByRole("dialog").last();
if (await d.count()) {
  const b = d.getByRole("button", { name: confirm ?? btn, exact: true });
  for (let i = 0; i < 2; i++) await b.click({ timeout: 3000 }).catch(() => {}); // double click on purpose
  await p.waitForTimeout(3000);
}
console.log((await mainText(p, 900)).replace(/\n+/g, " | "));
console.log("BUTTONS", (await p.locator("main button").allInnerTexts()).map((x) => x.trim()).filter(Boolean).join(" | "));
await shot(p, `j1e-${btn.replace(/\W+/g, "_")}`, false);
if (p.problems.length) console.log("PROBLEMS", p.problems);
await close();
