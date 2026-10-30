// Opens an address whose dialog is already open (…&do=…), presses its confirm button twice on purpose, prints the result.
//   MSYS_NO_PATHCONV=1 node qa/full/dlg.mjs <login> <path> "<confirm button regex>"
import { as } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const [login, url, confirm] = process.argv.slice(2);
const p = await as(login);
await go(p, url);
const d = p.getByRole("dialog").last();
const b = d.getByRole("button", { name: new RegExp(confirm) }).last();
await b.click(); await b.click({ timeout: 800 }).catch(() => {});
await p.waitForTimeout(5000);
console.log("DIALOG AFTER", (await p.getByRole("dialog").last().innerText().catch(() => "(none)")).replace(/\n+/g, " | ").slice(0, 400));
console.log("AFTER", (await mainText(p, 1200)).replace(/\n+/g, " | ").slice(0, 1200));
await shot(p, `dlg-${login}-${confirm.replace(/\W+/g, "_")}`, false);
if (p.problems.length) console.log("PROBLEMS", p.problems);
await close();
