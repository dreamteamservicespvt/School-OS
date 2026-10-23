// Fee Reports: collection details and cancelled payments, looking at Rithvik's rows.
import { as, visit, text, shot, note, squeeze } from "./h.mjs";
import { close } from "../../lib.mjs";
const page = await as("accountant");
await visit(page, "/fee-management/reports", 2500);
const links = await page.getByRole("link").evaluateAll((as) => as.map((a) => [a.innerText.replace(/\s+/g, " ").slice(0, 40), a.getAttribute("href")]).filter(([t, h]) => /report=|r=|\/reports\?/.test(h ?? "")));
note("links:", JSON.stringify(links.slice(0, 25)));
for (const [name, href] of links.filter(([t]) => /Collection details|Cancelled|Discount|Refund report/.test(t))) {
  await visit(page, href, 2500);
  const t = await text(page, 20000);
  note(`${name}:`, (t.match(/.{0,30}(Rithvik Varma|Charan Menon|Manish Mehta).{0,160}/g) ?? ["(none)"]).slice(0, 4).join(" || "));
  await shot(page, `feereport-${name.replace(/\W+/g, "_").slice(0, 20)}`);
}
note("problems", JSON.stringify(page.problems));
await close();
