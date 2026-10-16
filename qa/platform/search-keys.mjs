// Ctrl+K search by keyboard: type a name, wait for results, Arrow keys and Enter.
//   node qa/platform/search-keys.mjs [login] [words]
import { close, BASE, shot } from "../lib.mjs";
import { as } from "./util.mjs";
const [login = "cems.admin", q = "Harini"] = process.argv.slice(2);
const p = await as(login);
await p.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2000);
await p.keyboard.press("Control+k");
await p.waitForTimeout(800);
await p.keyboard.type(q);
await p.locator("[role=dialog] [role=option], [role=dialog] a[href*='/student-management/']").first().waitFor({ timeout: 60000 }).catch(() => {});
const opts = await p.locator("[role=dialog] [role=option], [role=dialog] a").allInnerTexts();
console.log("results:", opts.slice(0, 6).map((t) => t.replace(/\s+/g, " ")));
const input = await p.evaluate(() => { const i = document.activeElement; return { role: i?.getAttribute("role"), controls: i?.getAttribute("aria-controls"), active: i?.getAttribute("aria-activedescendant") }; });
console.log("input:", input);
await p.keyboard.press("ArrowDown");
await p.waitForTimeout(200);
console.log("after ArrowDown:", await p.evaluate(() => ({ focus: document.activeElement?.outerHTML.slice(0, 120), active: document.activeElement?.getAttribute("aria-activedescendant"), selected: document.querySelector("[aria-selected=true]")?.textContent?.slice(0, 60) })));
await p.keyboard.press("Enter");
await p.waitForURL(/student-management\/[0-9a-f-]{36}/, { timeout: 60000 }).catch(() => {});
console.log(/student-management\/[0-9a-f-]{36}/.test(p.url()) ? "PASS" : "FAIL", "Enter opens", p.url().replace(BASE, ""));
await shot(p, "search-keys", false);
await close();
