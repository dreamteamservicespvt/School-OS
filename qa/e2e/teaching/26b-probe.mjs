import { as, visit, VIEWPORTS, sleep, messages, sql, SUNRISE } from "./h.mjs";
import { close } from "../../lib.mjs";
const p = await as("principal", VIEWPORTS.laptop1280);
await visit(p, "/reports-analytics/early-warnings", 2000);
const cards = await p.evaluate(() => [...document.querySelectorAll("button")].filter((b) => /^(Not a concern|Add for review|Make it a task)$/.test(b.textContent.trim())).map((b, i) => { b.setAttribute("data-qa-i", String(i)); let a = b.parentElement; while (a && !/Suggestion/.test(a.textContent)) a = a.parentElement; return `${i} ${b.textContent.trim()} vis=${!!b.offsetParent} | ${(a?.textContent ?? "").replace(/\s+/g, " ").slice(0, 70)}`; }));
console.log(cards.join("\n"));
const pick = (re, btn) => cards.find((c) => re.test(c) && c.includes(btn))?.split(" ")[0];
for (const [re, btn] of [[/Class 2 may do worse/, "Not a concern"], [/Vihaan Varma \(Class 1 B\) may be thinking/, "Not a concern"], [/Harini Mishra \(Class 1 A\) may end the year/, "Add for review"]]) {
  const i = pick(re, btn);
  if (i === undefined) { console.log("not found", re); continue; }
  await p.locator(`[data-qa-i="${i}"]`).click(); await sleep(2500);
  console.log(`${re} ${btn} ->`, await messages(p));
}
console.log("signals now:", sql(`select left(title,60), archived_at is not null from forecast_signal where school_id='${SUNRISE}' and (title like 'Class 2 may%' or title like 'Vihaan%' or title like 'Harini%')`));
await close();
