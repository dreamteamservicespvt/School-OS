// Opens a page as someone, clicks a button, confirms its dialog with the named button (twice, on purpose), prints the result.
//   MSYS_NO_PATHCONV=1 node qa/full/click.mjs <login> <path> "<button>" ["<confirm button regex>"] ["<text for first textarea>"]
import { as } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const [login, url, btn, confirm, note] = process.argv.slice(2);
const p = await as(login);
await go(p, url);
await p.locator("main").getByRole("button", { name: btn, exact: true }).first().click();
await p.waitForTimeout(1500);
const d = p.getByRole("dialog").last();
if (await d.count()) {
  console.log("DIALOG", (await d.innerText()).replace(/\n+/g, " | ").slice(0, 900));
  if (note) { const t = d.locator("textarea").first(); if (await t.count()) await t.fill(note); }
  if (confirm) { const b = d.getByRole("button", { name: new RegExp(confirm) }).last(); await b.click(); await b.click({ timeout: 800 }).catch(() => {}); }
}
await p.waitForTimeout(4000);
console.log("DIALOG AFTER", (await p.getByRole("dialog").last().innerText().catch(() => "(none)")).replace(/\n+/g, " | ").slice(0, 400));
console.log("AFTER", (await mainText(p, 1500)).replace(/\n+/g, " | ").slice(0, 1500));
await shot(p, `click-${login}-${btn.replace(/\W+/g, "_")}`, false);
if (p.problems.length) console.log("PROBLEMS", p.problems);
await close();
