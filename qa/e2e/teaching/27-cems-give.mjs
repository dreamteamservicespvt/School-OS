// CEMS: the class teacher's only class has no students. What does Give homework do?
import { as, visit, VIEWPORTS, sleep, text, shot, report } from "./h.mjs";
import { close } from "../../lib.mjs";
const t = await as("cems.classteacher", VIEWPORTS.phone390);
await visit(t, "/homework-learning", 1500);
await t.getByRole("link", { name: /Give homework/ }).or(t.getByRole("button", { name: /Give homework/ })).first().click(); await sleep(1500);
console.log((await text(t, 1500)));
const d = t.getByRole("dialog");
console.log("dialog:", (await d.innerText().catch(() => "none")).replace(/\s+/g, " ").slice(0, 600));
await shot(t, "cems-give-homework", false);
await report(t, "cems give");
await close();
