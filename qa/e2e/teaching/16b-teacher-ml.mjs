// Teacher marks Tanvi ML on the sent-back paper with the number keys and submits again (phone).
import { as, visit, text, VIEWPORTS, sleep, messages, shot } from "./h.mjs";
import { close } from "../../lib.mjs";
const MARKS = "/examination-results/marks/31218111-601c-49d2-b3b9-c8cbdf28bd7c/b07ca58e-2716-4729-ab56-3cdf783e5598";
const t = await as("teacher", VIEWPORTS.phone390);
await visit(t, MARKS, 2000);
const grid = t.getByText("Grid", { exact: true });
console.log("Grid control:", await grid.evaluate((e) => `${e.tagName} role=${e.getAttribute("role")} parent=${e.parentElement?.tagName} prole=${e.parentElement?.getAttribute("role")}`).catch(() => "none"));
await t.getByRole("group", { name: "Number keys" }).getByRole("button", { name: "ML", exact: true }).click(); await sleep(2500);
console.log((await text(t, 600)));
await t.getByRole("button", { name: "Submit marks" }).click(); await sleep(1500);
const dlg = t.getByRole("dialog");
console.log("confirm:", (await dlg.innerText()).replace(/\s+/g, " ").slice(0, 300));
await dlg.getByRole("button", { name: /^Submit \d+ marks/ }).click(); await sleep(3500);
console.log("resubmit ->", await messages(t));
await close();
