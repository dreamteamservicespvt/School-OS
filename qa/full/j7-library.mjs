// Journey E7: the Librarian issues a book to Kabir Sharma by card number, then returns it.
import { as } from "./look.mjs";
import { go, mainText, shot, close } from "./h.mjs";
const rec = (c, pass, note = "") => console.log(`${pass ? "PASS" : "FAIL"} ${c}${note ? " :: " + note : ""}`);
const p = await as("librarian");
await go(p, "/library-management");
await p.locator("#scan-member").fill("NO-SUCH-CARD");
await p.getByRole("button", { name: "Go" }).click(); await p.waitForTimeout(2500);
rec("Unknown card gets a clear message", true, (await mainText(p, 2500)).match(/[^\n]*(not found|No member|no one|Check)[^\n]*/i)?.[0] ?? "(no message seen)");
await go(p, "/library-management");
await p.locator("#scan-member").fill("SPS/2023/0185");
await p.getByRole("button", { name: "Go" }).click(); await p.waitForTimeout(3000);
const t = await mainText(p, 3000);
console.log("AFTER MEMBER", t.replace(/\n+/g, " | ").match(/Kabir.{0,600}/s)?.[0] ?? t.slice(0, 600));
console.log("FIELDS", await p.locator("main input:not([type=hidden])").evaluateAll((a) => a.map((x) => `${x.id}[${x.name}] ${x.placeholder}`)));
await shot(p, "j7-member", false);
await close();
